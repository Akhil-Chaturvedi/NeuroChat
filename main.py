from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from chat.importer import import_chatgpt_json
from chat.chat_manager import (
    list_chats, get_chat_by_id, create_chat_session, 
    generate_chat_id, rename_chat_session, delete_chat_session,
    archive_chat_session, list_archived_chats, set_chat_model
)
from memory.memory_store import get_messages_for_chat, save_to_memory
from chat.ai_services import initialize_client, get_available_models, get_ai_response
import uuid
import uvicorn
import os
import zipfile
import tempfile
import shutil
import json
from datetime import datetime

app = FastAPI()

# --- Pydantic Models ---
class ApiKeyRequest(BaseModel):
    api_key: str

class MessageRequest(BaseModel):
    text: str
    model: str

class RenameRequest(BaseModel):
    new_title: str

class SetModelRequest(BaseModel):
    model: str

# --- App Setup ---
task_statuses = {}
app.mount("/static", StaticFiles(directory="frontend"), name="static")
os.makedirs("storage/media", exist_ok=True)
app.mount("/media", StaticFiles(directory="storage/media"), name="media")

# --- Core Endpoints ---
@app.get("/", response_class=HTMLResponse)
def index():
    with open("frontend/index.html", "r", encoding='utf-8') as f:
        return f.read()

# --- Import Endpoint (RESTORED) ---
@app.post("/upload")
async def upload_chatgpt(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file.")

    temp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(temp_dir, file.filename)

    try:
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        task_id = uuid.uuid4().hex
        task_statuses[task_id] = {"status": "processing", "progress": 0, "message": "Upload successful, processing started."}
        
        def process_zip_file_background(task_id: str, zip_path: str, temp_dir: str):
            imported_chats_summary = []
            total_processed_messages = 0
            json_files_found = 0
            processed_chat_ids = set()
            
            try:
                all_system_chats = list_chats()
                existing_chat_ids = {chat['id'] for chat in all_system_chats}
            except Exception as e:
                print(f"[{task_id}] WARNING: Could not load existing chat IDs: {e}.")
                existing_chat_ids = set()

            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
                
                all_json_files = [os.path.join(root, fname) for root, _, files in os.walk(temp_dir) for fname in files if fname.lower().startswith("chatgpt-") and fname.lower().endswith(".json")]
                json_files_found = len(all_json_files)

                if json_files_found == 0:
                    task_statuses[task_id] = {"status": "error", "message": "No valid ChatGPT conversation JSON files found."}
                    return

                for idx, chat_json_path in enumerate(all_json_files):
                    current_file_name = os.path.basename(chat_json_path)
                    progress = int(((idx + 1) / json_files_found) * 100)
                    task_statuses[task_id]["progress"] = progress
                    task_statuses[task_id]["message"] = f"Processing {idx + 1} of {json_files_found} chats. Currently processing: {current_file_name}"
                    
                    try:
                        with open(chat_json_path, "r", encoding='utf-8') as f:
                            pre_read_data = json.load(f)
                        temp_title = pre_read_data.get("title") or "Untitled Chat"
                        temp_create_time = pre_read_data.get("create_time") or pre_read_data.get("update_time") or datetime.now().timestamp()
                        potential_chat_id = generate_chat_id(temp_title, temp_create_time)

                        if potential_chat_id in existing_chat_ids or potential_chat_id in processed_chat_ids:
                            imported_chats_summary.append({"file": current_file_name, "status": "skipped", "message": "Chat already exists."})
                            continue

                        with open(chat_json_path, "r", encoding='utf-8') as f:
                            json_contents = f.read()
                        
                        chat_import_result = import_chatgpt_json(json_contents, temp_dir, task_id, task_statuses)

                        if chat_import_result.get("error"):
                            imported_chats_summary.append({"file": current_file_name, "status": "error", "message": chat_import_result['error']})
                        else:
                            chat_id_imported = chat_import_result.get("chat_id")
                            if chat_id_imported:
                                processed_chat_ids.add(chat_id_imported)
                            imported_chats_summary.append({"file": current_file_name, "status": "success", "title": chat_import_result['title'], "messages_count": chat_import_result['messages_count']})
                            total_processed_messages += chat_import_result['messages_count']
                    except Exception as e:
                        imported_chats_summary.append({"file": current_file_name, "status": "error", "message": str(e)})

                successful_imports = len([c for c in imported_chats_summary if c['status'] == 'success'])
                skipped_chats = len([c for c in imported_chats_summary if c['status'] == 'skipped'])
                final_message = f"✅ Processed {successful_imports} chats ({skipped_chats} skipped). Total messages: {total_processed_messages}."
                task_statuses[task_id] = {"status": "completed", "progress": 100, "message": final_message, "details": imported_chats_summary}
            except Exception as e:
                task_statuses[task_id] = {"status": "error", "message": f"Failed to process ZIP: {str(e)}"}
            finally:
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)

        background_tasks.add_task(process_zip_file_background, task_id, zip_path, temp_dir)
        return JSONResponse(content={"task_id": task_id, "message": "File upload successful. Processing started."})

    except Exception as e:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        raise HTTPException(status_code=500, detail=f"Failed to initiate file processing: {e}")

@app.get("/upload-status/{task_id}")
async def get_upload_status(task_id: str):
    status = task_statuses.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return JSONResponse(content=status)

# --- AI Configuration Endpoints ---
@app.post("/config/api-key")
def verify_api_key(request: ApiKeyRequest):
    success = initialize_client(request.api_key)
    if not success:
        raise HTTPException(status_code=401, detail="Invalid API Key or failed to connect to OpenRouter.")
    models = get_available_models()
    return {"models": models}

@app.get("/config/models")
def list_models():
    models = get_available_models()
    if not models:
        raise HTTPException(status_code=404, detail="API Key not yet verified.")
    return {"models": models}

# --- Chat Interaction Endpoints ---
@app.post("/chat/{chat_id}/message")
def post_message(chat_id: str, message: MessageRequest):
    save_to_memory(text=message.text, chat_id=chat_id, role="user")
    chat_data = get_chat_by_id(chat_id, page=1, page_size=20)
    history = chat_data['messages_page']['messages']
    formatted_history = [{"role": msg['role'], "content": msg['text']} for msg in reversed(history)]
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
def load_chat(chat_id: str, page: int = 1, page_size: int = 30):
    chat_data = get_chat_by_id(chat_id, page=page, page_size=page_size)
    if not chat_data:
        raise HTTPException(status_code=404, detail=f"Chat with ID {chat_id} not found.")
    return chat_data

if __name__ == "__main__":
    os.makedirs("storage", exist_ok=True)
    os.makedirs("storage/chroma", exist_ok=True)
    os.makedirs("storage/media", exist_ok=True)
    uvicorn.run("main:app", host="0.0.0.0", port=7860, reload=True)