// Function to update the active chat in the UI
let activeChatId = null; // Keep track of the currently active chat
const MESSAGES_PER_PAGE = 30; // Number of messages to fetch per batch
let chatMessageStates = {}; // Stores pagination state for each chat { chatId: { currentPage: 0, isLoading: false, allMessagesLoaded: false } }

// DOM Elements
const messagesDiv = document.getElementById("messages");
const loadingIndicator = document.getElementById("loadingIndicator");
const progressBarContainer = document.getElementById("progressBarContainer");
const progressBar = document.getElementById("progressBar");

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
    const result = await response.json();

    if (response.ok) {
      // Display initial message from upload endpoint
      status.textContent = result.message || "File uploaded. Waiting for processing to start...";
      progressBar.style.width = "0%"; // Ensure it starts at 0 if not already
      progressBar.textContent = "0%";
      // Start polling for status
      if (result.task_id) {
        checkUploadStatus(result.task_id);
      } else {
        status.textContent = '❌ Error: Missing task_id from server response.';
        status.style.color = "#dc3545";
        progressBarContainer.style.display = "none"; // Hide progress bar on immediate error
      }
    } else {
      status.textContent = `❌ Error: ${result.detail || 'Unknown error during upload'}`;
      status.style.color = "#dc3545";
      progressBarContainer.style.display = "none"; // Hide progress bar on upload error
    }
  } catch (error) {
    status.textContent = `❌ Network or server error during upload: ${error.message}`;
    status.style.color = "#dc3545";
    progressBarContainer.style.display = "none"; // Hide progress bar on network error
    console.error("Upload failed:", error);
  }
}

let pollingIntervalId = null; // To store the interval ID for polling

async function checkUploadStatus(taskId) {
  const status = document.getElementById("uploadStatus");
  // progressBar and progressBarContainer are already defined globally

  // Clear any existing interval before starting a new one
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
  }

  pollingIntervalId = setInterval(async () => {
    try {
      const response = await fetch(`/upload-status/${taskId}`);
      if (!response.ok) { // Handles HTTP errors like 404, 500 from the status endpoint
        clearInterval(pollingIntervalId);
        pollingIntervalId = null; // Ensure it's cleared
        status.textContent = `❌ Error checking status: Server returned ${response.status}.`;
        status.style.color = "#dc3545";
        progressBar.style.backgroundColor = "#dc3545"; // Error color for progress bar
        console.error("Error checking status:", response.statusText);
        return;
      }
      const result = await response.json();

      // Update progress bar
      const currentProgress = result.progress || 0;
      progressBar.style.width = currentProgress + "%";
      progressBar.textContent = currentProgress + "%";
      
      status.textContent = `${result.message || 'Working...'}`; 
      // Set status text color based on result.status
      if (result.status === "completed") {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null; 
        status.textContent = `✅ ${result.message || 'Processing complete!'}`;
        status.style.color = "#28a745"; // Green for success text
        progressBar.style.width = "100%"; // Ensure 100% on complete
        progressBar.textContent = "100%";
        progressBar.style.backgroundColor = "#28a745"; // Green for progress bar
        
        document.getElementById("fileInput").value = ''; 
        // The progress bar remains visible at 100% until a new file is selected or upload starts
        loadChats(); 
      } else if (result.status === "error") {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        status.textContent = `❌ Error: ${result.message || 'An unknown error occurred during processing.'}`;
        status.style.color = "#dc3545"; // Red for error text
        progressBar.style.backgroundColor = "#dc3545"; // Red for progress bar
        // Progress bar shows progress at time of error
      } else { // Still processing
        status.style.color = "var(--primary-color)"; // Default color for status text
        progressBar.style.backgroundColor = "var(--primary-color)"; // Default color for progress bar
      }
    } catch (error) { // Handles network errors for the status check itself
      clearInterval(pollingIntervalId);
      pollingIntervalId = null;
      status.textContent = '❌ Network error while checking status.';
      status.style.color = "#dc3545";
      progressBar.style.backgroundColor = "#dc3545"; // Error color for progress bar
      console.error("Error fetching upload status:", error);
    }
  }, 2000); // Poll every 2 seconds
}

// Add an event listener to fileInput to reset progress bar and status when a new file is selected
document.getElementById('fileInput').addEventListener('change', () => {
  const status = document.getElementById("uploadStatus");
  status.textContent = ""; // Clear status message
  status.style.color = "var(--primary-color)"; // Reset color
  
  progressBarContainer.style.display = "none";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";
  progressBar.style.backgroundColor = "var(--primary-color)";

  // If polling was active from a previous upload attempt that wasn't completed, clear it.
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
});

async function loadChats() {
  const res = await fetch("/chats");
  const chats = await res.json();
  const chatList = document.getElementById("chatList");
  chatList.innerHTML = ""; // Clear existing chats

  if (chats.length === 0) {
    chatList.innerHTML = '<li class="placeholder">No chats found. Upload history or create a new one!</li>';
  } else {
    // Sort chats by create_time in descending order if available
    chats.sort((a, b) => (b.create_time || 0) - (a.create_time || 0));

    chats.forEach((chat) => {
      const li = document.createElement("li");
      li.textContent = chat.title;
      li.dataset.chatId = chat.chat_id; // Store chat_id as a data attribute
      li.onclick = () => loadChat(chat.chat_id, chat.title);
      chatList.appendChild(li);
    });
  }

  // Automatically load the first chat if available, or previously active one
  if (activeChatId) {
    const activeLi = document.querySelector(`[data-chat-id="${activeChatId}"]`);
    if (activeLi) {
      activeLi.click(); // Simulate click to reload active chat
    } else if (chats.length > 0) {
      // If previously active chat is gone, load the first one
      document.querySelector('#chatList li').click();
    }
  } else if (chats.length > 0) {
    // If no active chat, load the first one
    document.querySelector('#chatList li').click();
  } else {
    // If no chats at all, show welcome message
    document.getElementById("chatTitle").textContent = "🗣️ Select a Chat or Start New";
  // Clear messages and ensure loading indicator is part of the initial cleared state
  messagesDiv.innerHTML = ` 
    <div id="loadingIndicator" style="display:none; text-align:center; padding:10px; color: var(--light-text-color);">Loading older messages...</div>
      <div class="welcome-message">
        <p>Welcome to NeuroChat! Your personal AI with infinite memory.</p>
        <p>Upload your ChatGPT conversation history to get started, or click "New Chat" to begin a fresh conversation.</p>
      </div>
    `;
    // Disable chat input and send button
    document.getElementById("chatInput").disabled = true;
    document.getElementById("sendMessageBtn").disabled = true;
  }
}

async function loadChat(chatId, title) {
  activeChatId = chatId;

  // Initialize or reset chat state for pagination
  if (!chatMessageStates[chatId]) {
    chatMessageStates[chatId] = { currentPage: 0, isLoading: false, allMessagesLoaded: false };
  } else {
    chatMessageStates[chatId].currentPage = 0;
    chatMessageStates[chatId].isLoading = false;
    chatMessageStates[chatId].allMessagesLoaded = false;
  }
  
  // Clear previous messages and add back the loading indicator structure
  messagesDiv.innerHTML = `<div id="loadingIndicator" style="display:none; text-align:center; padding:10px; color: var(--light-text-color);">Loading older messages...</div>`;
  // Re-assign loadingIndicator because its DOM element was replaced by innerHTML
  // Note: This is a bit inefficient. A better way would be to not replace the indicator itself.
  // For now, this will work, but for optimization, one might only clear message bubbles.
  // const loadingIndicator = document.getElementById("loadingIndicator"); // Re-fetch, though it's global now.

  document.getElementById("chatTitle").textContent = `🗣️ ${title}`;
  
  // Update active class in sidebar
  document.querySelectorAll('#chatList li').forEach(item => item.classList.remove('active'));
  const currentChatLi = document.querySelector(`[data-chat-id="${chatId}"]`);
  if (currentChatLi) currentChatLi.classList.add('active');

  await fetchAndDisplayMessages(chatId, 0, false); // Initial load (page 0, not prepending)

  // Enable chat input and send button
  document.getElementById("chatInput").disabled = false;
  document.getElementById("sendMessageBtn").disabled = false;
  document.getElementById("chatInput").focus();
}

function showLoadingIndicator() {
  const indicator = document.getElementById("loadingIndicator"); // Ensure we have the latest ref
  if (indicator) indicator.style.display = 'block';
}

function hideLoadingIndicator() {
  const indicator = document.getElementById("loadingIndicator"); // Ensure we have the latest ref
  if (indicator) indicator.style.display = 'none';
}

async function fetchAndDisplayMessages(chatId, page, prepend = false) {
  if (!chatMessageStates[chatId] || chatMessageStates[chatId].isLoading || (prepend && chatMessageStates[chatId].allMessagesLoaded)) {
    return;
  }

  chatMessageStates[chatId].isLoading = true;
  if (prepend) showLoadingIndicator();

  try {
    // Assuming backend endpoint like /chat/{chatId}/messages?page=X&limit=Y
    // And it returns { messages: [], has_more: boolean }
    // For now, using existing /chat/{chatId} and simulating pagination from full list
    // THIS IS A SIMULATION. IDEALLY, BACKEND HANDLES PAGINATION.
    const res = await fetch(`/chat/${chatId}`); // This fetches ALL messages in current setup
    const chatData = await res.json();
    
    let allMessages = chatData.messages || [];
    // Sort messages by timestamp if available, assuming 'timestamp' field
    // For now, we assume they are correctly ordered from backend (older to newer)
    // allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));


    const start = allMessages.length - MESSAGES_PER_PAGE * (page + 1);
    const end = allMessages.length - MESSAGES_PER_PAGE * page;
    const messagesToDisplay = allMessages.slice(Math.max(0, start), end);

    if (messagesToDisplay.length === 0 && page > 0) { // No more older messages
        chatMessageStates[chatId].allMessagesLoaded = true;
        hideLoadingIndicator();
        chatMessageStates[chatId].isLoading = false;
        return;
    }
     if (messagesToDisplay.length < MESSAGES_PER_PAGE || Math.max(0,start) === 0 && page > 0) { // If fewer messages than requested OR start is 0 on subsequent pages
        chatMessageStates[chatId].allMessagesLoaded = true;
    }


    const welcomeMessage = messagesDiv.querySelector('.welcome-message');
    if (welcomeMessage && !prepend) welcomeMessage.remove(); // Remove welcome if it exists on initial load

    if (messagesToDisplay.length === 0 && !prepend) { // Initial load and no messages
        messagesDiv.insertAdjacentHTML('beforeend', '<div class="welcome-message"><p>This chat is empty. Start typing to begin a conversation!</p></div>');
    }

    let oldScrollHeight = messagesDiv.scrollHeight;
    let oldScrollTop = messagesDiv.scrollTop;

    messagesToDisplay.forEach((msg) => {
      const div = document.createElement("div");
      div.className = `message-bubble ${msg.role}-message`;
      // Content handling logic (same as before)
      if (msg.content_type === "image" && msg.media_url) {
        const img = document.createElement("img");
        img.src = msg.media_url; img.alt = `Image from ${msg.role}`;
        img.style.maxWidth = '100%'; img.style.borderRadius = '8px'; img.style.marginTop = '5px'; img.style.marginBottom = '5px';
        div.appendChild(img);
        if (msg.text && msg.text !== `Image generated by ${msg.role}.`) {
            const textSpan = document.createElement("span"); textSpan.textContent = msg.text; div.appendChild(textSpan);
        }
      } else if (msg.content_type === "code") {
        const pre = document.createElement("pre"); const code = document.createElement("code");
        code.textContent = msg.text; pre.appendChild(code); div.appendChild(pre);
      } else {
        div.textContent = msg.text;
      }

      if (prepend) {
        // Insert after the loading indicator
        const currentIndicator = document.getElementById("loadingIndicator");
        currentIndicator.insertAdjacentElement('afterend', div);
      } else {
        messagesDiv.appendChild(div);
      }
    });

    if (prepend) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight - oldScrollHeight + oldScrollTop;
       // Special case for when scroll was at 0, try to keep the visual top message.
      if(oldScrollTop === 0) messagesDiv.scrollTop = messagesDiv.scrollHeight - oldScrollHeight;

    } else {
      messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom for initial load
    }
    
    chatMessageStates[chatId].currentPage = page;

  } catch (error) {
    console.error("Failed to fetch messages:", error);
    // Optionally display an error message to the user
  } finally {
    chatMessageStates[chatId].isLoading = false;
    if (prepend) hideLoadingIndicator();
  }
}


// Function to handle "New Chat" button click
function createNewChat() {
  document.getElementById("chatTitle").textContent = "🗣️ New Chat";
  // Ensure loading indicator is part of the cleared state for new chats too
  messagesDiv.innerHTML = `
    <div id="loadingIndicator" style="display:none; text-align:center; padding:10px; color: var(--light-text-color);">Loading older messages...</div>
    <div class="welcome-message">
      <p>Start a fresh conversation!</p>
      <p>Messages in this chat will be saved automatically.</p>
    </div>
  `;
  document.getElementById("chatInput").value = "";
  document.getElementById("chatInput").disabled = false;
  document.getElementById("sendMessageBtn").disabled = false;
  document.getElementById("chatInput").focus();

  document.querySelectorAll('#chatList li').forEach(item => item.classList.remove('active'));
  activeChatId = null; 
  // Reset any pagination state for a "new chat" view if it was using a temporary ID
}

// Scroll listener for messagesDiv for infinite scrolling
messagesDiv.addEventListener('scroll', () => {
  if (messagesDiv.scrollTop === 0 && activeChatId && chatMessageStates[activeChatId] && !chatMessageStates[activeChatId].isLoading && !chatMessageStates[activeChatId].allMessagesLoaded) {
    const nextPage = chatMessageStates[activeChatId].currentPage + 1;
    fetchAndDisplayMessages(activeChatId, nextPage, true);
  }
});

// Load chats on page load
window.onload = loadChats;

// Optional: Add event listener for sending message on Enter key
document.getElementById('chatInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // Prevent default form submission
    document.getElementById('sendMessageBtn').click();
  }
});

document.getElementById('sendMessageBtn').onclick = () => {
  const input = document.getElementById('chatInput');
  const messageText = input.value.trim();
  if (messageText) {
    // This is where you would send the message to your backend.
    // For now, we'll just display it locally as a user message.
    console.log("Sending message (not yet implemented on backend):", messageText);
    const messagesDiv = document.getElementById("messages");

    // Remove welcome message if present
    const welcome = messagesDiv.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const div = document.createElement("div");
    div.className = `message-bubble user-message`;
    div.textContent = messageText;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom

    input.value = ""; // Clear input

    // In a real scenario, after sending, you'd get an AI response
    // and then call a backend API to save both user and AI message,
    // and then refresh the chat or append the AI's response.
  }
};

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

  // Placeholder for saving API key
  if (saveApiKeyBtn && apiKeyInput) {
    saveApiKeyBtn.addEventListener('click', ()_ => {
      const apiKey = apiKeyInput.value;
      console.log("Attempting to save API Key (not implemented):", apiKey ? "********" : "empty");
      // Here you would typically send this to the backend or store it in localStorage
      // For now, just a log and maybe clear the input or give feedback
      alert("API Key save functionality not fully implemented yet.");
    });
  }
});