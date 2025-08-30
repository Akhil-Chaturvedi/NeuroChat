# main.py

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

# NEW: Import the router from our new importer file
from chat.importer import router as import_router
# NEW: Import the task_statuses from the new state file
from chat.state import task_statuses

# Your original imports are preserved
from chat.chat_manager import (
    list_chats, get_chat_by_id, create_chat_session, 
    generate_chat_id, rename_chat_session, delete_chat_session,
    archive_chat_session, list_archived_chats, set_chat_model,
    list_all_sources
)
from memory.memory_store import query_unified_memory, save_to_memory
from chat.ai_services import initialize_client, get_available_models, get_ai_response
from chat.data_processor import process_and_store_file

import uuid
import uvicorn
import os
from datetime import datetime

app = FastAPI()

# --- Pydantic Models ---
class ApiKeyRequest(BaseModel):
    api_key: str

class MessageRequest(BaseModel):
    text: str
    model: str
    source_ids: Optional[List[str]] = None

class RenameRequest(BaseModel):
    new_title: str

class SetModelRequest(BaseModel):
    model: str

# --- App Setup ---
app.mount("/static", StaticFiles(directory="frontend"), name="static")
os.makedirs("storage/media", exist_ok=True)
app.mount("/media", StaticFiles(directory="storage/media"), name="media")

# NEW: Include the router from chat/importer.py
app.include_router(import_router)

# --- Core Endpoints ---
@app.get("/", response_class=HTMLResponse)
def index():
    with open("frontend/index.html", "r", encoding='utf-8') as f:
        return f.read()

@app.get("/upload-status/{task_id}")
async def get_upload_status(task_id: str):
    status = task_statuses.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return JSONResponse(content=status)


# --- Knowledge Source Endpoints (for RAG) ---
@app.post("/sources/upload")
async def upload_knowledge_file(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    if not file.filename.lower().endswith(('.txt', '.md')):
        raise HTTPException(status_code=400, detail="Only .txt and .md files are supported.")
    
    try:
        content_bytes = await file.read()
        content = content_bytes.decode('utf-8')
        background_tasks.add_task(process_and_store_file, content, file.filename)
        return JSONResponse(
            content={"message": f"File '{file.filename}' received and will be processed."},
            status_code=202
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@app.get("/sources")
def get_all_sources():
    return list_all_sources()

# --- AI Configuration Endpoints ---
@app.post("/config/api-key")
def verify_api_key(request: ApiKeyRequest):
    success = initialize_client(request.api_key)
    if not success:
        raise HTTPException(status_code=401, detail="Invalid API Key or connection failed.")
    return {"models": get_available_models()}

@app.get("/config/models")
def list_models():
    models = get_available_models()
    if not models:
        raise HTTPException(status_code=404, detail="API Key not verified.")
    return {"models": models}

# --- Chat Interaction Endpoints ---
@app.post("/chat/{chat_id}/message")
def post_message(chat_id: str, message: MessageRequest):
    save_to_memory(text=message.text, chat_id=chat_id, role="user")

    relevant_chunks = query_unified_memory(message.text, source_ids=message.source_ids)
    context = "\n---\n".join([chunk['document'] for chunk in relevant_chunks])
    
    augmented_prompt = (
        "You are an expert assistant. Use the following context to answer the user's question. "
        "Base your answer ONLY on the provided context. If the context does not contain the answer, "
        "state that you could not find the information.\n\n"
        f"CONTEXT:\n---\n{context}\n---\n\n"
        f"QUESTION: {message.text}"
    )
    
    chat_data = get_chat_by_id(chat_id, page=1, page_size=10)
    history = chat_data['messages_page']['messages']
    formatted_history = [{"role": msg['role'], "content": msg['text']} for msg in reversed(history)]
    formatted_history.append({"role": "user", "content": augmented_prompt})
    
    model_to_use = chat_data.get("model") or message.model
    ai_response_text = get_ai_response(formatted_history, model_to_use)

    save_to_memory(text=ai_response_text, chat_id=chat_id, role="assistant")
    
    if len(history) <= 1:
        set_chat_model(chat_id, model_to_use)

    return {"role": "assistant", "text": ai_response_text, "content_type": "text"}

@app.post("/chat/temporary")
def post_temporary_message(message: MessageRequest):
    formatted_message = [{"role": "user", "content": message.text}]
    ai_response_text = get_ai_response(formatted_message, message.model)
    return {"role": "assistant", "text": ai_response_text, "content_type": "text"}

# --- Chat Management Endpoints ---
@app.post("/chats", status_code=201)
def create_new_chat():
    timestamp = datetime.now().timestamp()
    title = f"New Chat - {datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M')}"
    chat_id = generate_chat_id(title, timestamp)
    create_chat_session(chat_id, title, timestamp)
    return {"id": chat_id, "title": title, "timestamp": timestamp}

@app.put("/chat/{chat_id}/rename")
def rename_chat(chat_id: str, request: RenameRequest):
    success = rename_chat_session(chat_id, request.new_title)
    if not success: raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": "Chat renamed successfully"}

@app.delete("/chat/{chat_id}", status_code=204)
def delete_chat(chat_id: str):
    success = delete_chat_session(chat_id)
    if not success: raise HTTPException(status_code=404, detail="Chat not found")
    return Response(status_code=204)

@app.post("/chat/{chat_id}/archive", status_code=200)
def archive_chat(chat_id: str):
    success = archive_chat_session(chat_id)
    if not success: raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": "Chat archived successfully"}
    
@app.post("/chat/{chat_id}/model")
def set_model_for_chat(chat_id: str, request: SetModelRequest):
    success = set_chat_model(chat_id, request.model)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": f"Model for chat {chat_id} set to {request.model}"}

@app.get("/chats")
def get_chats():
    return list_chats()

@app.get("/chats/archived")
def get_archived_chats():
    return list_archived_chats()

@app.get("/chat/{chat_id}")
def load_chat(chat_id: str, page: int = 1, page_size: int = 9999999999):
    chat_data = get_chat_by_id(chat_id, page=page, page_size=page_size)
    if not chat_data:
        raise HTTPException(status_code=404, detail=f"Chat with ID {chat_id} not found.")
    return chat_data

# --- Application Startup ---
if __name__ == "__main__":
    os.makedirs("storage/chroma", exist_ok=True)
    os.makedirs("storage/media", exist_ok=True)
    uvicorn.run("main:app", host="0.0.0.0", port=7860, reload=True)
