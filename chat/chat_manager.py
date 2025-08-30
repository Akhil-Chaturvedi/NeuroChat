# chat/chat_manager.py

import json
import os
import hashlib
from datetime import datetime
from memory.memory_store import get_messages_for_chat, delete_messages_for_chat, save_imported_message, save_to_memory

# Constants
CHAT_STATE_FILE = "storage/chat_state.json"
SOURCES_META_FILE = "storage/sources_meta.json"

# Ensure storage directories exist
os.makedirs(os.path.dirname(CHAT_STATE_FILE), exist_ok=True)
os.makedirs(os.path.dirname(SOURCES_META_FILE), exist_ok=True)

# Helper for _load_chat_state to avoid double json.load
def _load_json_robust(filepath: str, default_value=None):
    if os.path.exists(filepath):
        with open(filepath, "r", encoding='utf-8') as f:
            try:
                content = json.load(f)
                return content if content is not None else default_value
            except json.JSONDecodeError:
                return default_value
    return default_value

# ### MODIFIED ###: Now accepts a specific chat_id for imports
def import_chat(chat_id: str, title: str, create_timestamp: float, update_timestamp: float) -> str | None:
    """
    Imports or updates a chat session. If a chat with the given ID exists and
    the import data is newer, it updates. Otherwise, it creates.
    """
    chat_state = _load_chat_state()

    existing_chat = chat_state.get(chat_id) # Look up by chat_id
    
    if existing_chat:
        existing_update_time = existing_chat.get('last_updated', 0)
        # Check if the imported version is newer
        if update_timestamp > existing_update_time:
            print(f"Updating existing chat '{title}' (ID: {chat_id}). Deleting old messages...")
            delete_messages_for_chat(chat_id) # Delete messages by the correct chat_id
            existing_chat.update({ # Update existing metadata
                "title": title,
                "timestamp": create_timestamp,
                "last_updated": update_timestamp,
                "archived": False, # Ensure it's not archived on update
                "model": "imported" # Mark as imported
            })
            _save_chat_state(chat_state)
            _add_source(source_id=chat_id, name=title, source_type="chat_import") # Update source entry
            return chat_id
        else:
            print(f"Skipping chat '{title}' (ID: {chat_id}) - no newer data.")
            return None # Skip if not newer
    else:
        # Create a new entry for the imported chat
        print(f"Creating new imported chat '{title}' with ID: {chat_id}")
        chat_state[chat_id] = {
            "id": chat_id, 
            "title": title, 
            "timestamp": create_timestamp, # Use original create_time
            "last_updated": update_timestamp, 
            "archived": False, 
            "model": "imported"
        }
        _save_chat_state(chat_state)
        _add_source(source_id=chat_id, name=title, source_type="chat_import")
        return chat_id

# ### MODIFIED ###: This function now passes an index to preserve order
def import_messages_to_chat(chat_id: str, messages: list[dict]):
    """
    Adds a list of rich message objects to a specified chat session.
    It now includes an 'order_index' to guarantee the sequence.
    """
    # Use enumerate to get both the index and the message object
    for index, message_obj in enumerate(messages):
        save_imported_message(
            chat_id=chat_id,
            message_obj=message_obj,
            order_index=index  # Pass the index to lock in the order
        )

# --- General Utility Functions ---

def generate_chat_id(title: str, timestamp: float) -> str:
    """Generates a unique chat ID based on title and a timestamp."""
    chat_id_raw = f"{title}-{timestamp}"
    return hashlib.md5(chat_id_raw.encode('utf-8')).hexdigest()

def _load_chat_state() -> dict:
    """Loads the chat state from the JSON file."""
    return _load_json_robust(CHAT_STATE_FILE, default_value={})

def _save_chat_state(state: dict):
    """Saves the chat state to the JSON file."""
    with open(CHAT_STATE_FILE, "w", encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)

def _load_sources_meta() -> dict:
    """Loads the sources metadata from the JSON file."""
    return _load_json_robust(SOURCES_META_FILE, default_value={})

def _save_sources_meta(sources: dict):
    """Saves the sources metadata to the JSON file."""
    with open(SOURCES_META_FILE, "w", encoding='utf-8') as f:
        json.dump(sources, f, indent=4, ensure_ascii=False)

def _add_source(source_id: str, name: str, source_type: str):
    """
    Adds or updates a source entry.
    source_type can be 'chat_new', 'chat_import', or 'file'.
    """
    sources = _load_sources_meta()
    sources[source_id] = {
        "id": source_id, "name": name,
        "type": source_type, "added_on": datetime.now().timestamp()
    }
    _save_sources_meta(sources)

def add_file_source(file_id: str, filename: str):
    """Adds a new file source."""
    _add_source(source_id=file_id, name=filename, source_type="file")

def list_all_sources() -> list[dict]:
    """Lists all available knowledge sources."""
    sources = _load_sources_meta()
    return sorted(list(sources.values()), key=lambda x: x['added_on'], reverse=True)

def _delete_source(source_id: str):
    """Deletes a source entry."""
    sources = _load_sources_meta()
    if source_id in sources:
        del sources[source_id]
        _save_sources_meta(sources)

# ### MODIFIED ###: Uses 'chat_new' source_type
def create_chat_session(chat_id: str, title: str, timestamp: float):
    """Creates a new chat session from the UI."""
    chat_state = _load_chat_state()
    chat_state[chat_id] = {
        "id": chat_id, "title": title, "timestamp": timestamp,
        "last_updated": datetime.now().timestamp(), "archived": False, "model": None
    }
    _save_chat_state(chat_state)
    _add_source(source_id=chat_id, name=title, source_type="chat_new") # Use 'chat_new'

def set_chat_model(chat_id: str, model: str) -> bool:
    """Sets the AI model for a specific chat."""
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        chat_state[chat_id]['model'] = model
        chat_state[chat_id]['last_updated'] = datetime.now().timestamp()
        _save_chat_state(chat_state)
        return True
    return False

# ### MODIFIED ###: Updates source meta to reflect new title and preserves original type
def rename_chat_session(chat_id: str, new_title: str) -> bool:
    """Renames an existing chat session."""
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        old_title = chat_state[chat_id]['title']
        chat_state[chat_id]['title'] = new_title
        chat_state[chat_id]['last_updated'] = datetime.now().timestamp()
        _save_chat_state(chat_state)
        
        # Update the source metadata with the new name, preserving its original type
        sources = _load_sources_meta()
        if chat_id in sources:
            sources[chat_id]['name'] = new_title
            _save_sources_meta(sources)
        
        return True
    return False

def delete_chat_session(chat_id: str) -> bool:
    """Deletes a chat session and its messages."""
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        del chat_state[chat_id]
        _save_chat_state(chat_state)
        delete_messages_for_chat(chat_id)
        _delete_source(chat_id)
        return True
    return False

def archive_chat_session(chat_id: str) -> bool:
    """Archives a chat session."""
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        chat_state[chat_id]['archived'] = True
        chat_state[chat_id]['last_updated'] = datetime.now().timestamp()
        _save_chat_state(chat_state)
        return True
    return False

def list_chats() -> list[dict]:
    """Lists all active chat sessions, sorted by last updated."""
    chat_state = _load_chat_state()
    active_chats = [c for c in chat_state.values() if not c.get('archived', False)]
    active_chats.sort(key=lambda x: x.get('last_updated', 0), reverse=True)
    return active_chats

def list_archived_chats() -> list[dict]:
    """Lists all archived chat sessions, sorted by last updated."""
    chat_state = _load_chat_state()
    archived_chats = [c for c in chat_state.values() if c.get('archived', False)]
    archived_chats.sort(key=lambda x: x.get('last_updated', 0), reverse=True)
    return archived_chats

def get_chat_by_id(chat_id: str, page: int = 1, page_size: int = 30) -> dict | None:
    """Retrieves a specific chat session and its paginated messages."""
    chat_state = _load_chat_state()
    chat_meta = chat_state.get(chat_id)
    if chat_meta:
        messages_data = get_messages_for_chat(chat_id, page=page, page_size=page_size)
        return {**chat_meta, "messages_page": messages_data}
    return None
