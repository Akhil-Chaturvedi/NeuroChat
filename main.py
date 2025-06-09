from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from chat.importer import import_chatgpt_json
from chat.chat_manager import list_chats, get_chat_by_id
import uuid
import uvicorn
import os
import zipfile
import tempfile
import shutil
import json # Import json for reading individual chat files

app = FastAPI()

# Task status storage (shared between main thread and background tasks)
task_statuses = {}

# Serve frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Serve uploaded media (e.g., images extracted from ChatGPT export)
os.makedirs("storage/media", exist_ok=True) # Ensure this directory exists
app.mount("/media", StaticFiles(directory="storage/media"), name="media")


@app.get("/", response_class=HTMLResponse)
def index():
    with open("frontend/index.html", "r", encoding='utf-8') as f:
        return f.read()

# Upload ChatGPT .zip file containing multiple .json chat files
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
        print(f"[{task_id}] Upload received. Processing started in background.")

        # Define the background task function
        def process_zip_file_background(task_id: str, zip_path: str, temp_dir: str):
            imported_chats_summary = []
            total_processed_messages = 0
            json_files_found = 0
            processed_chat_ids = set() # To track chat IDs already processed in this session

            try:
                print(f"[{task_id}] Extracting ZIP file: {zip_path}")
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
                print(f"[{task_id}] ZIP extracted to: {temp_dir}")

                # Iterate through all JSON files in the extracted directory
                all_json_files = []
                for root, _, files in os.walk(temp_dir):
                    for fname in files:
                        # Filter for specific ChatGPT export JSON files
                        if fname.lower().startswith("chatgpt-") and fname.lower().endswith(".json"):
                            all_json_files.append(os.path.join(root, fname))
                
                json_files_found = len(all_json_files)
                if json_files_found == 0:
                    task_statuses[task_id] = {"status": "error", "message": "No valid ChatGPT conversation JSON files found in the ZIP."}
                    print(f"[{task_id}] ERROR: No valid ChatGPT conversation JSON files found.")
                    return

                print(f"[{task_id}] Found {json_files_found} JSON files to process.")

                for idx, chat_json_path in enumerate(all_json_files):
                    current_file_name = os.path.basename(chat_json_path)
                    
                    # Deduplication logic: Check if chat ID (derived from title/time) already processed
                    # This requires reading the title and create_time first without full import
                    try:
                        with open(chat_json_path, "r", encoding='utf-8') as f:
                            # Read only enough to get title and create_time for ID generation
                            # This is a simplification; full deduplication would involve content hashing
                            pre_read_data = json.load(f)
                            temp_title = pre_read_data.get("title") or "Untitled Chat"
                            temp_create_time = pre_read_data.get("create_time") or pre_read_data.get("update_time") or datetime.now().timestamp()
                            # Generate a potential chat_id to check against already processed ones
                            from chat.chat_manager import generate_chat_id # Import here to avoid circular
                            potential_chat_id = generate_chat_id(temp_title, temp_create_time)

                        if potential_chat_id in processed_chat_ids:
                            print(f"[{task_id}] SKIPPING {current_file_name}: Already processed in this batch (ID: {potential_chat_id}).")
                            imported_chats_summary.append({"file": current_file_name, "status": "skipped", "message": "Already processed in this batch."})
                            continue # Skip to next file

                        # If not already processed, proceed with full import
                        with open(chat_json_path, "r", encoding='utf-8') as f:
                            json_contents = f.read() # Read full content for importer

                        # Pass single chat JSON content and the base path of extracted files to the importer
                        chat_import_result = import_chatgpt_json(json_contents, temp_dir, task_id, task_statuses)

                        if chat_import_result.get("error"):
                            print(f"[{task_id}] ERROR importing {current_file_name}: {chat_import_result['error']}")
                            imported_chats_summary.append({"file": current_file_name, "status": "error", "message": chat_import_result['error']})
                        else:
                            chat_id_imported = chat_import_result.get("chat_id")
                            if chat_id_imported:
                                processed_chat_ids.add(chat_id_imported) # Add to set of processed IDs
                            
                            imported_chats_summary.append({"file": current_file_name, "status": "success", "title": chat_import_result['title'], "messages_count": chat_import_result['messages_count']})
                            total_processed_messages += chat_import_result['messages_count']
                            print(f"[{task_id}] Successfully imported {current_file_name} ({chat_import_result['messages_count']} messages).")
                        
                        # Update progress for individual file processing
                        progress = int(((idx + 1) / json_files_found) * 100)
                        task_statuses[task_id]["progress"] = progress
                        task_statuses[task_id]["message"] = f"Processing {idx + 1} of {json_files_found} chats. Currently processing: {current_file_name}"

                    except json.JSONDecodeError as e:
                        imported_chats_summary.append({"file": current_file_name, "status": "error", "message": f"Invalid JSON format: {e}"})
                        print(f"[{task_id}] ERROR: Invalid JSON format for {current_file_name}: {e}")
                    except Exception as e:
                        imported_chats_summary.append({"file": current_file_name, "status": "error", "message": f"Processing error for {current_file_name}: {e}"})
                        print(f"[{task_id}] UNEXPECTED ERROR processing {current_file_name}: {e}")

                # Final status update after all files are processed
                successful_imports = len([c for c in imported_chats_summary if c['status'] == 'success'])
                skipped_chats = len([c for c in imported_chats_summary if c['status'] == 'skipped'])
                final_message = f"✅ Successfully processed {successful_imports} of {json_files_found} chats ({skipped_chats} skipped). Total messages: {total_processed_messages}."
                
                task_statuses[task_id] = {
                    "status": "completed",
                    "progress": 100,
                    "message": final_message,
                    "details": imported_chats_summary # Include detailed summary for potential frontend display
                }
                print(f"[{task_id}] Import process COMPLETED. {final_message}")

            except zipfile.BadZipFile:
                task_statuses[task_id] = {"status": "error", "progress": task_statuses.get(task_id, {}).get("progress", 0), "message": "Invalid ZIP file."}
                print(f"[{task_id}] ERROR: Invalid ZIP file.")
            except Exception as e:
                task_statuses[task_id] = {"status": "error", "progress": task_statuses.get(task_id, {}).get("progress", 0), "message": f"Failed to process file: {str(e)}"}
                print(f"[{task_id}] ERROR during ZIP processing background task: {e}")
            finally:
                if os.path.exists(temp_dir):
                    print(f"[{task_id}] Cleaning up temporary directory: {temp_dir}")
                    shutil.rmtree(temp_dir)

        background_tasks.add_task(process_zip_file_background, task_id, zip_path, temp_dir)

        return JSONResponse(content={"task_id": task_id, "message": "File upload successful. Processing started in the background."})

    except Exception as e:
        # Handle errors before starting background task (e.g., saving file failed)
        if os.path.exists(temp_dir): # Clean up if temp_dir was created before error
            shutil.rmtree(temp_dir)
        print(f"ERROR during file upload setup: {e}")
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
    print("Received GET /chats request.")
    chats = list_chats()
    print(f"Returning {len(chats)} chats.")
    return chats

# Load a chat by ID
@app.get("/chat/{chat_id}")
def load_chat(chat_id: str):
    print(f"Received GET /chat/{chat_id} request.")
    chat_data = get_chat_by_id(chat_id)
    if chat_data:
        print(f"Found chat '{chat_data.get('title')}' with {len(chat_data.get('messages', []))} messages.")
    else:
        print(f"Chat with ID {chat_id} not found or no messages.")
    return chat_data

if __name__ == "__main__":
    # Ensure storage directories exist
    os.makedirs("storage", exist_ok=True)
    os.makedirs("storage/chroma", exist_ok=True)
    os.makedirs("storage/media", exist_ok=True)
    uvicorn.run(app, host="0.0.0.0", port=7860)
