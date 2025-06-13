from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from chat.importer import import_chatgpt_json
from chat.chat_manager import (
    list_chats, get_chat_by_id, create_chat_session, 
    generate_chat_id, rename_chat_session, delete_chat_session,
    archive_chat_session, list_archived_chats # MODIFIED: Import new functions
)
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

class RenameRequest(BaseModel):
    new_title: str

app.mount("/static", StaticFiles(directory="frontend"), name="static")
os.makedirs("storage/media", exist_ok=True)
app.mount("/media", StaticFiles(directory="storage/media"), name="media")

@app.get("/", response_class=HTMLResponse)
def index():
    with open("frontend/index.html", "r", encoding='utf-8') as f:
        return f.read()

# ... (Your existing /upload and /upload-status endpoints are unchanged)
@app.post("/upload")
async def upload_chatgpt(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    pass # Placeholder for your existing, correct logic

@app.get("/upload-status/{task_id}")
async def get_upload_status(task_id: str):
    pass # Placeholder for your existing, correct logic

@app.post("/chats", status_code=201)
def create_new_chat():
    timestamp = datetime.now().timestamp()
    title = f"New Chat - {datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M')}"
    chat_id = generate_chat_id(title, timestamp)
    create_chat_session(chat_id, title, timestamp)
    new_chat = {"id": chat_id, "title": title, "timestamp": timestamp}
    return new_chat

@app.post("/chat/temporary")
def post_temporary_message(message: MessageRequest):
    ai_response_text = f"This is a TEMPORARY response to: '{message.text}'. Nothing was saved."
    return {"role": "assistant", "text": ai_response_text, "content_type": "text"}

@app.post("/chat/{chat_id}/message")
def post_message(chat_id: str, message: MessageRequest):
    save_to_memory(text=message.text, chat_id=chat_id, role="user")
    ai_response_text = f"This is a simulated AI response to: '{message.text}'"
    save_to_memory(text=ai_response_text, chat_id=chat_id, role="assistant")
    return {"role": "assistant", "text": ai_response_text, "content_type": "text"}

@app.put("/chat/{chat_id}/rename")
def rename_chat(chat_id: str, request: RenameRequest):
    success = rename_chat_session(chat_id, request.new_title)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": "Chat renamed successfully", "new_title": request.new_title}

@app.delete("/chat/{chat_id}", status_code=204)
def delete_chat(chat_id: str):
    success = delete_chat_session(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return Response(status_code=204)

# NEW: Endpoint to archive a chat
@app.post("/chat/{chat_id}/archive", status_code=200)
def archive_chat(chat_id: str):
    """Archives a chat session."""
    success = archive_chat_session(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": "Chat archived successfully"}

@app.get("/chats")
def get_chats():
    return list_chats()

# NEW: Endpoint to get archived chats
@app.get("/chats/archived")
def get_archived_chats():
    """Returns a list of all archived chats."""
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