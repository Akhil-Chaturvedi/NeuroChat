# In chat/ai_services.py

from openai import OpenAI
import os
from chat import state
from sentence_transformers import SentenceTransformer
import re # <-- New import added

# This variable will hold our local embedding model. It starts as None.
embedding_model = None

# This will hold the available models from the selected provider
available_models_cache = []

# --- [NEW HELPER FUNCTION ADDED] ---
def _get_context_length(model_id: str) -> int:
    """
    Parses the context length from a model ID string.
    Looks for patterns like '8k', '16k', '32k' or numbers like '8192', '16384'.
    Returns an integer representing the context window size.
    """
    model_id_lower = model_id.lower()
    # Check for 'k' notation, e.g., "8k" -> 8 * 1024
    k_match = re.search(r'(\d+)k', model_id_lower)
    if k_match:
        return int(k_match.group(1)) * 1024

    # Check for raw numbers, prioritizing larger ones (like 8192 over 70 in llama-70b-8192)
    numbers = re.findall(r'\d+', model_id_lower)
    if numbers:
        # Convert to int and find the largest number, assuming it's the context
        # This correctly handles names like "llama3-70b-8192" -> 8192
        return max(int(n) for n in numbers)

    # Return a default low value if no context length is found
    return 0

# --- [EXISTING FUNCTION REPLACED WITH NEW VERSION] ---
def initialize_client(api_key: str) -> bool:
    """
    Initializes a client, gets all available models, parses their context length,
    and sorts them from largest context window to smallest.
    """
    global available_models_cache
    if not api_key:
        state.ai_client = None
        available_models_cache = []
        return False

    base_url = ""
    provider_name = "Unknown"

    if api_key.startswith("gsk_"):
        print("Groq key detected.")
        provider_name = "Groq"
        base_url = "https://api.groq.com/openai/v1"
    elif api_key.startswith("sk-or-"):
        print("OpenRouter key detected.")
        provider_name = "OpenRouter"
        base_url = "https://openrouter.ai/api/v1"
    else:
        print("Unknown API key format. Cannot initialize client.")
        return False

    try:
        state.ai_client = OpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        models_response = state.ai_client.models.list()
        
        # Create a list of model objects with context length
        model_details = []
        for model in models_response.data:
            context_window = _get_context_length(model.id)
            model_details.append({"id": model.id, "context_window": context_window})
            
        # Sort the list of models by context_window in descending order
        available_models_cache = sorted(model_details, key=lambda m: m.get("context_window", 0), reverse=True)
        
        print(f"Successfully initialized client for {provider_name}. Found {len(available_models_cache)} models (sorted by context length).")
        return True
    except Exception as e:
        print(f"Failed to initialize client for {provider_name}: {e}")
        state.ai_client = None
        available_models_cache = []
        return False

# --- [UNCHANGED FUNCTIONS FROM OLD CODE] ---
def get_available_models() -> list[dict]:
    """Returns the cached list of available models."""
    return available_models_cache

def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Creates embeddings using the LOCAL model.
    Loads the model on the first call if it's not already in memory.
    """
    global embedding_model # We need this to modify the global variable

    # This is the "lazy loading" logic. It only runs if the model is not yet loaded.
    if embedding_model is None:
        try:
            print("First use of embeddings: loading local model into memory...")
            embedding_model = SentenceTransformer('TaylorAI/bge-micro-v2') 
            print("Successfully loaded local embedding model.")
        except Exception as e:
            print(f"!!! FATAL: Could not load local embedding model. Error: {e}")
            # We raise an exception to stop the process if the model can't be loaded.
            raise Exception("Failed to load embedding model on first use.")
    
    print(f"Creating local embeddings for {len(texts)} text chunk(s)...")
    try:
        embeddings = embedding_model.encode(texts, convert_to_tensor=False).tolist()
        print("Successfully created local embeddings.")
        return embeddings
    except Exception as e:
        print(f"Error creating local embeddings: {e}")
        raise e

def get_ai_response(messages: list[dict], model: str) -> str:
    """Gets a response from the AI model using the client from the central state."""
    if not state.ai_client:
        return "AI client not initialized. Please set a valid API key in the options."
    try:
        completion = state.ai_client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"Error getting AI response from model {model}: {e}")
        return f"Sorry, I encountered an error with the AI model: {str(e)}"
