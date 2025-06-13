document.addEventListener('DOMContentLoaded', () => {

    // --- Core Chat Elements ---
    const messageArea = document.getElementById('message-area');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHeaderTitle = document.querySelector('.chat-header h2');

    // --- Header Kebab Menu Elements ---
    const kebabBtn = document.querySelector('.kebab-menu-btn');
    const dropdownMenu = document.getElementById('chat-options-dropdown');

    // --- Sidebar Elements ---
    const historyList = document.getElementById('history-list');
    const newChatButtons = document.querySelectorAll('.new-chat-btn, .history-new-chat-btn');

    // --- Sidebar Options Panel Elements ---
    const optionsContainer = document.getElementById('options-container');
    const optionsBtn = document.getElementById('options-btn');
    const optionsPanel = document.getElementById('options-panel');
    const verifyApiKeyBtn = document.getElementById('verify-api-key-btn');
    const aiModelContainer = document.getElementById('ai-model-container');
    const importDropArea = document.getElementById('import-drop-area');
    const zipFileInput = document.getElementById('zip-file-input');
    
    const importProgressBox = document.getElementById('import-progress-box');
    const importProgressFill = document.getElementById('import-progress-fill');
    const importProgressPercent = document.getElementById('import-progress-percent');

    // --- State Management ---
    let isImporting = false;
    let currentChatId = null; 

    // --- Kebab Menu Logic ---
    if (kebabBtn && dropdownMenu) {
        kebabBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });
        window.addEventListener('click', (event) => {
            if (dropdownMenu.classList.contains('show')) {
                if (!kebabBtn.contains(event.target) && !dropdownMenu.contains(event.target)) {
                    dropdownMenu.classList.remove('show');
                }
            }
        });
    }

    // --- Sidebar Options Panel Logic ---
    if (optionsBtn && optionsPanel && optionsContainer) {
        optionsBtn.addEventListener('click', () => {
            const isNowOpen = optionsPanel.classList.toggle('show');
            optionsBtn.textContent = isNowOpen ? 'Close Options' : 'Options';
        });
    }

    // --- API Key Verification (Simulation - Backend Needed) ---
    if (verifyApiKeyBtn && aiModelContainer) {
        verifyApiKeyBtn.addEventListener('click', () => {
            verifyApiKeyBtn.textContent = 'Verifying...';
            verifyApiKeyBtn.disabled = true;
            setTimeout(() => {
                aiModelContainer.innerHTML = `
                    <label>Available Models</label>
                    <div class="ai-model-list">
                        <div class="ai-model-item">Model A (Verified)</div>
                        <div class="ai-model-item">Model B</div>
                        <div class="ai-model-item">Model C (Default)</div>
                    </div>
                `;
                aiModelContainer.style.display = 'block';
                verifyApiKeyBtn.textContent = 'Verified';
            }, 1500);
        });
    }

    // --- Import Logic (HEAVILY MODIFIED) ---
    const pollImportStatus = (taskId) => {
        let interval;

        // This function contains the actual logic to fetch and update the UI
        const updateStatus = async () => {
            try {
                const response = await fetch(`/upload-status/${taskId}`);
                if (!response.ok) throw new Error('Failed to get status');
                
                const status = await response.json();

                importProgressPercent.textContent = `${status.progress}%`;
                importProgressFill.style.width = `${status.progress}%`;

                const detailRegex = /Processing (\d+) of (\d+) chats. Currently processing: (.*)/;
                const matches = status.message.match(detailRegex);

                if (matches) {
                    const currentFile = matches[3].replace('ChatGPT-', '').replace(/_/g, ' ').replace('.json', '');
                    const tooltipText = `${matches[1]} / ${matches[2]}\n${currentFile}`;
                    importProgressBox.title = tooltipText;
                } else {
                    importProgressBox.title = status.message;
                }

                if (status.status === 'completed' || status.status === 'error') {
                    clearInterval(interval);
                    isImporting = false;
                    
                    if (status.status === 'completed') {
                        importProgressPercent.textContent = '✅';
                        importProgressBox.title = 'Import Complete!';
                        loadChatHistory();
                    } else {
                        importProgressPercent.textContent = '❌';
                        importProgressBox.title = `Error: ${status.message}`;
                    }
                    
                    setTimeout(() => {
                        importDropArea.style.display = 'block';
                        importProgressBox.style.display = 'none';
                    }, 4000);
                }
            } catch (error) {
                console.error('Error polling import status:', error);
                importProgressPercent.textContent = '⚠️';
                importProgressBox.title = 'Error checking status.';
                clearInterval(interval);
                isImporting = false;
            }
        };

        // FIXED: Call the function immediately for an instant first update.
        updateStatus(); 
        
        // THEN, set the interval to call it repeatedly for subsequent updates.
        interval = setInterval(updateStatus, 1500); // Poll every 1.5 seconds
    };

    const handleRealFileImport = async (file) => {
        if (!file || !(file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip'))) {
            alert('Please select a valid .zip file.');
            return;
        }

        isImporting = true;
        importDropArea.style.display = 'none';
        importProgressBox.style.display = 'flex';
        
        importProgressFill.style.width = '0%';
        importProgressPercent.textContent = '0%';
        importProgressBox.title = `Uploading ${file.name}...`;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Upload failed');
            
            importProgressBox.title = 'Processing...';
            pollImportStatus(result.task_id);

        } catch (error) {
            console.error('Import failed:', error);
            importProgressPercent.textContent = '❌';
            importProgressBox.title = `Upload failed: ${error.message}`;
            isImporting = false;
            setTimeout(() => {
                importDropArea.style.display = 'block';
                importProgressBox.style.display = 'none';
            }, 4000);
        }
    };

    if (importDropArea && zipFileInput) {
        importDropArea.addEventListener('click', () => zipFileInput.click());
        zipFileInput.addEventListener('change', (e) => handleRealFileImport(e.target.files[0]));
        importDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            importDropArea.classList.add('drag-over');
        });
        importDropArea.addEventListener('dragleave', () => importDropArea.classList.remove('drag-over'));
        importDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            importDropArea.classList.remove('drag-over');
            handleRealFileImport(e.dataTransfer.files[0]);
        });
    }

    window.addEventListener('beforeunload', (e) => {
        if (isImporting) {
            e.preventDefault();
            e.returnValue = 'An import is in progress. Are you sure you want to leave?';
        }
    });

    // --- Core Chat Functions ---
    const scrollToBottom = () => {
        messageArea.scrollTop = messageArea.scrollHeight;
    };

    const addMessage = (messageData) => {
        const { role, text, content_type, media_url } = messageData;
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'message-wrapper';
        const messageDiv = document.createElement('div');
        const messageClass = role === 'assistant' ? 'ai-message' : 'user-message';
        messageDiv.className = `message ${messageClass}`;

        if (content_type === 'image' && media_url) {
            const img = document.createElement('img');
            img.src = media_url;
            img.alt = text || 'Uploaded Image';
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            messageDiv.appendChild(img);
            if (text) {
                const p = document.createElement('p');
                p.textContent = text;
                p.style.marginTop = '8px';
                messageDiv.appendChild(p);
            }
        } else if (content_type === 'code') {
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            pre.style.backgroundColor = '#111';
            pre.style.padding = '10px';
            pre.style.borderRadius = '5px';
            pre.style.whiteSpace = 'pre-wrap';
            code.textContent = text;
            pre.appendChild(code);
            messageDiv.appendChild(pre);
        } else {
            messageDiv.innerHTML = marked.parse(text || '', { gfm: true, breaks: true });
        }

        messageWrapper.appendChild(messageDiv);
        messageArea.appendChild(messageWrapper);
    };

    const loadChat = async (chatId) => {
        if (!chatId) return;
        currentChatId = chatId;
        console.log(`Loading chat: ${chatId}`);

        try {
            const response = await fetch(`/chat/${chatId}`);
            if (!response.ok) throw new Error(`Chat not found or error loading: ${response.statusText}`);
            const chatData = await response.json();
            messageArea.innerHTML = '';
            chatHeaderTitle.textContent = chatData.title;
            const messages = chatData.messages_page.messages.reverse();
            messages.forEach(msg => addMessage(msg));
            scrollToBottom();
        } catch (error) {
            console.error('Failed to load chat:', error);
            messageArea.innerHTML = `<div class="message-wrapper"><div class="message ai-message">Error loading chat.</div></div>`;
        }
    };

    const loadChatHistory = async () => {
        try {
            const response = await fetch('/chats');
            const chats = await response.json();
            historyList.innerHTML = '';
            if (chats.length === 0) {
                historyList.innerHTML = '<li>No chats yet. Import some!</li>';
                return;
            }
            chats.forEach(chat => {
                const li = document.createElement('li');
                li.textContent = chat.title;
                li.dataset.chatId = chat.id;
                li.style.cursor = 'pointer';
                historyList.appendChild(li);
            });
        } catch (error) {
            console.error('Failed to load chat history:', error);
            historyList.innerHTML = '<li>Error loading history.</li>';
        }
    };
    
    historyList.addEventListener('click', (e) => {
        if (e.target && e.target.nodeName === "LI") {
            const chatId = e.target.dataset.chatId;
            if (chatId) loadChat(chatId);
        }
    });

    const handleSendMessage = () => {
        const messageText = messageInput.value.trim();
        if (messageText === "" || !currentChatId) {
            if (!currentChatId) alert("Please select a chat first or start a new one.");
            return;
        }
        
        addMessage({ role: 'user', text: messageText, content_type: 'text' });
        messageInput.value = '';
        scrollToBottom();

        console.log(`TODO: Send message "${messageText}" to chat ${currentChatId}`);
        
        setTimeout(() => addMessage({ role: 'assistant', text: "I'm a simulation. Backend for sending messages is needed.", content_type: 'text'}), 1200);
        scrollToBottom();
    };

    sendBtn.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    });

    loadChatHistory();
});