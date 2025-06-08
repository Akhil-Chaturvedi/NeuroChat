// Function to update the active chat in the UI
let activeChatId = null; // Keep track of the currently active chat

// Progress bar elements
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
    document.getElementById("messages").innerHTML = `
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
  activeChatId = chatId; // Set the active chat ID

  // Update active class in sidebar
  document.querySelectorAll('#chatList li').forEach(item => {
    item.classList.remove('active');
  });
  const currentChatLi = document.querySelector(`[data-chat-id="${chatId}"]`);
  if (currentChatLi) {
    currentChatLi.classList.add('active');
  } else {
    // This case might happen if a new chat is created but not yet in the list
    // Or if the chat was deleted externally.
    // For now, it means no chat is selected in the UI if not found.
  }

  const res = await fetch(`/chat/${chatId}`);
  const chat = await res.json();

  document.getElementById("chatTitle").textContent = `🗣️ ${title}`;
  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = ""; // Clear existing messages

  if (chat.messages.length === 0) {
    messagesDiv.innerHTML = '<div class="welcome-message"><p>This chat is empty. Start typing to begin a conversation!</p></div>';
  } else {
    chat.messages.forEach((msg) => {
      const div = document.createElement("div");
      div.className = `message-bubble ${msg.role}-message`;

      // --- NEW LOGIC FOR HANDLING DIFFERENT CONTENT TYPES ---
      if (msg.content_type === "image" && msg.media_url) {
        const img = document.createElement("img");
        img.src = msg.media_url;
        img.alt = `Image from ${msg.role}`;
        img.style.maxWidth = '100%'; // Ensure images don't overflow
        img.style.borderRadius = '8px';
        img.style.marginTop = '5px';
        img.style.marginBottom = '5px';
        div.appendChild(img);
        // Add text below image if there is any, or a placeholder
        if (msg.text && msg.text !== `Image generated by ${msg.role}.`) { // Avoid displaying placeholder text if it's explicitly set by importer
            const textSpan = document.createElement("span");
            textSpan.textContent = msg.text;
            div.appendChild(textSpan);
        }
      } else if (msg.content_type === "code") {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = msg.text;
        pre.appendChild(code);
        div.appendChild(pre);
      } else { // Default to text
        div.textContent = msg.text;
      }
      // --- END NEW LOGIC ---

      messagesDiv.appendChild(div);
    });
    // Scroll to the bottom of the messages
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // Enable chat input and send button
  document.getElementById("chatInput").disabled = false;
  document.getElementById("sendMessageBtn").disabled = false;
  document.getElementById("chatInput").focus(); // Focus on input
}

// Function to handle "New Chat" button click (placeholder for now)
function createNewChat() {
  // In a future step, this will send a request to the backend to create a new chat session.
  // For now, we can clear the current view and prepare for a new chat.
  document.getElementById("chatTitle").textContent = "🗣️ New Chat";
  document.getElementById("messages").innerHTML = `
    <div class="welcome-message">
      <p>Start a fresh conversation!</p>
      <p>Messages in this chat will be saved automatically.</p>
    </div>
  `;
  document.getElementById("chatInput").value = ""; // Clear input field
  document.getElementById("chatInput").disabled = false;
  document.getElementById("sendMessageBtn").disabled = false;
  document.getElementById("chatInput").focus();

  // Deselect any active chat in the sidebar
  document.querySelectorAll('#chatList li').forEach(item => {
    item.classList.remove('active');
  });

  // Placeholder for creating a new chat ID on the backend
  // For now, we'll just indicate it's a new unsaved chat until actual message is sent
  activeChatId = null; // No active chat ID until the first message is sent and saved.
}

// Load chats on page load
window.onload = loadChats;

// Optional: Add event listener for sending message on Enter key (placeholder)
document.getElementById('chatInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { // Allow shift+enter for new line
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