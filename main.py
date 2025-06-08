from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
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
import uuid

app = FastAPI()

# Task status storage
task_statuses = {}

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
async def upload_chatgpt(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file.")

    temp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(temp_dir, file.filename)

    try:
        # Save the uploaded zip file
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Initial validation done, now prepare for background task
        task_id = uuid.uuid4().hex
        task_statuses[task_id] = {"status": "processing", "progress": 0, "message": "Upload successful, processing started."}

        # Define the background task function
        def process_zip_file_background(task_id: str, zip_path: str, temp_dir: str):
            try:
                # Extract the zip file
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)

                conversations_json_path = None
                extracted_files_base_path = temp_dir

                for root, _, files in os.walk(temp_dir):
                    if "conversations.json" in files:
                        conversations_json_path = os.path.join(root, "conversations.json")
                        break
                    elif "chat.json" in files:
                        conversations_json_path = os.path.join(root, "chat.json")
                        break
                
                if not conversations_json_path:
                    task_statuses[task_id] = {"status": "error", "message": "Could not find 'conversations.json' or 'chat.json' in the zip file."}
                    return

                with open(conversations_json_path, "r", encoding='utf-8') as f:
                    json_contents = f.read()
                
                # This summary will eventually include number of chats, etc.
                # Pass task_id and task_statuses to the importer for progress updates
                summary = import_chatgpt_json(json_contents, extracted_files_base_path, task_id, task_statuses) 
                
                # Final status update after successful import
                final_message = summary.get("message", "Processing completed successfully.")
                if "error" in summary: # If importer returns an error field
                    task_statuses[task_id] = {
                        "status": "error", 
                        "progress": task_statuses.get(task_id, {}).get("progress", 0), # Preserve last known progress
                        "message": summary.get("error", "An error occurred during import.")
                    }
                else:
                    task_statuses[task_id] = {
                        "status": "completed", 
                        "progress": 100, 
                        "message": final_message
                    }

            except zipfile.BadZipFile:
                task_statuses[task_id] = {"status": "error", "progress": task_statuses.get(task_id, {}).get("progress", 0), "message": "Invalid ZIP file."}
            except Exception as e:
                task_statuses[task_id] = {"status": "error", "progress": task_statuses.get(task_id, {}).get("progress", 0), "message": f"Failed to process file: {str(e)}"}
            finally:
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)

        background_tasks.add_task(process_zip_file_background, task_id, zip_path, temp_dir)

        return JSONResponse(content={"task_id": task_id, "message": "File upload successful. Processing started in the background."})

    except Exception as e:
        # Handle errors before starting background task (e.g., saving file failed)
        if os.path.exists(temp_dir): # Clean up if temp_dir was created before error
            shutil.rmtree(temp_dir)
        raise HTTPException(status_code=500, detail=f"Failed to initiate file processing: {e}")

# Endpoint to get the status of a background task
@app.get("/upload-status/{task_id}")
async def get_upload_status(task_id: str):
    status = task_statuses.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return JSONResponse(content=status)

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
