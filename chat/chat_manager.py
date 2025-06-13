import json
import os
import hashlib
from datetime import datetime
from memory.memory_store import get_messages_for_chat

# Define the path for the chat state file
CHAT_STATE_FILE = "storage/chat_state.json"

def generate_chat_id(title: str, timestamp: float) -> str:
    """Generates a consistent chat ID based on title and creation timestamp."""
    # Use hashlib.md5 for a consistent, short hash
    chat_id_raw = f"{title}-{timestamp}"
    return hashlib.md5(chat_id_raw.encode('utf-8')).hexdigest()

def _load_chat_state():
    """Loads the chat state from the JSON file."""
    if os.path.exists(CHAT_STATE_FILE):
        with open(CHAT_STATE_FILE, "r", encoding='utf-8') as f:
            try:
                state = json.load(f)
                if not isinstance(state, dict):
                    print(f"WARNING: {CHAT_STATE_FILE} content is not a dictionary. Overwriting with empty state.")
                    return {}
                return state
            except json.JSONDecodeError:
                print(f"WARNING: {CHAT_STATE_FILE} is corrupted. Starting with empty state.")
                return {}
    return {}

def _save_chat_state(state):
    """Saves the chat state to the JSON file."""
    os.makedirs(os.path.dirname(CHAT_STATE_FILE), exist_ok=True)
    with open(CHAT_STATE_FILE, "w", encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)

def create_chat_session(chat_id: str, title: str, timestamp: float):
    """Creates or updates a chat session in the chat state."""
    chat_state = _load_chat_state()
    chat_state[chat_id] = {
        "id": chat_id,
        "title": title,
        "timestamp": timestamp,
        "last_updated": datetime.now().timestamp()
    }
    _save_chat_state(chat_state)
    print(f"Chat session '{title}' ({chat_id}) created/updated.")

# NEW: Function to rename a chat session
def rename_chat_session(chat_id: str, new_title: str) -> bool:
    """Renames a specific chat session."""
    chat_state = _load_chat_state()
    if chat_id in chat_state:
        chat_state[chat_id]['title'] = new_title
        chat_state[chat_id]['last_updated'] = datetime.now().timestamp()
        _save_chat_state(chat_state)
        print(f"Renamed chat {chat_id} to '{new_title}'")
        return True
    print(f"Attempted to rename chat {chat_id}, but it was not found.")
    return False

def list_chats():
    """Lists all available chat sessions, sorted by last updated."""
    chat_state = _load_chat_state()
    chats = list(chat_state.values())
    chats.sort(key=lambda x: x.get('last_updated', x.get('timestamp', 0)), reverse=True)
    return chats

def get_chat_by_id(chat_id: str, page: int = 1, page_size: int = 30):
    """Retrieves a specific chat session and its messages with pagination."""
    chat_state = _load_chat_state()
    chat_meta = chat_state.get(chat_id)

    if chat_meta:
        print(f"Fetching messages for chat ID: {chat_id}, page: {page}, page_size: {page_size}")
        messages_data = get_messages_for_chat(chat_id, page=page, page_size=page_size)
        
        print(f"Found {messages_data['total_messages_in_chat']} total messages for chat ID {chat_id}. Returning page {messages_data['page']}.")
        
        return {
            "id": chat_meta["id"],
            "title": chat_meta["title"],
            "timestamp": chat_meta["timestamp"],
            "messages_page": messages_data
        }
    print(f"Chat metadata not found for ID: {chat_id}")
    return None