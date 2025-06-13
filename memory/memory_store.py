import chromadb
import os
import uuid
from datetime import datetime

CHROMA_PATH = "storage/chroma"
COLLECTION_NAME = "memory"

# Ensure the ChromaDB path exists
os.makedirs(CHROMA_PATH, exist_ok=True)

# Initialize the ChromaDB client using the new PersistentClient API
client = chromadb.PersistentClient(path=CHROMA_PATH)

# Get or create the collection
collection = client.get_or_create_collection(COLLECTION_NAME)

def save_to_memory(text: str, chat_id: str, role: str, content_type: str = "text", media_url: str = None, message_timestamp: float = None):
    if not collection:
        print("Error: ChromaDB collection not initialized.")
        return

    final_timestamp = message_timestamp if message_timestamp is not None else datetime.now().timestamp()
    metadata = {
        "chat_id": chat_id,
        "role": role,
        "content_type": content_type,
        "message_timestamp": final_timestamp
    }
    if media_url:
        metadata["media_url"] = media_url

    collection.add(
        documents=[text],
        metadatas=[metadata],
        ids=[f"{chat_id}_{role}_{uuid.uuid4().hex}"]
    )

def get_messages_for_chat(chat_id: str, page: int = 1, page_size: int = 30):
    if not collection:
        print("Error: ChromaDB collection not initialized.")
        return {"messages": [], "total_messages_in_chat": 0, "page": page, "page_size": page_size}

    results = collection.get(
        where={"chat_id": chat_id},
        include=['metadatas', 'documents'] 
    )

    all_messages = []
    docs = results.get("documents", [])
    metas = results.get("metadatas", [])

    for doc, meta in zip(docs, metas):
        message = {
            "role": meta.get("role"),
            "text": doc,
            "content_type": meta.get("content_type", "text"),
            "media_url": meta.get("media_url"),
            "message_timestamp": meta.get("message_timestamp", 0)
        }
        all_messages.append(message)

    all_sorted_messages = sorted(all_messages, key=lambda x: x.get('message_timestamp', 0), reverse=True)
    total_messages_in_chat = len(all_sorted_messages)
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    paginated_messages = all_sorted_messages[start_index:end_index]

    return {
        "messages": paginated_messages,
        "total_messages_in_chat": total_messages_in_chat,
        "page": page,
        "page_size": page_size
    }

# NEW: Function to delete all messages for a given chat_id from ChromaDB
def delete_messages_for_chat(chat_id: str):
    """Deletes all documents (messages) for a specific chat_id from the collection."""
    if not collection:
        print("Error: ChromaDB collection not initialized.")
        return
    
    try:
        collection.delete(where={"chat_id": chat_id})
        print(f"Successfully deleted all messages for chat_id: {chat_id}")
    except Exception as e:
        print(f"Error deleting messages for chat_id {chat_id}: {e}")

def save_changes():
    pass