# chat/data_processor.py
import uuid
import json
import datetime
from chat.ai_services import embed_texts
from memory.memory_store import save_chunks_to_memory
from chat.chat_manager import add_file_source

# --- Helper Functions (keep _normalize_and_format_timestamp and _get_content_text as they are) ---
def _normalize_and_format_timestamp(ts: float | None) -> tuple[float | None, str | None]:
    if ts is None:
        return None, None
    normalized_ts = ts
    try:
        if ts > (datetime.datetime.now().timestamp() * 100):
            normalized_ts = ts / 1000.0
        iso_format = datetime.datetime.fromtimestamp(normalized_ts).isoformat()
        return normalized_ts, iso_format
    except (TypeError, ValueError, OSError) as e:
        print(f"Warning: Could not process timestamp '{ts}'. Error: {e}. Storing as is.")
        return ts, str(ts)

def _get_content_text(content_obj: dict | None) -> str:
    # ... (no changes here)
    if not content_obj:
        return ""
    content_type = content_obj.get("content_type")
    if content_type == "text":
        parts = content_obj.get("parts", [])
        return "".join(part for part in parts if isinstance(part, str))
    if content_type == "code":
        return content_obj.get("text", "")
    if content_type == "user_editable_context":
        return content_obj.get("user_instructions", "")
    return json.dumps(content_obj)

def _parse_message_node(node: dict) -> dict | None:
    if not node or "message" not in node or node["message"] is None:
        return None
    msg = node["message"]
    metadata = msg.get("metadata", {})
    author = msg.get("author", {})
    content = msg.get("content", {})
    _, formatted_create_time = _normalize_and_format_timestamp(msg.get("create_time"))

    is_hidden = metadata.get("is_visually_hidden_from_conversation", False)
    author_role = author.get("role")
    content_type = content.get("content_type")

    if author_role == "tool": is_hidden = True
    elif author_role == "assistant" and content_type == "code": is_hidden = True

    final_citations = metadata.get("citations", [])

    parsed_msg = {
        "message_id": msg.get("id"),
        "role": author_role,
        "create_time": formatted_create_time,
        "content_type": content_type,
        "text": _get_content_text(content),
        "status": msg.get("status"),
        "is_hidden": is_hidden,
        "model_slug": metadata.get("model_slug"),
        "finish_details": metadata.get("finish_details"),
        "citations": final_citations, # Use the preserved list
        "search_results": [], # This can be kept empty for now
        "custom_instructions": None
    }
    
    if metadata.get("is_user_system_message", False):
         user_context = metadata.get("user_context_message_data", {})
         parsed_msg["custom_instructions"] = user_context.get("about_model_message")

    return parsed_msg

def _parse_single_conversation(convo_data: dict) -> dict | None:
    mapping = convo_data.get("mapping", {})
    if not mapping: return None
    
    root_id = None
    for node_id, node in mapping.items():
        if node.get("parent") is None:
            root_id = node_id
            break
    if not root_id: return None

    ordered_messages = []
    current_node_id = root_id
    while current_node_id:
        node = mapping.get(current_node_id)
        if not node: break
        parsed_message = _parse_message_node(node)
        if parsed_message:
            ordered_messages.append(parsed_message)
        children = node.get("children", [])
        current_node_id = children[0] if children else None

    if not ordered_messages:
        return None

    custom_instructions_text = None
    final_messages = []
    for msg in ordered_messages:
        if msg.get("content_type") == "user_editable_context":
            custom_instructions_text = msg.get("custom_instructions")
        else:
            final_messages.append(msg)

    if custom_instructions_text and final_messages:
        for msg in final_messages:
            if not msg.get("is_hidden"):
                msg["custom_instructions"] = custom_instructions_text
                break
    
    if final_messages:
        normalized_create_time, _ = _normalize_and_format_timestamp(convo_data.get("create_time", 0))
        normalized_update_time, _ = _normalize_and_format_timestamp(convo_data.get("update_time", 0))
        return {
            "title": convo_data.get("title", "Untitled Chat"),
            "create_time": normalized_create_time,
            "update_time": normalized_update_time,
            "messages": final_messages
        }
        
    return None

def parse_chatgpt_export(json_data: list) -> list:
    all_parsed_conversations = []
    for convo_data in json_data:
        parsed_conv = _parse_single_conversation(convo_data)
        if parsed_conv:
            all_parsed_conversations.append(parsed_conv)
    print(f"Successfully parsed {len(all_parsed_conversations)} conversations with rich metadata.")
    return all_parsed_conversations

def process_and_store_file(file_content: str, filename: str):
    print(f"Processing file: {filename}")
    file_id = f"file_{uuid.uuid4().hex}"
    text_chunks = split_text_into_chunks(file_content)
    if not text_chunks:
        print(f"File {filename} has no content to process.")
        return
    print(f"Split file into {len(text_chunks)} chunks.")
    try:
        chunk_embeddings = embed_texts(text_chunks)
        print("Successfully created embeddings for all chunks.")
    except Exception as e:
        print(f"Error creating embeddings: {e}")
        return
    metadatas = []
    ids = []
    for i, chunk in enumerate(text_chunks):
        chunk_id = f"{file_id}chunk{i}"
        ids.append(chunk_id)
        metadatas.append({
            "source_id": file_id, 
            "source_type": "file",
            "source_name": filename, 
            "chunk_num": i
        })
    save_chunks_to_memory(
        ids=ids, 
        chunks=text_chunks,
        embeddings=chunk_embeddings, 
        metadatas=metadatas
    )
    add_file_source(file_id, filename)
    print(f"Successfully processed and stored file {filename} with source_id {file_id}")

def split_text_into_chunks(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> list[str]:
    if not text: return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap
    return chunks
