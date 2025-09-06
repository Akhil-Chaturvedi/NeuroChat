# chat/state.py

# This dictionary will be shared across the application to track background task progress.
task_statuses = {}

# This will be the single, authoritative instance of the AI client for the entire app.
ai_client = None
