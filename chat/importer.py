# chat/importer.py

import json
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from chat.data_processor import parse_chatgpt_export
from chat.chat_manager import import_chat, import_messages_to_chat, generate_chat_id
from chat.state import task_statuses

router = APIRouter()

def process_conversations_background(task_id: str, json_data: list):
    try:
        parsed_conversations = parse_chatgpt_export(json_data)
        if not parsed_conversations:
            task_statuses[task_id] = {"status": "completed", "progress": 100, "message": "File processed, no new conversations found."}
            return
        
        parsed_conversations.sort(key=lambda x: x.get('update_time', 0), reverse=True)
        total_convos = len(parsed_conversations)
        imported_count = 0
        skipped_count = 0
        
        for i, convo in enumerate(parsed_conversations):
            progress = int(((i + 1) / total_convos) * 100)
            task_statuses[task_id] = {
                "status": "processing",
                "progress": progress,
                "message": f"Processing {i + 1} of {total_convos}: {convo['title']}"
            }
            
            # --- [CRITICAL FIX] ---
            # Generate a stable chat_id here instead of looking for a non-existent one.
            chat_id = generate_chat_id(convo['title'], convo['create_time'])

            was_imported_or_updated = import_chat(
                chat_id=chat_id, 
                title=convo['title'],
                create_timestamp=convo['create_time'],
                update_timestamp=convo['update_time']
            )
            
            if was_imported_or_updated:
                import_messages_to_chat(chat_id=chat_id, messages=convo['messages'])
                imported_count += 1
            else:
                skipped_count += 1

        final_message = f"✅ Import complete. Added {imported_count} new/updated chats. Skipped {skipped_count} duplicates."
        task_statuses[task_id] = {"status": "completed", "progress": 100, "message": final_message}
    except Exception as e:
        print(f"Error during background import (task {task_id}): {e}")
        task_statuses[task_id] = {"status": "error", "message": f"An error occurred: {e}"}

@router.post("/import/chatgpt-conversations", tags=["Import"])
async def handle_chatgpt_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    if file.filename != "conversations.json":
        raise HTTPException(status_code=400, detail="Invalid file. Please upload 'conversations.json'.")
    try:
        contents = await file.read()
        json_data = json.loads(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read or parse JSON file: {e}")

    task_id = uuid.uuid4().hex
    task_statuses[task_id] = {"status": "processing", "progress": 0, "message": "Upload successful, preparing to import."}
    background_tasks.add_task(process_conversations_background, task_id, json_data)
    
    return {"task_id": task_id, "message": "Import process started in the background."}
