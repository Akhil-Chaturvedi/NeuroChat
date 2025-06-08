from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from chat.importer import import_chatgpt_json # This will need to be updated soon
from chat.chat_manager import list_chats, get_chat_by_id
import uuid
import uvicorn
import os
import zipfile
import tempfile
import shutil # For removing temporary directories

app = FastAPI()

# Serve frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Serve uploaded media (e.g., images extracted from ChatGPT export)
# This directory will contain chat-specific media folders
os.makedirs("storage/media", exist_ok=True)
app.mount("/media", StaticFiles(directory="storage/media"), name="media")


@app.get("/", response_class=HTMLResponse)
def index():
    with open("frontend/index.html", "r", encoding='utf-8') as f:
        return f.read()

# Upload ChatGPT .zip file
@app.post("/upload")
async def upload_chatgpt(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file.")

    temp_dir = None
    try:
        # Create a temporary directory to extract the zip file
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, file.filename)

        # Save the uploaded zip file
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract the zip file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)

        conversations_json_path = None
        extracted_files_base_path = temp_dir # Base path for extracted files (including images)

        # Look for conversations.json or chat.json within the extracted content
        for root, _, files in os.walk(temp_dir):
            if "conversations.json" in files:
                conversations_json_path = os.path.join(root, "conversations.json")
                break
            elif "chat.json" in files: # Some exports might use chat.json
                conversations_json_path = os.path.join(root, "chat.json")
                break
        
        if not conversations_json_path:
            raise HTTPException(status_code=400, detail="Could not find 'conversations.json' or 'chat.json' in the uploaded zip file.")

        # Read the JSON content
        with open(conversations_json_path, "r", encoding='utf-8') as f:
            json_contents = f.read()

        # Pass the raw JSON contents and the base path of extracted files to the importer
        # The importer will now be responsible for parsing images using extracted_files_base_path
        summary = import_chatgpt_json(json_contents, extracted_files_base_path)
        return JSONResponse(content=summary)

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file.")
    except Exception as e:
        # Catch any other unexpected errors during processing
        print(f"Error during ZIP upload and processing: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {e}")
    finally:
        # Clean up the temporary directory
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


# List available chats
@app.get("/chats")
def get_chats():
    return list_chats()

# Load a chat by ID
@app.get("/chat/{chat_id}")
def load_chat(chat_id: str):
    return get_chat_by_id(chat_id)

if __name__ == "__main__":
    # Ensure storage directories exist
    os.makedirs("storage", exist_ok=True)
    os.makedirs("storage/chroma", exist_ok=True)
    os.makedirs("storage/media", exist_ok=True)
    uvicorn.run(app, host="0.0.0.0", port=7860)
