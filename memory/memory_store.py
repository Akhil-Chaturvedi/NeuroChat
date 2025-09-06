# memory/memory_store.py

import chromadb
import uuid
import json
import re
from datetime import datetime
from chat.ai_services import embed_texts

chroma_client = chromadb.PersistentClient(path="storage/chroma")

try:
    unified_memory_collection = chroma_client.get_or_create_collection(name="unified_memory")
    print("Successfully connected to ChromaDB and got 'unified_memory' collection.")
except Exception as e:
    print(f"FATAL: Could not connect to ChromaDB. Error: {e}")
    unified_memory_collection = None

def save_imported_message(chat_id: str, message_obj: dict, order_index: int):
    if not unified_memory_collection: return
    message_id = f"msg_{uuid.uuid4().hex}"
    role = message_obj.get("role", "unknown")
    text = message_obj.get("text", "")
    try:
        create_time_str = message_obj.get("create_time")
        if create_time_str:
            if 'Z' in create_time_str or '+' in create_time_str:
                 dt_obj = datetime.fromisoformat(create_time_str.replace('Z', '+00:00'))
            else:
                 dt_obj = datetime.fromisoformat(create_time_str)
            timestamp = dt_obj.timestamp()
        else:
            timestamp = 0
    except (TypeError, ValueError):
        timestamp = 0
    
    metadata = {
        "source_id": chat_id, "source_type": "chat_history", "role": role,
        "timestamp": timestamp, "content_type": message_obj.get("content_type", "text"),
        "is_hidden": message_obj.get("is_hidden", False),
        "model_slug": message_obj.get("model_slug") or "",
        "citations": json.dumps(message_obj.get("citations", [])),
        "details_title": message_obj.get("details_title") or "",
        "details_content": message_obj.get("details_content") or "",
        "order_index": order_index
    }
    
    if message_obj.get("custom_instructions"):
        metadata["custom_instructions"] = message_obj["custom_instructions"]

    if not text.strip() and not message_obj.get("custom_instructions"):
        return
        
    unified_memory_collection.add(ids=[message_id], documents=[text], metadatas=[metadata])

def save_chunks_to_memory(ids: list, chunks: list, embeddings: list, metadatas: list):
    if not unified_memory_collection: return
    unified_memory_collection.add(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas)

def save_to_memory(text: str, chat_id: str, role: str, content_type: str = "text", media_url: str = None, message_timestamp: float = None, model_slug: str = None):
    if not unified_memory_collection: return
    
    message_id = f"msg_{uuid.uuid4().hex}"
    timestamp = message_timestamp if message_timestamp is not None else datetime.now().timestamp()
    
    existing_messages = unified_memory_collection.get(where={"source_id": chat_id}, include=[])
    order_index = len(existing_messages.get("ids", []))

    metadata = {
        "source_id": chat_id, "source_type": "chat_message", "role": role, "timestamp": timestamp,
        "content_type": content_type or "text", "media_url": media_url or "",
        "is_hidden": False,
        "model_slug": model_slug or "",
        "citations": "[]",
        "order_index": order_index
    }
    
    embedding = embed_texts([text])[0]
    unified_memory_collection.add(ids=[message_id], documents=[text], embeddings=[embedding], metadatas=[metadata])

def _process_citations_in_text(text: str, citations: list) -> str:
    """
    Replaces raw citation markers (e.g., 【6†L278-L283】) with simple,
    machine-readable placeholders (e.g., [CITATION:6]) for the frontend to handle.
    It also handles image markers and duplicate adjacent markers.
    """
    if not text: return ""

    processed_text = re.sub(r"【\d+†embed_image】", "", text)

    if not citations or '【' not in processed_text:
        return re.sub(r"\*\*Sources:\*\*.*", "", processed_text, flags=re.DOTALL).strip()

    def replacer(match):
        try:
            internal_idx = int(match.group(1))
            return f'[CITATION:{internal_idx}]'
        except (ValueError, IndexError):
            return ''

    processed_text = re.sub(r"【(\d+).*?】", replacer, processed_text)
    
    processed_text = re.sub(r"(\[CITATION:\d+\])\1+", r"\1", processed_text)

    final_text = re.sub(r"\*\*Sources:\*\*.*", "", processed_text, flags=re.DOTALL).strip()
    
    return final_text

def get_messages_for_chat(chat_id: str, page: int = 1, page_size: int = 40) -> dict:
    if not unified_memory_collection:
        return {"messages": [], "total_messages_in_chat": 0, "page": page, "page_size": page_size}
    
    results = unified_memory_collection.get(where={"source_id": chat_id}, include=["metadatas", "documents"])
    all_messages = []
    if results and results['ids']:
        for doc, meta in zip(results.get("documents", []), results.get("metadatas", [])):
            if meta.get("source_type") in ["chat_history", "chat_message"]:
                message = {
                    "role": meta.get("role"), "text": doc,
                    "content_type": meta.get("content_type", "text"),
                    "timestamp": meta.get("timestamp", 0),
                    "is_hidden": meta.get("is_hidden", False),
                    "model_slug": meta.get("model_slug"),
                    "citations": json.loads(meta.get("citations", "[]") or "[]"),
                    "order_index": meta.get("order_index", -1)
                }
                if meta.get("custom_instructions"):
                    message["custom_instructions"] = meta.get("custom_instructions")
                all_messages.append(message)

    all_sorted_messages = sorted(all_messages, key=lambda x: (x.get('order_index', -1), x.get('timestamp', 0)))
    
    grouped_messages = []
    i = 0
    while i < len(all_sorted_messages):
        current_msg = all_sorted_messages[i]
        if current_msg.get("role") == "assistant" and not current_msg.get("is_hidden"):
            sequence = [current_msg]
            j = i + 1
            while j < len(all_sorted_messages) and all_sorted_messages[j].get("is_hidden"):
                sequence.append(all_sorted_messages[j])
                j += 1
            if j < len(all_sorted_messages) and all_sorted_messages[j].get("role") == "assistant" and not all_sorted_messages[j].get("is_hidden"):
                final_answer_msg = all_sorted_messages[j]
                sequence.append(final_answer_msg)
                intro_msg = sequence[0]
                intro_text = intro_msg['text']
                final_text = final_answer_msg['text']
                prompt_details = None
                for msg in sequence:
                    if msg.get("content_type") == "code" and msg.get("text", "").strip().startswith('{'):
                        try:
                            tool_data = json.loads(msg["text"])
                            if "title" in tool_data and "prompt" in tool_data:
                                prompt_content = f"Title: {tool_data.get('title', 'N/A')}\n\nPrompt: {tool_data.get('prompt', 'N/A')}"
                                prompt_details = {"title": "Show Research Task Details", "content": prompt_content}
                                break
                        except json.JSONDecodeError:
                            continue
                content_parts = [{'type': 'text', 'content': intro_text}]
                if prompt_details:
                    content_parts.append({'type': 'details', **prompt_details})
                if final_text and final_text != intro_text:
                    content_parts.append({'type': 'text', 'content': final_text})
                merged_msg = {
                    **final_answer_msg,
                    'model_slug': intro_msg.get("model_slug"),
                    'is_merged_message': True,
                    'content_parts': content_parts,
                    'text': None
                }
                grouped_messages.append(merged_msg)
                i = j + 1
                continue
        if not current_msg.get("is_hidden"):
            grouped_messages.append(current_msg)
        i += 1

    final_processed_messages = []
    for msg in grouped_messages:
        citations = msg.get("citations", [])
        if citations:
            if msg.get('is_merged_message'):
                for part in msg.get('content_parts', []):
                    if part.get('type') == 'text' and part.get('content'):
                        part['content'] = _process_citations_in_text(part['content'], citations)
            elif msg.get('text'):
                msg['text'] = _process_citations_in_text(msg['text'], citations)
        final_processed_messages.append(msg)
    
    total_messages_in_chat = len(final_processed_messages)
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    paginated_messages = final_processed_messages[start_index:end_index]
    
    return {
        "messages": paginated_messages,
        "total_messages_in_chat": total_messages_in_chat,
        "page": page, "page_size": page_size
    }

def delete_messages_for_chat(chat_id: str):
    if not unified_memory_collection: return
    unified_memory_collection.delete(where={"source_id": chat_id})

def query_unified_memory(query_text: str, source_ids: list[str] | None = None, n_results: int = 5) -> list[dict]:
    if not unified_memory_collection: return []
    
    query_embedding = embed_texts([query_text])[0]
    filter_metadata = {"source_id": {"$in": source_ids}} if source_ids else None
    
    results = unified_memory_collection.query(
        query_embeddings=[query_embedding], n_results=n_results,
        where=filter_metadata, include=["documents", "metadatas"]
    )
    
    combined_results = []
    if results and results.get('ids') and results['ids'][0]:
        for i, doc_id in enumerate(results['ids'][0]):
            combined_results.append({
                "id": doc_id, "document": results['documents'][0][i],
                "metadata": results['metadatas'][0][i]
            })
    return combined_results
