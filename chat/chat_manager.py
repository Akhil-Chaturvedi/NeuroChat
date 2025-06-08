import json
import os
from datetime import datetime

CHAT_STATE_PATH = "storage/chat_state.json"

# Ensure state file exists
if not os.path.exists(CHAT_STATE_PATH):
    with open(CHAT_STATE_PATH, "w") as f:
        json.dump([], f)

def create_chat_session(chat_id, title, timestamp=None):
    timestamp = timestamp or datetime.now().timestamp()
    with open(CHAT_STATE_PATH, "r") as f:
        state = json.load(f)

    # Avoid duplicates
    if any(c["chat_id"] == chat_id for c in state):
        return

    state.append({
        "chat_id": chat_id,
        "title": title,
        "timestamp": timestamp
    })

    with open(CHAT_STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)

def list_chats():
    with open(CHAT_STATE_PATH, "r") as f:
        state = json.load(f)

    # Sort: newest first
    return sorted(state, key=lambda x: x["timestamp"], reverse=True)

def get_chat_by_id(chat_id):
    from memory.memory_store import get_messages_for_chat
    messages = get_messages_for_chat(chat_id)
    return {
        "chat_id": chat_id,
        "messages": messages
    }
