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

# MODIFIED: Added optional message_timestamp parameter
def save_to_memory(text: str, chat_id: str, role: str, content_type: str = "text", media_url: str = None, message_timestamp: float = None):
    # Check if the collection is valid before adding
    if not collection:
        print("Error: ChromaDB collection not initialized.")
        return

    # Use the provided timestamp, or generate a new one if not provided (for live chats)
    final_timestamp = message_timestamp if message_timestamp is not None else datetime.now().timestamp()

    metadata = {
        "chat_id": chat_id,
        "role": role,
        "content_type": content_type,
        "message_timestamp": final_timestamp # Use the correct final timestamp
    }
    if media_url: # Only add media_url if it's provided
        metadata["media_url"] = media_url

    collection.add(
        documents=[text],
        metadatas=[metadata],
        ids=[f"{chat_id}_{role}_{uuid.uuid4().hex}"] # Use uuid4 for unique IDs
    )

def get_messages_for_chat(chat_id: str, page: int = 1, page_size: int = 30):
    if not collection:
        print("Error: ChromaDB collection not initialized.")
        return {"messages": [], "total_messages_in_chat": 0, "page": page, "page_size": page_size}

    # Fetch all messages for the chat_id.
    # Using a high number for n_results to effectively get all messages.
    # ChromaDB's default limit is 10 if n_results is not provided.
    # Consider a more robust way if chat histories can exceed this significantly,
    # though 5000 should cover most cases.
    results = collection.get(
        where={"chat_id": chat_id},
        n_results=5000, # Explicitly ask for a large number of results
        include=['metadatas', 'documents'] # Ensure we get both metadatas and documents
    )

    all_messages = []
    docs = results.get("documents", [])
    metas = results.get("metadatas", [])

    for doc, meta in zip(docs, metas):
        message_timestamp = meta.get("message_timestamp", 0) # Default to 0 if not present
        message = {
            "role": meta.get("role"),
            "text": doc,
            "content_type": meta.get("content_type", "text"),
            "media_url": meta.get("media_url"),
            "message_timestamp": message_timestamp
        }
        all_messages.append(message)

    # Sort messages by timestamp in descending order (newest first)
    # For messages lacking a timestamp (e.g. legacy data), they will be at the end.
    all_sorted_messages = sorted(all_messages, key=lambda x: x.get('message_timestamp', 0), reverse=True)

    total_messages_in_chat = len(all_sorted_messages)

    # Implement pagination
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    paginated_messages = all_sorted_messages[start_index:end_index]

    return {
        "messages": paginated_messages,
        "total_messages_in_chat": total_messages_in_chat,
        "page": page,
        "page_size": page_size
    }

def save_changes():
    # PersistentClient automatically saves changes to disk,
    # so an explicit persist() call is often not needed.
    # However, keeping it as a placeholder might be useful for future changes
    # or if you switch to a client that requires it.
    pass