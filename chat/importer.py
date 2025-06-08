import json
import uuid # <--- THIS LINE MUST BE PRESENT
from datetime import datetime
from memory.memory_store import save_to_memory
from chat.chat_manager import create_chat_session
import hashlib
import os
import shutil
import re # For regex parsing of asset pointers

def get_unique_filename(directory, filename):
    """Generates a unique filename if one already exists in the directory."""
    name, ext = os.path.splitext(filename)
    counter = 1
    new_filename = filename
    while os.path.exists(os.path.join(directory, new_filename)):
        new_filename = f"{name}_{counter}{ext}"
        counter += 1
    return new_filename

def import_chatgpt_json(json_contents: str, extracted_files_base_path: str, task_id=None, task_statuses=None):
    try:
        data = json.loads(json_contents)
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON file: {str(e)}"}

    conversations = []
    if isinstance(data, list):
        conversations = data
    elif isinstance(data, dict):
        conversations = data.get("conversations", [])
    
    if not conversations: # Handle case where no conversations are found
        return {"message": "No conversations found in the uploaded file.", "chats": []}

    total_convos = len(conversations)
    imported_chats = []
    total_messages = 0

    os.makedirs("storage/media", exist_ok=True)

    for idx, convo in enumerate(conversations):
        # Ensure 'convo' is a dictionary
        if not isinstance(convo, dict):
            print(f"Skipping invalid conversation entry: {convo}")
            continue

        title = convo.get("title") or "Untitled Chat"
        mapping = convo.get("mapping", {})
        
        timestamp = convo.get("create_time")
        if timestamp is None:
            timestamp = convo.get("update_time") or datetime.now().timestamp()
        chat_id_raw = f"{title}-{timestamp}"
        chat_id = hashlib.md5(chat_id_raw.encode('utf-8')).hexdigest()

        processed_messages_data = []
        for item_id, item in mapping.items():
            # Ensure 'item' itself is a dictionary before trying to get 'message' from it
            if not isinstance(item, dict):
                print(f"Skipping invalid mapping item for chat {chat_id}: {item}")
                continue

            msg = item.get("message") # Get the message. It might be None if key is missing/null
            
            # If msg is None or not a dict, skip processing this message item
            if not isinstance(msg, dict):
                # print(f"Skipping invalid message object for chat {chat_id}, item {item_id}: {msg}")
                continue

            role = msg.get("author", {}).get("role")
            content_obj = msg.get("content", {}) # Get the content object, default to empty dict
            content_parts = content_obj.get("parts", []) # Get parts from content object, default to empty list

            if role in ("user", "assistant") and content_parts:
                message_data = {
                    "role": role,
                    "content_type": "text",
                    "text": "",
                    "media_url": None,
                }

                first_part = content_parts[0]
                if isinstance(first_part, str):
                    message_data["text"] = first_part
                elif isinstance(first_part, dict):
                    if first_part.get("content_type") == "image_asset_pointer":
                        asset_pointer = first_part.get("asset_pointer")
                        if asset_pointer:
                            match = re.search(r"file-service://([\w-]+)", asset_pointer)
                            if match:
                                asset_uuid = match.group(1)
                                
                                image_found = False
                                for root_dir, _, files in os.walk(extracted_files_base_path):
                                    for fname in files:
                                        if (fname.startswith(f"file-{asset_uuid}-") or fname.startswith(f"file_{asset_uuid}-")) and \
                                           fname.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                                            original_image_path = os.path.join(root_dir, fname)
                                            
                                            chat_media_dir = os.path.join("storage", "media", chat_id)
                                            os.makedirs(chat_media_dir, exist_ok=True)
                                            
                                            unique_image_filename = get_unique_filename(chat_media_dir, fname)
                                            destination_path = os.path.join(chat_media_dir, unique_image_filename)
                                            
                                            shutil.copy(original_image_path, destination_path)
                                            
                                            message_data["content_type"] = "image"
                                            message_data["media_url"] = f"/media/{chat_id}/{unique_image_filename}"
                                            message_data["text"] = f"Image generated by {role}."
                                            image_found = True
                                            break
                                    if image_found:
                                        break
                                if not image_found:
                                    message_data["text"] = f"Image asset (UUID: {asset_uuid}) could not be located."
                                    print(f"Warning: Image file for asset {asset_uuid} not found in {extracted_files_base_path}")
                            else:
                                message_data["text"] = "Invalid image asset pointer format."
                        else: # asset_pointer itself was None or empty
                            message_data["text"] = "Image asset pointer is missing."


                    elif first_part.get("content_type") == "code":
                        message_data["content_type"] = "code"
                        message_data["text"] = first_part.get("text", "")
                    else:
                        # Fallback for unhandled dict content types, try to convert to string
                        try:
                            message_data["text"] = json.dumps(first_part, ensure_ascii=False) # Use ensure_ascii=False for proper display of non-ASCII chars
                        except TypeError: # If first_part is not serializable
                            message_data["text"] = str(first_part)
                else: # first_part is not a string or dict
                    message_data["text"] = str(first_part) # Convert anything else to string
                
                processed_messages_data.append(message_data)
        
        if not processed_messages_data:
            continue

        create_chat_session(chat_id, title, timestamp)

        for msg_data in processed_messages_data:
            save_to_memory(
                text=msg_data["text"],
                chat_id=chat_id,
                role=msg_data["role"],
                content_type=msg_data["content_type"],
                media_url=msg_data["media_url"]
            )
            total_messages += 1

        imported_chats.append(title)

        # Update progress
        if task_id and task_statuses:
            progress = int(((idx + 1) / total_convos) * 100)
            current_status = task_statuses.get(task_id, {}) # Get current or default to empty
            current_status["progress"] = progress
            current_status["message"] = f"Processed {idx + 1} of {total_convos} conversations."
            # Ensure the status is still 'processing' unless an error occurs or it completes
            # This check helps prevent overwriting a final "error" or "completed" status if already set by main.py (though less likely here)
            if current_status.get("status") != "error" and current_status.get("status") != "completed":
                current_status["status"] = "processing"
            task_statuses[task_id] = current_status

    return {
        "message": f"✅ Imported {len(imported_chats)} chats with {total_messages} messages (including media).",
        "chats": imported_chats
    }
