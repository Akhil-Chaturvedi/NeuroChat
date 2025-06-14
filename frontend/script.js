document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selectors ---
    const mainChatArea = document.getElementById('main-chat-area');
    const messageArea = document.getElementById('message-area');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHeaderTitle = document.getElementById('chat-header-title');
    const homePageView = document.getElementById('home-page-view');
    const promptStartersContainer = document.querySelector('.prompt-starters');
    const tempChatBtn = document.getElementById('temp-chat-btn');
    const historyList = document.getElementById('history-list');
    const newChatButtons = document.querySelectorAll('.new-chat-btn');
    const toggleArchiveViewBtn = document.getElementById('toggle-archive-view-btn');
    const kebabBtn = document.querySelector('.kebab-menu-btn');
    const dropdownMenu = document.getElementById('chat-options-dropdown');
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
    let currentChatId = null;
    let temporaryChatMessages = [];
    let isShowingArchived = false;

    // --- Client-Side Temporary Chat Persistence ---
    const saveTemporaryChat = () => {
        sessionStorage.setItem('temporaryChat', JSON.stringify(temporaryChatMessages));
    };

    const restoreTemporaryChat = () => {
        const saved = sessionStorage.getItem('temporaryChat');
        if (saved) {
            temporaryChatMessages = JSON.parse(saved);
            if (temporaryChatMessages.length > 0) {
                loadTemporaryChat();
            }
        }
    };

    // --- UI State Functions ---
    const showHomePage = () => {
        currentChatId = null;
        temporaryChatMessages = [];
        sessionStorage.removeItem('temporaryChat');
        mainChatArea.classList.remove('chat-active');
        loadChatHistory();
    };

    const showChatView = () => {
        mainChatArea.classList.add('chat-active');
    };

    // --- Kebab, Options, Import Logic ---
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

    if (optionsBtn && optionsPanel && optionsContainer) {
        optionsBtn.addEventListener('click', () => {
            const isNowOpen = optionsPanel.classList.toggle('show');
            optionsBtn.textContent = isNowOpen ? 'Close Options' : 'Options';
        });
    }
    
    const pollImportStatus = (taskId) => {
        let interval;
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
            }
        };
        updateStatus();
        interval = setInterval(updateStatus, 1500);
    };

    const handleRealFileImport = async (file) => {
        if (!file || !(file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip'))) {
            alert('Please select a valid .zip file.');
            return;
        }
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
            setTimeout(() => {
                importDropArea.style.display = 'block';
                importProgressBox.style.display = 'none';
            }, 4000);
        }
    };

    if (importDropArea && zipFileInput) {
        importDropArea.addEventListener('click', () => zipFileInput.click());
        zipFileInput.addEventListener('change', (e) => handleRealFileImport(e.target.files[0]));
        importDropArea.addEventListener('dragover', (e) => { e.preventDefault(); importDropArea.classList.add('drag-over'); });
        importDropArea.addEventListener('dragleave', () => importDropArea.classList.remove('drag-over'));
        importDropArea.addEventListener('drop', (e) => { e.preventDefault(); importDropArea.classList.remove('drag-over'); handleRealFileImport(e.dataTransfer.files[0]); });
    }

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

    const loadTemporaryChat = () => {
        currentChatId = 'temporary';
        chatHeaderTitle.textContent = "Temporary Chat";
        messageArea.innerHTML = '';
        temporaryChatMessages.forEach(msg => addMessage(msg));
        showChatView();
        updateHistoryActiveState();
        scrollToBottom();
    };

    const updateHistoryActiveState = () => {
        historyList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
        if (currentChatId) {
            const currentItem = historyList.querySelector(`[data-chat-id="${currentChatId}"]`);
            if (currentItem) currentItem.classList.add('active');
        }
    };
    
    const loadChat = async (chatId) => {
        if (!chatId) return;
        if (chatId === 'temporary') {
            loadTemporaryChat();
            return;
        }
        currentChatId = chatId;
        console.log(`Loading chat: ${chatId}`);
        updateHistoryActiveState();
        try {
            const response = await fetch(`/chat/${chatId}`);
            if (!response.ok) throw new Error(`Chat not found`);
            const chatData = await response.json();
            messageArea.innerHTML = '';
            chatHeaderTitle.textContent = chatData.title;
            const messages = chatData.messages_page.messages.reverse();
            messages.forEach(msg => addMessage(msg));
            showChatView();
            scrollToBottom();
        } catch (error) {
            console.error('Failed to load chat:', error);
            showHomePage();
            alert('Failed to load chat.');
        }
    };

    const loadChatHistory = async () => {
        const endpoint = isShowingArchived ? '/chats/archived' : '/chats';
        const emptyMessage = isShowingArchived ? '<li>No archived chats.</li>' : '<li>No chats yet.</li>';
        try {
            const response = await fetch(endpoint);
            const chats = await response.json();
            historyList.innerHTML = '';
            if (temporaryChatMessages.length > 0) {
                const li = document.createElement('li');
                li.innerHTML = '⏳ Temporary Chat';
                li.dataset.chatId = 'temporary';
                li.className = 'temporary-chat-item';
                historyList.appendChild(li);
            }
            if (chats.length === 0 && temporaryChatMessages.length === 0) {
                historyList.innerHTML = emptyMessage;
                return;
            }
            chats.forEach(chat => {
                const li = document.createElement('li');
                li.textContent = chat.title;
                li.dataset.chatId = chat.id;
                historyList.appendChild(li);
            });
            updateHistoryActiveState();
        } catch (error) {
            console.error('Failed to load chat history:', error);
            historyList.innerHTML = '<li>Error loading history.</li>';
        }
    };

    const handleSendMessage = async () => {
        const messageText = messageInput.value.trim();
        if (messageText === "") return;

        const isTempModeActive = tempChatBtn.classList.contains('active');
        let isFirstMessage = currentChatId === null;

        if (isFirstMessage && isTempModeActive) {
            currentChatId = 'temporary';
            chatHeaderTitle.textContent = "Temporary Chat";
            messageArea.innerHTML = '';
            showChatView();
            loadChatHistory();
        }

        addMessage({ role: 'user', text: messageText, content_type: 'text' });
        messageInput.value = '';
        scrollToBottom();

        if (currentChatId === 'temporary') {
            temporaryChatMessages.push({ role: 'user', text: messageText, content_type: 'text' });
            saveTemporaryChat();
            try {
                const response = await fetch('/chat/temporary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: messageText })
                });
                if (!response.ok) throw new Error("Failed to get temporary response.");
                const aiResponse = await response.json();
                addMessage(aiResponse);
                temporaryChatMessages.push(aiResponse);
                saveTemporaryChat();
                scrollToBottom();
            } catch (error) {
                addMessage({ role: 'assistant', text: 'Sorry, an error occurred.', content_type: 'text'});
                scrollToBottom();
            }
        } else {
            let chatIdToSend = currentChatId;
            if (chatIdToSend === null) {
                try {
                    const response = await fetch('/chats', { method: 'POST' });
                    const newChat = await response.json();
                    chatIdToSend = newChat.id;
                    await loadChatHistory();
                    currentChatId = chatIdToSend;
                    updateHistoryActiveState();
                    chatHeaderTitle.textContent = newChat.title;
                    showChatView();
                } catch (error) {
                    showHomePage();
                    return;
                }
            }
            try {
                const response = await fetch(`/chat/${chatIdToSend}/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: messageText })
                });
                const aiResponse = await response.json();
                addMessage(aiResponse);
                scrollToBottom();
            } catch (error) {
                addMessage({ role: 'assistant', text: 'Sorry, I encountered an error.', content_type: 'text'});
                scrollToBottom();
            }
        }
    };

    // --- Event Listeners ---
    newChatButtons.forEach(button => button.addEventListener('click', showHomePage));
    
    historyList.addEventListener('click', (e) => {
        const listItem = e.target.closest('li');
        if (listItem && listItem.dataset.chatId) {
            loadChat(listItem.dataset.chatId);
        }
    });

    if (promptStartersContainer) {
        promptStartersContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.starter-card');
            if (card) {
                const h3 = card.querySelector('h3').textContent;
                const p = card.querySelector('p').textContent;
                messageInput.value = `${h3} ${p}`;
                handleSendMessage();
            }
        });
    }

    if (tempChatBtn) {
        tempChatBtn.addEventListener('click', () => {
            tempChatBtn.classList.toggle('active');
        });
    }

    if (toggleArchiveViewBtn) {
        toggleArchiveViewBtn.addEventListener('click', () => {
            isShowingArchived = !isShowingArchived;
            toggleArchiveViewBtn.textContent = isShowingArchived ? 'Active Chats' : 'Archived';
            showHomePage();
            loadChatHistory();
        });
    }

    if (dropdownMenu) {
        dropdownMenu.addEventListener('click', async (e) => {
            e.preventDefault();
            const action = e.target.dataset.action;
            if (!action || !currentChatId || currentChatId === 'temporary') return;

            if (action === 'rename') {
                const currentTitle = chatHeaderTitle.textContent;
                const newTitle = prompt("Enter a new title:", currentTitle);
                if (newTitle && newTitle.trim() !== "" && newTitle !== currentTitle) {
                    try {
                        const response = await fetch(`/chat/${currentChatId}/rename`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ new_title: newTitle.trim() })
                        });
                        if (!response.ok) throw new Error('Failed to rename chat.');
                        chatHeaderTitle.textContent = newTitle;
                        const chatListItem = historyList.querySelector(`[data-chat-id="${currentChatId}"]`);
                        if (chatListItem) chatListItem.textContent = newTitle;
                    } catch (error) {
                        alert('Could not rename chat.');
                    }
                }
            } else if (action === 'archive') {
                if (confirm("Are you sure you want to archive this chat?")) {
                    try {
                        const response = await fetch(`/chat/${currentChatId}/archive`, { method: 'POST' });
                        if (!response.ok) throw new Error('Failed to archive chat.');
                        showHomePage();
                        loadChatHistory();
                    } catch (error) {
                        alert('Could not archive chat.');
                    }
                }
            } else if (action === 'delete') {
                if (confirm("Are you sure? This cannot be undone.")) {
                    try {
                        const response = await fetch(`/chat/${currentChatId}`, { method: 'DELETE' });
                        if (!response.ok) throw new Error('Failed to delete chat.');
                        showHomePage();
                        loadChatHistory();
                    } catch (error) {
                        alert('Could not delete chat.');
                    }
                }
            }
            dropdownMenu.classList.remove('show');
        });
    }

    sendBtn.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    });

    // --- Initial Load ---
    restoreTemporaryChat();
    loadChatHistory();
    if (currentChatId === null) {
        showHomePage();
    }
});