import json
import os
import hashlib
from datetime import datetime
from memory.memory_store import get_messages_for_chat, delete_messages_for_chat

CHAT_STATE_FILE = "storage/chat_state.json"

def generate_chat_id(title: str, timestamp: float) -> str:
    # ... (unchanged)
    chat_id_raw = f"{title}-{timestamp}"
    return hashlib.md5(chat_id_raw.encode('utf-8')).hexdigest()

def _load_chat_state():
    # ... (unchanged)
    if os.path.exists(CHAT_STATE_FILE):
        with open(CHAT_STATE_FILE, "r", encoding='utf-8') as f:
            try:
                state = json.load(f)
                if not isinstance(state, dict): return {}
                return state
            except json.JSONDecodeError:
                return {}
    return {}

def _save_chat_state(state):
    # ... (unchanged)
    os.makedirs(os.path.dirname(CHAT_STATE_FILE), exist_ok=True)
    with open(CHAT_STATE_FILE, "w", encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)

def create_chat_session(chat_id: str, title: str, timestamp: float):
    chat_state = _load_chat_state()
    chat_state[chat_id] = {
        "id": chat_id,
        "title": title,
        "timestamp": timestamp,
        "last_updated": datetime.now().timestamp(),
        "archived": False,
        "model": None  # NEW: Field for per-chat model override
    }
    _save_chat_state(chat_state)
    print(f"Chat session '{title}' ({chat_id}) created/updated.")

# NEW: Function to set a model for a specific chat
def set_chat_model(chat_id: str, model: str) -> bool:
    """Sets a specific AI model for a given chat session."""
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        chat_state[chat_id]['model'] = model
        chat_state[chat_id]['last_updated'] = datetime.now().timestamp()
        _save_chat_state(chat_state)
        print(f"Set model for chat {chat_id} to '{model}'")
        return True
    return False

def rename_chat_session(chat_id: str, new_title: str) -> bool:
    # ... (unchanged)
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        chat_state[chat_id]['title'] = new_title
        chat_state[chat_id]['last_updated'] = datetime.now().timestamp()
        _save_chat_state(chat_state)
        return True
    return False

def delete_chat_session(chat_id: str) -> bool:
    # ... (unchanged)
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        del chat_state[chat_id]
        _save_chat_state(chat_state)
        delete_messages_for_chat(chat_id)
        return True
    return False

def archive_chat_session(chat_id: str) -> bool:
    # ... (unchanged)
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        chat_state[chat_id]['archived'] = True
        chat_state[chat_id]['last_updated'] = datetime.now().timestamp()
        _save_chat_state(chat_state)
        return True
    return False

def list_chats():
    # ... (unchanged)
    chat_state = _load_chat_state()
    active_chats = [chat for chat in chat_state.values() if not chat.get('archived', False)]
    active_chats.sort(key=lambda x: x.get('last_updated', x.get('timestamp', 0)), reverse=True)
    return active_chats

def list_archived_chats():
    # ... (unchanged)
    chat_state = _load_chat_state()
    archived_chats = [chat for chat in chat_state.values() if chat.get('archived', False)]
    archived_chats.sort(key=lambda x: x.get('last_updated', x.get('timestamp', 0)), reverse=True)
    return archived_chats

def get_chat_by_id(chat_id: str, page: int = 1, page_size: int = 30):
    chat_state = _load_chat_state()
    chat_meta = chat_state.get(chat_id)
    if chat_meta:
        messages_data = get_messages_for_chat(chat_id, page=page, page_size=page_size)
        return {
            "id": chat_meta["id"],
            "title": chat_meta["title"],
            "timestamp": chat_meta["timestamp"],
            "model": chat_meta.get("model"), # NEW: Return the chat-specific model
            "messages_page": messages_data
        }
    return None