# In main.py

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Response
from dotenv import load_dotenv
load_dotenv()
from contextlib import asynccontextmanager
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

from chat.importer import router as import_router
from chat import state
from chat.state import task_statuses

from chat.chat_manager import (
    list_chats, get_chat_by_id, create_chat_session, 
    generate_chat_id, rename_chat_session, delete_chat_session,
    archive_chat_session, list_archived_chats, set_chat_model,
    list_all_sources, unarchive_chat_session
)
from memory.memory_store import query_unified_memory, save_to_memory
from chat.ai_services import initialize_client, get_available_models, get_ai_response
from chat.data_processor import process_and_store_file

import uuid
import uvicorn
import os
from datetime import datetime

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Application startup complete. Waiting for frontend configuration.")
    yield
    print("Application shutdown.")

app = FastAPI(lifespan=lifespan)

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

@app.post("/sources/upload")
async def upload_knowledge_file(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    if not file.filename.lower().endswith(('.txt', '.md')):
        raise HTTPException(status_code=400, detail="Only .txt and .md files are supported.")
    try:
        content_bytes = await file.read()
        content = content_bytes.decode('utf-8')
        background_tasks.add_task(process_and_store_file, content, file.filename)
        return JSONResponse(content={"message": f"File '{file.filename}' received and will be processed."}, status_code=202)
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

@app.get("/config/status")
def get_config_status():
    api_key_env = os.getenv("OPENROUTER_API_KEY")
    if api_key_env:
        return {
            "default_api_key": api_key_env,
            "initialized": False
        }
    else:
        return {"default_api_key": None, "initialized": False}

# --- HELPER FUNCTIONS FOR CHAT INTERACTION ---
def save_conversation_turn_in_background(
    chat_id: str,
    user_text: str,
    assistant_text: str,
    is_first_turn: bool,
    model_used: str
):
    """This function runs in the background to save the conversation turn to memory."""
    print(f"Background task: Saving turn for chat {chat_id}")
    try:
        save_to_memory(text=user_text, chat_id=chat_id, role="user")
        save_to_memory(text=assistant_text, chat_id=chat_id, role="assistant", model_slug=model_used)
        if is_first_turn:
            set_chat_model(chat_id, model_used)
        print(f"Background task: Finished saving turn for chat {chat_id}")
    except Exception as e:
        print(f"!!! Background task FAILED for chat {chat_id}: {e}")
        
def is_query_search_worthy(text: str) -> bool:
    """
    Determines if a query is meaningful enough to warrant a memory search.
    """
    stopwords = {
        'hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'cool',
        'got it', 'bye', 'goodbye', 'a', 'an', 'the', 'is', 'are', 'was', 'were'
    }
    words = text.lower().strip().split()
    for word in words:
        if word not in stopwords:
            return True
    return False

# --- [NEW HELPER FUNCTION ADDED] ---
def filter_relevant_chunks(query: str, chunks: list[dict]) -> list[dict]:
    """
    Uses a fast LLM to screen chunks for relevance before final generation.
    """
    if not chunks:
        return []

    print(f"Screening {len(chunks)} retrieved chunks for relevance...")
    relevant_chunks = []
    screening_model = "llama3-8b-8192" # Use a fast, cheap model

    for chunk in chunks:
        screening_prompt = (
            f"The user wants to know about: '{query}'.\n\n"
            f"Is the following text snippet relevant to answering that question? "
            f"Answer with a single word: YES or NO.\n\n"
            f"SNIPPET:\n---\n{chunk['document']}\n---"
        )
        try:
            response = get_ai_response(
                messages=[{"role": "user", "content": screening_prompt}],
                model=screening_model
            )
            if "yes" in response.lower():
                print(f"  -> Chunk from '{chunk['metadata'].get('source_name', 'N/A')}' is RELEVANT.")
                relevant_chunks.append(chunk)
            else:
                print(f"  -> Chunk from '{chunk['metadata'].get('source_name', 'N/A')}' is IRRELEVANT. Discarding.")
        except Exception as e:
            print(f"  -> Error during relevance screening: {e}")
            continue
            
    return relevant_chunks

# --- [ENDPOINT REPLACED WITH NEW LOGIC] ---
@app.post("/chat/{chat_id}/message")
def post_message(chat_id: str, message: MessageRequest, background_tasks: BackgroundTasks):
    context = ""
    
    # STAGE 1: Retrieval
    if is_query_search_worthy(message.text):
        print(f"Search-worthy query detected. Searching memory for: '{message.text}'")
        try:
            retrieved_chunks = query_unified_memory(message.text, source_ids=message.source_ids)
            
            # STAGE 2: The Relevance Gate (Strategy 1)
            if retrieved_chunks:
                final_chunks = filter_relevant_chunks(message.text, retrieved_chunks)
                if final_chunks:
                    context = "\n---\n".join([chunk['document'] for chunk in final_chunks])
                    
        except Exception as e:
            print(f"Error during memory query: {e}")
    else:
        print(f"Conversational query detected. Skipping memory search for: '{message.text}'")

    # STAGE 3: The Smart Assistant (Combined Strategy 2)
    if context:
        # The prompt is now aware that the context has been pre-screened.
        augmented_prompt = (
            "You are a helpful AI assistant. Your task is to answer the user's question using the provided context. "
            "This context has been pre-screened by another AI and is considered highly relevant to the user's question. "
            "Base your answer primarily on this context. If, for some reason, you still find the context unhelpful, "
            "you may rely on your general knowledge but you should first state that the provided information was not sufficient.\n\n"
            f"RELEVANT CONTEXT:\n---\n{context}\n---\n\n"
            f"USER'S QUESTION: {message.text}"
        )
    else:
        # If no context survived the gate, we just use the user's text directly.
        augmented_prompt = message.text

    # The rest of the function remains the same
    chat_data = get_chat_by_id(chat_id, page=1, page_size=10)
    if not chat_data:
        return JSONResponse(status_code=404, content={"detail": "Chat not found"})
    
    history = chat_data['messages_page']['messages']
    is_first_turn = len(history) < 1
    
    formatted_history = [{"role": msg['role'], "content": msg['text']} for msg in reversed(history)]
    formatted_history.append({"role": "user", "content": augmented_prompt})
    
    model_to_use = chat_data.get("model") or message.model
    ai_response_text = get_ai_response(formatted_history, model_to_use)
    
    if "Sorry, I encountered an error" not in ai_response_text and "AI client not initialized" not in ai_response_text:
        background_tasks.add_task(
            save_conversation_turn_in_background,
            chat_id=chat_id,
            user_text=message.text,
            assistant_text=ai_response_text,
            is_first_turn=is_first_turn,
            model_used=model_to_use
        )
        
    return {"role": "assistant", "text": ai_response_text, "content_type": "text", "model_slug": model_to_use}
    
@app.post("/chat/temporary")
def post_temporary_message(message: MessageRequest):
    formatted_message = [{"role": "user", "content": message.text}]
    ai_response_text = get_ai_response(formatted_message, message.model)
    return {"role": "assistant", "text": ai_response_text, "content_type": "text"}

# --- Chat Management Endpoints (Unchanged) ---
@app.post("/chats", status_code=201)
def create_new_chat():
    timestamp = datetime.now().timestamp()
    title = f"New Chat - {datetime.fromtimestamp(timestamp).strftime('%Y-m-%d %H:%M')}"
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
    
@app.post("/chat/{chat_id}/unarchive", status_code=200)
def unarchive_chat(chat_id: str):
    success = unarchive_chat_session(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": "Chat unarchived successfully"}

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
def load_chat(chat_id: str, page: int = 1, page_size: int = 50):
    chat_data = get_chat_by_id(chat_id, page=page, page_size=page_size)
    if not chat_data:
        raise HTTPException(status_code=404, detail=f"Chat with ID {chat_id} not found.")
    return chat_data

# --- Application Startup ---
if __name__ == "__main__":
    os.makedirs("storage/chroma", exist_ok=True)
    os.makedirs("storage/media", exist_ok=True)
    uvicorn.run("main:app", host="0.0.0.0", port=7860, reload=True)
