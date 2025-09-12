### High-Level Overview

NeuroChat is a sophisticated, self-hosted chat application featuring a Python backend powered by the FastAPI framework and a dynamic, vanilla JavaScript frontend. Its core purpose is to provide a feature-rich chat interface that can be augmented with personal documents and existing chat histories, creating a unified and context-aware AI memory.

### Core Features

*   **Retrieval-Augmented Generation (RAG):** Users can upload `.txt` and `.md` files, which are processed, chunked, and stored as vector embeddings. The application then uses this knowledge base to provide contextually relevant answers.
*   **Multi-Provider AI Support:** The application is designed to work with multiple AI providers. It intelligently detects whether an API key is for **Groq** or **OpenRouter** based on its prefix and configures the client accordingly.
*   **Intelligent Model Management:** It automatically fetches all available models from the configured provider, parses their context window size from the model ID, and recommends the one with the largest context window.
*   **Local Embeddings:** Text embeddings are generated locally using the `SentenceTransformer` library (`TaylorAI/bge-micro-v2`), ensuring user data privacy and eliminating costs associated with embedding APIs.
*   **ChatGPT History Import:** A key feature is the ability to import a `conversations.json` file from a ChatGPT data export. The system parses this file in the background, preserves metadata, and integrates the conversations into its own memory.
*   **Unified Memory System:** It uses a **ChromaDB** persistent vector store as its "unified memory." This single collection holds vectorized data from uploaded files, imported chat histories, and new conversations, making all information searchable.
*   **Advanced Chat Functionality:**
    *   **Temporary Chats:** Users can start temporary chats that are not saved to the permanent store, managed within the browser's session storage.
    *   **Chat Management:** Full support for creating, renaming, deleting, archiving, and unarchiving chats.
    *   **Source Filtering:** A modal allows users to select specific files or past conversations to be used as a knowledge source for their queries.
*   **Transparent AI Reasoning:** The system is built to capture and display the AI's "thought process." It groups hidden reasoning and tool-use steps with the final answer, presenting them in collapsible sections in the UI.

### Component Breakdown

#### Backend (FastAPI)

*   **`main.py`:** The application's entry point. It defines all API endpoints, handles request validation using Pydantic models, and manages the application's lifespan. A notable feature is a robust startup script that checks for and installs any missing Python packages from `requirements.txt`.
*   **`chat/ai_services.py`:** Manages all interactions with AI models. It initializes the AI client, caches the list of available models sorted by context length, generates local embeddings, and fetches chat completions.
*   **`memory/memory_store.py`:** The interface for the ChromaDB vector database. It handles saving new data (file chunks, chat messages) and querying the unified memory. Its most complex function, `get_messages_for_chat`, retrieves chat history and intelligently groups and formats AI reasoning steps for the frontend.
*   **`chat/chat_manager.py`:** Manages the metadata and state of all chat sessions. It interacts with a `chat_state.json` file to keep track of chat titles, timestamps, and archived status. It also manages the metadata for all knowledge sources in `sources_meta.json`.
*   **`chat/data_processor.py`:** Contains the logic for processing incoming data. This includes a detailed parser for the `conversations.json` export and the function that splits uploaded text files into manageable chunks for embedding.
*   **`chat/importer.py`:** Defines the API endpoint for handling file uploads (specifically for the ChatGPT import). It uses background tasks to process the large JSON file without blocking the server, with status updates available via a separate endpoint.

#### Frontend (Vanilla JavaScript)

*   **`index.html`:** The single HTML file that provides the structure for the entire user interface, including the sidebar, main chat area, options panel, and sources modal.
*   **`script.js`:** The main logic hub for the frontend. It's a modern, module-based script that manages the application state, handles all user interactions (sending messages, managing chats), makes `fetch` calls to the backend API, and manipulates the DOM to display data.
*   **`messageRenderer.js`:** A dedicated module for rendering individual chat messages. It takes a message object and generates the corresponding HTML, including complex elements like collapsible reasoning sections, model information, and properly formatted code blocks using the `marked.js` library.
*   **`style.css`:** Provides the application's aesthetic. It uses a modern, responsive design with CSS variables for a consistent and clean dark-mode theme.
