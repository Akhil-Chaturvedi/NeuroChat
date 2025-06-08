# NeuroChat: Infinite Memory AI Agent 🧠

NeuroChat is an AI assistant designed to remember every conversation, continuously updating its memory as you interact with it. It features a ChatGPT-style interface for managing multiple chat sessions and allows you to import your entire ChatGPT conversation history to give your AI a powerful, pre-existing knowledge base.

## Features

* [cite_start]**Unlimited Long-Term Memory**: Stores all conversations using ChromaDB, allowing for virtually unlimited memory storage.
* [cite_start]**Automatic Memory Updates**: Every interaction (both user input and AI response) is automatically saved to the database in real-time.
* [cite_start]**Searchable Past Conversations**: The AI can retrieve relevant past messages based on semantic meaning, providing context-aware responses.
* [cite_start]**ChatGPT-Style Chat Sessions**: Create and switch between separate chat sessions, similar to ChatGPT's sidebar.
* [cite_start]**ChatGPT History Import**: Easily upload your exported ChatGPT conversations (JSON file) to pre-populate your AI's memory with all your past discussions. [cite_start]Each imported conversation becomes a new, separate chat session.
* [cite_start]**Temporary Chat Mode**: Engage in conversations that do not get saved to the database, while still allowing the AI to access existing memories for personalized responses.
* [cite_start]**Flexible AI Model**: Utilizes powerful language models via OpenRouter (e.g., `google/gemini-2.0-flash-exp:free` for large context windows).

## Project Structure