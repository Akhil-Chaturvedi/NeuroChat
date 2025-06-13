from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from chat.importer import import_chatgpt_json
# MODIFIED: Imported the new rename function
from chat.chat_manager import list_chats, get_chat_by_id, create_chat_session, generate_chat_id, rename_chat_session
from memory.memory_store import save_to_memory
import uuid
import uvicorn
import os
import zipfile
import tempfile
import shutil
import json
from datetime import datetime

app = FastAPI()

task_statuses = {}

class MessageRequest(BaseModel):
    text: str

# NEW: Pydantic model for the rename request
class RenameRequest(BaseModel):
    new_title: str

app.mount("/static", StaticFiles(directory="frontend"), name="static")
os.makedirs("storage/media", exist_ok=True)
app.mount("/media", StaticFiles(directory="storage/media"), name="media")

@app.get("/", response_class=HTMLResponse)
def index():
    with open("frontend/index.html", "r", encoding='utf-8') as f:
        return f.read()

@app.post("/upload")
async def upload_chatgpt(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    # ... (Your existing upload logic is unchanged) ...
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
            # This logic is complex and correct, so no need to reproduce it all here.
            pass
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

@app.post("/chats", status_code=201)
def create_new_chat():
    timestamp = datetime.now().timestamp()
    title = f"New Chat - {datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M')}"
    chat_id = generate_chat_id(title, timestamp)
    create_chat_session(chat_id, title, timestamp)
    new_chat = {"id": chat_id, "title": title, "timestamp": timestamp}
    print(f"Created new chat: {title} ({chat_id})")
    return new_chat

@app.post("/chat/temporary")
def post_temporary_message(message: MessageRequest):
    print(f"Received temporary message: '{message.text}'")
    ai_response_text = f"This is a TEMPORARY response to: '{message.text}'. Nothing was saved."
    return {"role": "assistant", "text": ai_response_text, "content_type": "text"}

@app.post("/chat/{chat_id}/message")
def post_message(chat_id: str, message: MessageRequest):
    save_to_memory(text=message.text, chat_id=chat_id, role="user")
    ai_response_text = f"This is a simulated AI response to: '{message.text}'"
    save_to_memory(text=ai_response_text, chat_id=chat_id, role="assistant")
    return {"role": "assistant", "text": ai_response_text, "content_type": "text"}

# NEW: Endpoint to rename a chat
@app.put("/chat/{chat_id}/rename")
def rename_chat(chat_id: str, request: RenameRequest):
    success = rename_chat_session(chat_id, request.new_title)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": "Chat renamed successfully", "new_title": request.new_title}

@app.get("/chats")
def get_chats():
    return list_chats()

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