// Function to update the active chat in the UI
let activeChatId = null; // Keep track of the currently active chat
const MESSAGES_PER_PAGE = 30; // Number of messages to fetch per batch (for future pagination)
let chatMessageStates = {}; // Stores pagination state for each chat { chatId: { currentPage: 0, isLoading: false, allMessagesLoaded: false } }

// DOM Elements
const messagesDiv = document.getElementById("messages");
const loadingIndicator = document.getElementById("loadingIndicator");
const progressBarContainer = document.getElementById("progressBarContainer");
const progressBar = document.getElementById("progressBar");
const uploadStatus = document.getElementById("uploadStatus"); // Get the uploadStatus element
const chatListDiv = document.getElementById('chatList'); // Get the chat list div
const newChatBtn = document.getElementById('newChatBtn'); // Get the new chat button

// --- Warning on Page Exit during upload ---
let isUploading = false;

window.onbeforeunload = function() {
    if (isUploading) {
        return "An import is in progress. Are you sure you want to leave? Your progress may be lost.";
    }
};

async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const status = document.getElementById("uploadStatus");

  // Reset progress bar and status for new upload
  progressBarContainer.style.display = "none";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";
  progressBar.style.backgroundColor = "var(--primary-color)";
  status.textContent = ""; // Clear previous status messages
  status.style.color = "var(--primary-color)";


  if (!fileInput.files.length) {
    status.textContent = "Please select a .zip file first.";
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  status.textContent = "Uploading file...";
  progressBarContainer.style.display = "block"; // Show progress bar container
  isUploading = true; // Set uploading flag

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const taskId = data.task_id;
    status.textContent = data.message;
    status.style.color = "orange"; // Indicate background processing

    // Start polling for status
    const pollInterval = setInterval(async () => {
        try {
            const statusResponse = await fetch(`/upload-status/${taskId}`);
            if (!statusResponse.ok) {
                const errorData = await statusResponse.json();
                throw new Error(errorData.detail || `HTTP error! status: ${statusResponse.status}`);
            }
            const statusData = await statusResponse.json();

            progressBar.style.width = `${statusData.progress}%`;
            progressBar.textContent = `${statusData.progress}%`;
            
            if (statusData.status === "completed") {
                clearInterval(pollInterval);
                status.textContent = statusData.message;
                status.style.color = "green";
                progressBar.style.backgroundColor = "green";
                isUploading = false; // Reset uploading flag
                loadChatList(); // Refresh the chat list after successful import
            } else if (statusData.status === "error") {
                clearInterval(pollInterval);
                status.textContent = `Error: ${statusData.message}`;
                status.style.color = "red";
                progressBar.style.backgroundColor = "red";
                isUploading = false; // Reset uploading flag
            } else {
                status.textContent = statusData.message; // Update with ongoing message
            }
        } catch (error) {
            clearInterval(pollInterval);
            status.textContent = `Error polling status: ${error.message}`;
            status.style.color = "red";
            progressBar.style.backgroundColor = "red";
            isUploading = false; // Reset uploading flag
            console.error("Error polling status:", error);
        }
    }, 1000); // Poll every 1 second

  } catch (error) {
    status.textContent = `Upload failed: ${error.message}`;
    status.style.color = "red";
    progressBarContainer.style.display = "none"; // Hide progress bar on immediate failure
    isUploading = false; // Reset uploading flag
    console.error("Upload error:", error);
  }
}

// Function to create a new chat session (clears messages, sets activeChatId to null)
function createNewChat() {
    activeChatId = null;
    messagesDiv.innerHTML = "<p class='initial-message'>Select a chat from the sidebar or start a new one.</p>"; // Clear existing messages
    document.getElementById("chatTitle").textContent = "New Chat";
    document.getElementById("chatInput").value = "";
    document.getElementById("chatInput").focus();
    chatMessageStates = {}; // Clear any existing chat message states for a fresh start
    chatListDiv.style.display = 'block'; // Ensure sidebar is visible when starting new chat
    loadingIndicator.style.display = 'none'; // Hide loading indicator
}

// Function to load message history for a specific chat
async function loadChat(chatId) {
    activeChatId = chatId;
    messagesDiv.innerHTML = ""; // Clear previous messages immediately
    loadingIndicator.style.display = 'block'; // Show loading indicator

    // Reset state for this chat, or initialize if new
    chatMessageStates[chatId] = chatMessageStates[chatId] || { currentPage: 0, isLoading: false, allMessagesLoaded: false };

    try {
        const response = await fetch(`/chat/${chatId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const chatData = await response.json();
        document.getElementById("chatTitle").textContent = chatData.title || "Untitled Chat";
        
        if (chatData.messages && chatData.messages.length > 0) {
            renderMessages(chatData.messages);
        } else {
            messagesDiv.innerHTML = `<p class="initial-message">No messages found for this chat.</p>`;
        }

        // Keep the chat history sidebar visible
        chatListDiv.style.display = 'block'; 

    } catch (error) {
        messagesDiv.innerHTML = `<p style="color: red;">Error loading chat: ${error.message}</p>`;
        console.error("Error loading chat:", error);
    } finally {
        loadingIndicator.style.display = 'none'; // Hide loading indicator
    }
}


function renderMessages(messages) {
    // Clear initial message if present
    const initialMessage = messagesDiv.querySelector('.initial-message');
    if (initialMessage) {
        initialMessage.remove();
    }
    
    messages.forEach(msg => {
        const messageElement = document.createElement("div");
        messageElement.classList.add("message", msg.role); // 'user' or 'assistant' class

        let contentHtml = "";

        if (msg.content_type === "text" || msg.content_type === "code") {
            const rawText = msg.text || '';
            // Use marked.js for Markdown parsing
            const parsedHtml = marked.parse(rawText);
            // Sanitize the HTML to prevent XSS attacks
            const sanitizedHtml = DOMPurify.sanitize(parsedHtml);

            if (msg.content_type === "code") {
                messageElement.classList.add("code"); // Add a class for code styling
                contentHtml = `<pre><code>${sanitizedHtml}</code></pre>`; // Render preformatted code
            } else {
                contentHtml = `<div class="message-text">${sanitizedHtml}</div>`; // Wrap text in a div for styling
            }
        } else if (msg.content_type === "image" && msg.media_url) {
            // Include alt text if text is available, otherwise a generic description
            const altText = msg.text && msg.text !== 'Image generated by user.' && msg.text !== 'Image generated by assistant.' ? escapeHTML(msg.text) : `Image by ${msg.role}`;
            contentHtml = `<img src="${msg.media_url}" alt="${altText}" class="chat-image">`;
            if (msg.text && msg.text !== 'Image generated by user.' && msg.text !== 'Image generated by assistant.') {
                const parsedText = marked.parse(msg.text);
                const sanitizedText = DOMPurify.sanitize(parsedText);
                contentHtml += `<div class="image-caption">${sanitizedText}</div>`; // Display text below image if not generic
            }
        }
        // Add more content types as needed (e.g., video, audio)

        messageElement.innerHTML = contentHtml;
        messagesDiv.appendChild(messageElement);
    });
    // Scroll to the bottom after rendering new messages
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// Utility to escape HTML for safety (still useful for alt text etc.)
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}


// Function to send a message (placeholder for now)
function sendMessage() {
  const input = document.getElementById("chatInput");
  const messageText = input.value.trim();

  if (messageText) {
    // For now, just append user message to UI
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", "user");
    messageElement.innerHTML = `<div class="message-text">${marked.parse(messageText)}</div>`; // Use marked for user input too
    messagesDiv.appendChild(messageElement);

    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom

    input.value = ""; // Clear input

    // In a real scenario, after sending, you'd get an AI response
    // and then call a backend API to save both user and AI message,
    // and then refresh the chat or append the AI's response.
  }
}

// Function to load the list of chats
async function loadChatList() {
    // Clear existing content and show loading message
    chatListDiv.innerHTML = '<p class="loading-chats-message">Loading chats...</p>'; 

    try {
        const response = await fetch('/chats');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const chats = await response.json();
        
        // Clear loading message and existing content
        chatListDiv.innerHTML = ''; 

        if (chats.length === 0) {
            chatListDiv.innerHTML = '<p class="no-chats-message">No chats imported yet.</p>';
        } else {
            const ul = document.createElement('ul');
            chats.forEach(chat => {
                const li = document.createElement('li');
                // Ensure the chat ID is properly escaped for the onclick attribute
                li.innerHTML = `<a href="#" onclick="loadChat('${escapeHTML(chat.id)}')">${escapeHTML(chat.title)}</a>`;
                ul.appendChild(li);
            });
            chatListDiv.appendChild(ul);
        }
    } catch (error) {
        chatListDiv.innerHTML = `<p style="color: red;">Error loading chats: ${error.message}</p>`;
        console.error("Error loading chat list:", error);
    }
}


// Options Panel Toggle
document.addEventListener('DOMContentLoaded', () => {
  const optionsBtn = document.getElementById('optionsBtn');
  const optionsPanel = document.getElementById('optionsPanel');
  const apiKeyInput = document.getElementById('apiKeyInput'); // Added for future use
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn'); // Added for future use
  
  if (optionsBtn && optionsPanel) {
    optionsBtn.addEventListener('click', () => {
      if (optionsPanel.style.display === 'none' || optionsPanel.style.display === '') {
        optionsPanel.style.display = 'block'; // Or 'flex' if it's a flex container
      } else {
        optionsPanel.style.display = 'none';
      }
    });
  }

  // Hook up the new chat button
  if (newChatBtn) {
    newChatBtn.addEventListener('click', createNewChat);
  }

  // Placeholder for saving API key
  if (saveApiKeyBtn && apiKeyInput) {
    saveApiKeyBtn.addEventListener('click', () => {
      const apiKey = apiKeyInput.value;
      console.log("Attempting to save API Key (not implemented):", apiKey ? "********" : "empty");
      // Here you would typically send this to the backend or store it in localStorage
      // For now, just a log and maybe clear the input or give feedback
      alert("API Key save functionality not fully implemented yet.");
    });
  }

  // Load chat list on page load
  loadChatList();
});