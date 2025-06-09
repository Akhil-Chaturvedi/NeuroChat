// Function to update the active chat in the UI
let activeChatId = null; // Keep track of the currently active chat
const MESSAGES_PER_PAGE = 30; // Number of messages to fetch per batch
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

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Upload failed.");
    }

    const data = await response.json();
    const taskId = data.task_id;
    status.textContent = "File uploaded. Processing chat history...";
    isUploading = true; // Set upload in progress flag

    // Start polling for status
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(`/upload-status/${taskId}`);
        if (!statusResponse.ok) {
          throw new Error(`Failed to get status: ${statusResponse.status}`);
        }
        const statusData = await statusResponse.json();

        progressBar.style.width = `${statusData.progress || 0}%`;
        progressBar.textContent = `${statusData.progress || 0}%`;
        status.textContent = statusData.message || "Processing...";

        if (statusData.status === "completed" || statusData.status === "error") {
          clearInterval(pollInterval); // Stop polling
          isUploading = false; // Reset upload in progress flag
          if (statusData.status === "completed") {
            status.textContent = `✅ ${statusData.message}`;
            status.style.color = "green";
            progressBar.style.backgroundColor = "green";
            loadChatList(); // Refresh chat list
            // Optionally auto-select the first newly imported chat or the last active
            if (statusData.chats && statusData.chats.length > 0) {
                // Find the ID of the first imported chat
                // This would require the /chats endpoint to return chat IDs
                // For now, just refresh the list and user can select
            }
          } else {
            status.textContent = `❌ Error: ${statusData.message}`;
            status.style.color = "red";
            progressBar.style.backgroundColor = "red";
          }
          progressBarContainer.style.display = "none"; // Hide progress bar after completion/error
        }
      } catch (error) {
        clearInterval(pollInterval);
        isUploading = false;
        console.error("Error polling status:", error);
        status.textContent = `❌ Error checking status: ${error.message}`;
        status.style.color = "red";
        progressBar.style.backgroundColor = "red";
        progressBarContainer.style.display = "none"; // Hide progress bar on error
      }
    }, 1000); // Poll every 1 second

  } catch (error) {
    isUploading = false; // Reset upload in progress flag
    console.error("Upload failed:", error);
    status.textContent = `❌ Upload failed: ${error.message}`;
    status.style.color = "red";
    progressBarContainer.style.display = "none"; // Hide progress bar on error
  }
}

// Function to fetch and display the list of chats
async function loadChatList() {
    const chatListDiv = document.getElementById('chatList');
    chatListDiv.innerHTML = '<p class="loading-chats-message">Loading chats...</p>'; // Show loading message

    try {
        const response = await fetch('/chats');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const chats = await response.json();

        chatListDiv.innerHTML = ''; // Clear loading message

        if (chats.length === 0) {
            chatListDiv.innerHTML = '<p class="no-chats-message">No chats imported yet. Upload a ChatGPT export file.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.className = 'chat-list';
            chats.forEach(chat => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#';
                a.dataset.chatId = chat.id;
                a.textContent = chat.title;
                a.onclick = (e) => {
                    e.preventDefault();
                    loadChat(chat.id);
                    // Update active class for styling
                    Array.from(document.querySelectorAll('.chat-list a')).forEach(link => {
                        link.classList.remove('active');
                    });
                    a.classList.add('active');
                };
                li.appendChild(a);
                ul.appendChild(li);
            });
            chatListDiv.appendChild(ul);
        }
    } catch (error) {
        console.error('Error loading chat list:', error);
        chatListDiv.innerHTML = `<p class="no-chats-message" style="color: red;">Error loading chats: ${error.message}</p>`;
    }
}


// Function to load and render messages for a specific chat
async function loadChat(chatId) {
    showLoadingIndicator("Loading chat...");
    messagesDiv.innerHTML = ''; // Clear current messages
    activeChatId = null; // Reset active chat until loaded

    try {
        const response = await fetch(`/chat/${chatId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const chatData = await response.json();

        // FIX: Safely check for messages and default to an empty array if missing.
        const messagesToRender = Array.isArray(chatData?.messages) ? chatData.messages : [];

        renderMessages(messagesToRender, true); // This is now safe from the error.
        document.getElementById('chatTitle').textContent = chatData?.title || 'New Chat'; // Also made title access safer
        activeChatId = chatId;
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom after loading

        // Set current page for this chat
        chatMessageStates[chatId] = {
            currentPage: 0,
            isLoading: false,
            allMessagesLoaded: true 
        };

    } catch (error) {
        console.error('Error loading chat:', error);
        messagesDiv.innerHTML = `<p class="initial-message" style="color: red;">Error loading chat: ${error.message}. Please try selecting another chat or import a new one.</p>`;
        document.getElementById('chatTitle').textContent = "Error Loading Chat";
    } finally {
        hideLoadingIndicator();
    }
}

// Function to render messages into the chat display
function renderMessages(messages, clearExisting = false) {
    // This check acts as a robust safeguard to ensure 'messages' is an array
    if (!Array.isArray(messages)) {
        console.warn("renderMessages received non-array data. Initializing as empty array.");
        messages = []; // Ensure it's an array to prevent forEach error
    }

    const fragment = document.createDocumentFragment();

    if (clearExisting) {
        messagesDiv.innerHTML = ''; // Clear previous messages
    }

    if (messages.length === 0 && clearExisting) {
        const initialMessage = document.createElement('p');
        initialMessage.className = 'initial-message';
        initialMessage.textContent = 'Say something to start a new chat, or import a chat from the sidebar.';
        fragment.appendChild(initialMessage);
    } else {
        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${msg.role}`; // 'user' or 'assistant'

            // Handle text content
            if (msg.text) {
                const textElement = document.createElement('div');
                textElement.className = 'message-text';
                textElement.innerHTML = marked.parse(msg.text); // Render Markdown
                messageElement.appendChild(textElement);
            }

            // Handle media content (image/video)
            if (msg.content_type === 'image_url' && msg.media_url) {
                const imgElement = document.createElement('img');
                imgElement.src = msg.media_url;
                imgElement.alt = 'Chat image';
                imgElement.className = 'chat-image';
                messageElement.appendChild(imgElement);
            } else if (msg.content_type === 'video_url' && msg.media_url) {
                const videoElement = document.createElement('video');
                videoElement.src = msg.media_url;
                videoElement.controls = true;
                videoElement.className = 'chat-video'; // Add a class for potential styling
                videoElement.style.maxWidth = '100%';
                videoElement.style.height = 'auto';
                messageElement.appendChild(videoElement);
            }

            // Handle captions for media
            if (msg.caption) {
                const captionElement = document.createElement('p');
                captionElement.className = 'image-caption';
                captionElement.textContent = msg.caption;
                messageElement.appendChild(captionElement);
            }

            fragment.appendChild(messageElement);
        });
    }
    messagesDiv.appendChild(fragment);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the newest message
}

// Function to send a new message
function sendMessage() {
  const input = document.getElementById("chatInput");
  const messagesDiv = document.getElementById("messages");

  if (input.value.trim() !== "") {
    // For now, just append user message. AI response logic will be added later.
    const userMessage = document.createElement("div");
    userMessage.className = "message user";
    userMessage.innerHTML = marked.parse(input.value.trim()); // Render Markdown

    messagesDiv.appendChild(userMessage);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom

    input.value = ""; // Clear input

    // In a real scenario, after sending, you'd get an AI response
    // and then call a backend API to save both user and AI message,
    // and then refresh the chat or append the AI's response.
  }
}

// Helper to show loading indicator
function showLoadingIndicator(message = "Loading...") {
    loadingIndicator.textContent = message;
    loadingIndicator.style.display = 'block';
}

// Helper to hide loading indicator
function hideLoadingIndicator() {
    loadingIndicator.style.display = 'none';
}

// Hook up event listeners after DOM is fully loaded
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
    saveApiKeyBtn.addEventListener('click', () => { // Fixed typo: `()_` to `()`
      const apiKey = apiKeyInput.value;
      console.log("Attempting to save API Key (not implemented):", apiKey ? "********" : "empty");
      // Here you would typically send this to the backend or store it in localStorage
      // For now, just a log and maybe clear the input or give feedback
      alert("API Key save functionality not fully implemented yet.");
    });
  }

  // Add scroll event listener for infinite scrolling
  if (messagesDiv) {
    messagesDiv.addEventListener('scroll', () => {
        // Check if scrolled to the top (or very close)
        if (messagesDiv.scrollTop < 10 && activeChatId && chatMessageStates[activeChatId]) {
            if (!chatMessageStates[activeChatId].isLoading && !chatMessageStates[activeChatId].allMessagesLoaded) {
                console.log("Scrolled to top, loading older messages for chat:", activeChatId);
                // Note: The second argument 'true' here was intended for pagination.
                // Since full loading is assumed now, consider if this is still needed or adjust loadChat to handle.
                // For now, keeping it as is, but it might trigger full reload if pagination is not implemented.
                loadChat(activeChatId);
            }
        }
    });
  }

  // Load chat list on page load
  loadChatList();

  // Initial call to load an empty chat or a default one
  // createNewChat(); // Removed: user selects or imports a chat
  // Note: For now, it's better to show the "Select a chat" message initially.
  // The default chat will be created when the user types a message.
});

// Function to create a new chat (client-side only for now)
function createNewChat() {
    activeChatId = null; // Clear active chat
    document.getElementById('chatTitle').textContent = 'New Chat';
    messagesDiv.innerHTML = `
        <p class="initial-message">Say something to start a new chat, or import a chat from the sidebar.</p>
    `;
    // Also clear input and potentially disable send until message is typed
    document.getElementById('chatInput').value = '';
    // Optionally remove active class from any previously selected chat in the sidebar
    Array.from(document.querySelectorAll('.chat-list a')).forEach(link => {
        link.classList.remove('active');
    });
}