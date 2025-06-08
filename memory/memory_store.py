import chromadb
import os
import uuid

CHROMA_PATH = "storage/chroma"
COLLECTION_NAME = "memory"

# Ensure the ChromaDB path exists
os.makedirs(CHROMA_PATH, exist_ok=True)

# Initialize the ChromaDB client using the new PersistentClient API
client = chromadb.PersistentClient(path=CHROMA_PATH)

# Get or create the collection
collection = client.get_or_create_collection(COLLECTION_NAME)

def save_to_memory(text: str, chat_id: str, role: str, content_type: str = "text", media_url: str = None):
    # Check if the collection is valid before adding
    if not collection:
        print("Error: ChromaDB collection not initialized.")
        return

    metadata = {
        "chat_id": chat_id,
        "role": role,
        "content_type": content_type # Store content type
    }
    if media_url: # Only add media_url if it's provided
        metadata["media_url"] = media_url

    collection.add(
        documents=[text],
        metadatas=[metadata],
        ids=[f"{chat_id}_{role}_{uuid.uuid4().hex}"] # Use uuid4 for unique IDs
    )

def get_messages_for_chat(chat_id: str):
    if not collection:
        print("Error: ChromaDB collection not initialized.")
        return []

    results = collection.query(
        query_texts=[" "],  # Dummy query to pull all relevant messages
        n_results=1000, # Adjust as needed, or remove for all results if no limit is desired
        where={"chat_id": chat_id}
    )

    messages = []
    # Ensure results are iterated correctly, as they are often lists of lists
    # Flatten the documents and metadatas lists
    docs = results.get("documents", [])[0] if results.get("documents") else []
    metas = results.get("metadatas", [])[0] if results.get("metadatas") else []

    # Reconstruct messages with full metadata
    for doc, meta in zip(docs, metas):
        message = {
            "role": meta.get("role"),
            "text": doc,
            "content_type": meta.get("content_type", "text"), # Default to text
            "media_url": meta.get("media_url") # Retrieve media URL
        }
        messages.append(message)

    return messages

def save_changes():
    # PersistentClient automatically saves changes to disk,
    # so an explicit persist() call is often not needed.
    # However, keeping it as a placeholder might be useful for future changes
    # or if you switch to a client that requires it.
    pass
