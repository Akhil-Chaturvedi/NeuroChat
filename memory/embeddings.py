from fastapi import FastAPI, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from chat.importer import import_chatgpt_json
from chat.chat_manager import list_chats, get_chat_by_id
import uvicorn
import os

app = FastAPI()

# Serve frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/", response_class=HTMLResponse)
def index():
    with open("frontend/index.html", "r") as f:
        return f.read()

# Upload ChatGPT .json file
@app.post("/upload")
async def upload_chatgpt(file: UploadFile = File(...)):
    if not file.filename.endswith(".json"):
        return JSONResponse(content={"error": "Please upload a .json file"}, status_code=400)

    contents = await file.read()
    summary = import_chatgpt_json(contents)
    return JSONResponse(content=summary)

# List available chats
@app.get("/chats")
def get_chats():
    return list_chats()

# Load a chat by ID
@app.get("/chat/{chat_id}")
def load_chat(chat_id: str):
    return get_chat_by_id(chat_id)

if __name__ == "__main__":
    os.makedirs("storage", exist_ok=True)
    uvicorn.run(app, host="0.0.0.0", port=7860)
