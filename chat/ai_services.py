# chat/ai_services.py

from openai import OpenAI

# The client is None by default. It will be initialized by the user's key.
client = None
# This will cache the list of available models for a given key
available_models_cache = []

def initialize_client(api_key: str):
    """Initializes the OpenAI client with the user's API key for OpenRouter."""
    global client, available_models_cache
    try:
        # Create a new client instance with the provided key
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )
        # Test the client by fetching models
        models_response = client.models.list()
        available_models_cache = sorted([model.id for model in models_response.data])
        print(f"Successfully initialized AI client with a new key. Found {len(available_models_cache)} models.")
        return True
    except Exception as e:
        print(f"Failed to initialize AI client: {e}")
        # Reset state on failure
        client = None
        available_models_cache = []
        return False

def get_available_models():
    """Returns the cached list of available models."""
    return available_models_cache

def get_ai_response(messages: list, model: str):
    """Gets a response from the AI model."""
    if not client:
        # This error message will be shown to the user if they try to chat without a valid key.
        return "AI client not initialized. Please set a valid API key in the options."
    
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"Error getting AI response from model {model}: {e}")
        return f"Sorry, I encountered an error with the AI model: {str(e)}"