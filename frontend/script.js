import { renderMessage } from './messageRenderer.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM Element Constants
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
    const apiKeyInput = document.getElementById('api-key-input');
    const verifyApiKeyBtn = document.getElementById('verify-api-key-btn');
    const aiModelContainer = document.getElementById('ai-model-container');
    const currentModelBtn = document.getElementById('current-model-btn');
    const importDropArea = document.getElementById('import-drop-area');
    const jsonFileInput = document.getElementById('json-file-input');
    const importProgressBox = document.getElementById('import-progress-box');
    const importProgressFill = document.getElementById('import-progress-fill');
    const importProgressPercent = document.getElementById('import-progress-percent');
    const knowledgeUploadBtn = document.getElementById('knowledge-upload-btn');
    const knowledgeFileInput = document.getElementById('knowledge-file-input');
    const sourcesBtn = document.getElementById('sources-btn');
    const sourcesBadge = document.getElementById('sources-badge');
    const sourcesModalOverlay = document.getElementById('sources-modal-overlay');
    const sourcesModal = document.getElementById('sources-modal');
    const closeSourcesModalBtn = document.getElementById('close-sources-modal-btn');
    const sourcesSearchInput = document.getElementById('sources-search-input');
    const selectAllSourcesBtn = document.getElementById('select-all-sources-btn');
    const selectNoneSourcesBtn = document.getElementById('select-none-sources-btn');
    const sourcesListChats = document.getElementById('sources-list-chats');
    const sourcesListFiles = document.getElementById('sources-list-files');
    const applySourcesBtn = document.getElementById('apply-sources-btn');
    const navUpBtn = document.getElementById('nav-up-btn');
    const navDownBtn = document.getElementById('nav-down-btn');

    // State variables
    let currentChatId = null;
    let temporaryChats = {};
    let isShowingArchived = false;
    let globalModel = null;
    let availableModels = [];
    let allSources = [];
    let currentPage = 1;
    let selectedSourceIDs = null;
    let promptHistory = [];
    let historyIndex = -1;
    let draftMessage = '';
	let defaultApiKey = null;

    // Helper functions
    const saveState = () => {
        if (!apiKeyInput) return;
        const state = { globalModel, apiKey: apiKeyInput.value };
        localStorage.setItem('neuroChatState', JSON.stringify(state));
    };

    const saveTemporaryChatsToSession = () => {
        sessionStorage.setItem('temporaryChats', JSON.stringify(temporaryChats));
    };

    const loadTemporaryChatsFromSession = () => {
        const savedChats = sessionStorage.getItem('temporaryChats');
        if (savedChats) {
            temporaryChats = JSON.parse(savedChats);
        }
    };

const renderModelList = () => {
    if (!aiModelContainer) return;
    if (availableModels.length === 0) {
        aiModelContainer.innerHTML = '<p style="font-size: 12px; color: #BDBDBD;">No models available. Enter a valid API key.</p>';
        return;
    }

    const recommendedModel = availableModels[0];
    const otherModels = availableModels.slice(1);

    const recommendedHTML = `<div class="recommended-model-section"><div class="recommend-title">Recommended</div><div class="ai-model-item" data-model-id="${recommendedModel.id}">${recommendedModel.id}</div></div><hr />`;
    
    const otherModelsHTML = otherModels.map(model => 
        `<div class="ai-model-item" data-model-id="${model.id}">${model.id}</div>`
    ).join('');

    aiModelContainer.innerHTML = `<label>Set Global Default Model</label><div class="ai-model-list">${recommendedHTML}${otherModelsHTML}</div>`;
};

const handleApiKeyVerification = async (isSilent = false, keyFromState = null) => {
    if (!apiKeyInput || !verifyApiKeyBtn || !currentModelBtn) return;
    const apiKey = keyFromState || apiKeyInput.value.trim();
    if (!apiKey) {
        if (!isSilent) alert("Please enter an API key.");
        return;
    }
    verifyApiKeyBtn.textContent = 'Verifying...';
    verifyApiKeyBtn.disabled = true;
    try {
        const response = await fetch('/config/api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey }) });
        if (!response.ok) throw new Error((await response.json()).detail || 'Verification failed');
        
        const data = await response.json();
        availableModels = data.models; // This is now an array of objects

        apiKeyInput.value = apiKey;
        saveState();
        apiKeyInput.placeholder = maskApiKey(apiKey);
        apiKeyInput.value = '';
        updateVerifyButtonVisibility();

        const previouslySavedModel = globalModel;
        const availableModelIds = availableModels.map(m => m.id);

        if (previouslySavedModel && availableModelIds.includes(previouslySavedModel)) {
        } else {
            globalModel = availableModels.length > 0 ? availableModels[0].id : null;
        }
        
        renderModelList();
        if (globalModel) {
            currentModelBtn.textContent = globalModel.split('/').pop();
        }

        verifyApiKeyBtn.textContent = 'Verified';
        setTimeout(() => { verifyApiKeyBtn.textContent = 'Verify'; verifyApiKeyBtn.disabled = false; }, 2000);
    } catch (error) {
        if (!isSilent) alert(`API Key verification failed: ${error.message}`);
        availableModels = [];
        renderModelList();
        verifyApiKeyBtn.textContent = 'Verify';
        verifyApiKeyBtn.disabled = false;
        updateVerifyButtonVisibility();
    }
};

    const pollImportStatus = (taskId) => {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/upload-status/${taskId}`);
                if (!response.ok) throw new Error('Failed to get status');
                const status = await response.json();
                if (importProgressPercent) importProgressPercent.textContent = `${status.progress}%`;
                if (importProgressFill) importProgressFill.style.width = `${status.progress}%`;
                if (importProgressBox) {
                    const detailRegex = /Processing (\d+) of (\d+): (.*)/;
                    const matches = status.message.match(detailRegex);
                    if (matches) {
                        const tooltipText = `${matches[1]} / ${matches[2]}\n${matches[3]}`;
                        importProgressBox.title = tooltipText;
                    } else {
                        importProgressBox.title = status.message;
                    }
                }
                if (status.status === 'completed' || status.status === 'error') {
                    clearInterval(interval);
                    if (status.status === 'completed') {
                        if (importProgressPercent) importProgressPercent.textContent = '✅';
                        loadChatHistory();
                    } else {
                        if (importProgressPercent) importProgressPercent.textContent = '❌';
                    }
                    setTimeout(() => {
                        if (importDropArea) importDropArea.style.display = 'block';
                        if (importProgressBox) importProgressBox.style.display = 'none';
                    }, 5000);
                }
            } catch (error) {
                if (importProgressPercent) importProgressPercent.textContent = '⚠️';
                clearInterval(interval);
            }
        }, 1500);
    };

    const handleRealFileImport = async (file) => {
        if (!importDropArea || !importProgressBox || !importProgressFill || !importProgressPercent) return;
        if (!file || !file.name.toLowerCase().endsWith('.json')) {
            alert('Please select "conversations.json".');
            return;
        }
        importDropArea.style.display = 'none';
        importProgressBox.style.display = 'flex';
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('/import/chatgpt-conversations', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Upload failed.');
            pollImportStatus(result.task_id);
        } catch (error) {
            if (importProgressPercent) importProgressPercent.textContent = '❌';
            setTimeout(() => {
                if (importDropArea) importDropArea.style.display = 'block';
                if (importProgressBox) importProgressBox.style.display = 'none';
            }, 5000);
        }
    };

    const loadSources = async () => {
        try {
            const response = await fetch('/sources');
            allSources = await response.json();
            renderSourcesList();
        } catch (error) {
            console.error('Failed to load sources:', error);
        }
    };

    const renderSourcesList = (searchTerm = '') => {
        if (!sourcesListChats || !sourcesListFiles) return;
        sourcesListChats.innerHTML = '';
        sourcesListFiles.innerHTML = '';
        const lowerCaseSearch = searchTerm.toLowerCase();

        const filteredSources = allSources.filter(source => source.name.toLowerCase().includes(lowerCaseSearch));

        filteredSources.forEach(source => {
            const li = document.createElement('li');
            const isChecked = selectedSourceIDs === null || selectedSourceIDs.includes(source.id);
            const typeLabel = source.type.replace('_', ' ');
            li.innerHTML = `
                <input type="checkbox" id="source-${source.id}" data-id="${source.id}" ${isChecked ? 'checked' : ''}>
                <label for="source-${source.id}">${source.name} <span class="source-type">(${typeLabel})</span></label>
            `;
            if (source.type === 'file') {
                sourcesListFiles.appendChild(li);
            } else {
                sourcesListChats.appendChild(li);
            }
        });
    };

    const handleKnowledgeUpload = async (files) => {
        if (!files.length) return;
        const formData = new FormData();
        for (const file of files) {
            formData.append('file', file);
        }

        try {
            const response = await fetch('/sources/upload', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Upload failed');
            }
            const result = await response.json();
            alert(result.message);
            loadSources(); // Refresh the sources list
        } catch (error) {
            alert(`Error uploading files: ${error.message}`);
        }
    };

    const updateSourcesBadge = () => {
        if (!sourcesBadge) return;
        if (selectedSourceIDs === null) {
            sourcesBadge.textContent = 'All';
        } else if (selectedSourceIDs.length === 0) {
            sourcesBadge.textContent = 'None';
        } else {
            sourcesBadge.textContent = selectedSourceIDs.length;
        }
    };

const tolerance = 20;

const findMostVisibleMessage = () => {
    const messages = messageArea.querySelectorAll('.message-wrapper');
    const containerRect = messageArea.getBoundingClientRect();

    let maxVisible = 0;
    let bestMsg = null;

    for (const msg of messages) {
        const msgRect = msg.getBoundingClientRect();
        const overlap =
            Math.min(containerRect.bottom, msgRect.bottom) -
            Math.max(containerRect.top, msgRect.top);

        if (overlap > maxVisible) {
            maxVisible = overlap;
            bestMsg = msg;
        }
    }

    return bestMsg || messages[messages.length - 1];
};

const navigateToMessageBoundary = (direction) => {
    const currentMsg = findMostVisibleMessage();
    if (!currentMsg) return;

    const containerRect = messageArea.getBoundingClientRect();
    const msgRect = currentMsg.getBoundingClientRect();

    if (direction === 'up') {
        const prevMsg = currentMsg.previousElementSibling;
        if (prevMsg) {
            prevMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            currentMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else { // down
        const nextMsg = currentMsg.nextElementSibling;
        if (nextMsg) {
            nextMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            currentMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }
};

const handlePromptHistory = (event) => {
    if (messageInput.value !== '' && messageInput.selectionStart > 0) return;

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (historyIndex === -1) {
            draftMessage = messageInput.value;
            historyIndex = promptHistory.length - 1;
        } else if (historyIndex > 0) {
            historyIndex--;
        }
        if (promptHistory[historyIndex] !== undefined) {
            messageInput.value = promptHistory[historyIndex];
        }
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex > -1 && historyIndex < promptHistory.length - 1) {
            historyIndex++;
            messageInput.value = promptHistory[historyIndex];
        } else {
            historyIndex = -1;
            messageInput.value = draftMessage;
        }
    }
};

    const showHomePage = () => {
        currentChatId = null;
        updateHistoryActiveState();
        updateDropdownMenu();
        if (homePageView) homePageView.style.display = 'block';
        if (mainChatArea) mainChatArea.classList.remove('chat-active');
        if (messageArea) messageArea.innerHTML = '';
        if (chatHeaderTitle) chatHeaderTitle.textContent = '';
        if (currentModelBtn) currentModelBtn.textContent = globalModel.split('/').pop();
        loadChatHistory();
    };

    const showChatView = () => {
        if (homePageView) homePageView.style.display = 'none';
        if (mainChatArea) mainChatArea.classList.add('chat-active');
    };

    const scrollToBottom = () => {
        if (messageArea) {
            messageArea.scrollTop = messageArea.scrollHeight;
        }
    };

    const updateHistoryActiveState = () => {
        if (!historyList) return;
        const items = historyList.querySelectorAll('li');
        items.forEach(li => {
            li.classList.toggle('active', li.dataset.chatId === currentChatId);
        });
    };

    const updateDropdownMenu = () => {
        if (!dropdownMenu) return;
        if (!currentChatId) {
            dropdownMenu.innerHTML = ''; // Clear it if no chat is active
            return;
        }
        let menuItems = '';
        const isTemp = currentChatId.startsWith('temp_');

        if (isTemp) {
            menuItems = `
                <a href="#" data-action="rename">Rename</a>
                <a href="#" data-action="delete" class="delete-option">Delete</a>
            `;
        } else if (isShowingArchived) {
            menuItems = `
                <a href="#" data-action="rename">Rename</a>
                <a href="#" data-action="unarchive">Unarchive</a>
            `;
        } else {
            menuItems = `
                <a href="#" data-action="rename">Rename</a>
                <a href="#" data-action="archive">Archive</a>
                <a href="#" data-action="delete" class="delete-option">Delete</a>
            `;
        }
        dropdownMenu.innerHTML = menuItems;
    };

    const loadTemporaryChat = (chatId) => {
        if (!mainChatArea || !messageArea || !chatHeaderTitle || !currentModelBtn) return;

        const chatData = temporaryChats[chatId];
        if (!chatData) {
            console.error(`Temporary chat with ID ${chatId} not found.`);
            return;
        }

        currentChatId = chatId;
        updateHistoryActiveState();
        mainChatArea.classList.add('is-temporary');
        mainChatArea.classList.remove('is-archived');
        chatHeaderTitle.textContent = chatData.title;
        currentModelBtn.textContent = globalModel.split('/').pop();

        messageArea.innerHTML = '';
        chatData.messages.forEach(msg => renderMessage(msg, messageArea));
        showChatView();
        updateDropdownMenu();
        scrollToBottom();
    };

const loadChat = async (chatId) => {
    if (!chatId || !chatHeaderTitle || !messageArea || !mainChatArea || !currentModelBtn) return;

    if (chatId.startsWith('temp_')) {
        loadTemporaryChat(chatId);
        return;
    }

    // --- NEW PAGINATION LOGIC STARTS HERE ---
    mainChatArea.classList.remove('is-temporary');
    currentChatId = chatId;
    currentPage = 1; // Reset to page 1 for any new chat load
    updateHistoryActiveState();
    mainChatArea.classList.toggle('is-archived', isShowingArchived);

    try {
        // Fetch the first page (most recent 50 messages)
        const response = await fetch(`/chat/${chatId}?page=${currentPage}`);
        if (!response.ok) throw new Error(`Chat not found`);
        const chatData = await response.json();

        messageArea.innerHTML = ''; // Clear the area for the new chat
        chatHeaderTitle.textContent = chatData.title;
        const modelName = chatData.model || globalModel;
        currentModelBtn.textContent = modelName.split('/').pop();

        // Check if there are more messages to load
        const totalMessages = chatData.messages_page.total_messages_in_chat;
        const pageSize = 50; // Must match the backend default
        if (totalMessages > pageSize) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.textContent = 'Load More Messages';
            loadMoreBtn.id = 'load-more-btn';
            loadMoreBtn.addEventListener('click', handleLoadMoreMessages);
            messageArea.appendChild(loadMoreBtn);
        }

        // Render the first page of messages
        chatData.messages_page.messages.forEach(msg => renderMessage(msg, messageArea));
        
        showChatView();
        updateDropdownMenu();
        scrollToBottom(); // Scroll to the newest messages at the bottom

    } catch (error) {
        console.error('Failed to load chat:', error);
        showHomePage();
        alert('Failed to load chat.');
    }
};

// --- NEW HELPER FUNCTION FOR PAGINATION ---
const handleLoadMoreMessages = async () => {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (!loadMoreBtn) return;

    loadMoreBtn.textContent = 'Loading...';
    loadMoreBtn.disabled = true;
    currentPage++; // Go to the next page

    try {
        const response = await fetch(`/chat/${currentChatId}?page=${currentPage}`);
        if (!response.ok) throw new Error('Failed to fetch more messages');
        const chatData = await response.json();
        const newMessages = chatData.messages_page.messages;

        // This is a clever trick to keep the user's view stable
        const oldScrollHeight = messageArea.scrollHeight;
        
        // Remove the button before adding new messages
        loadMoreBtn.remove();

        // Create a temporary container to render new messages into
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        newMessages.forEach(msg => renderMessage(msg, tempDiv));
        
        // Prepend the new messages to the top of the chat area
        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }
        messageArea.prepend(fragment);
        
        // Restore the scroll position so the view doesn't jump
        messageArea.scrollTop = messageArea.scrollHeight - oldScrollHeight;

        // Check if we need to show the button again
        const totalMessages = chatData.messages_page.total_messages_in_chat;
        const messagesLoaded = currentPage * 50;
        if (totalMessages > messagesLoaded) {
            const newLoadMoreBtn = document.createElement('button');
            newLoadMoreBtn.textContent = 'Load More Messages';
            newLoadMoreBtn.id = 'load-more-btn';
            newLoadMoreBtn.addEventListener('click', handleLoadMoreMessages);
            messageArea.prepend(newLoadMoreBtn); // Add it back to the top
        }

    } catch (error) {
        console.error('Error loading more messages:', error);
        loadMoreBtn.textContent = 'Error - Retry';
        loadMoreBtn.disabled = false;
    }
};

    const loadChatHistory = async () => {
        if (!historyList) return;
        const endpoint = isShowingArchived ? '/chats/archived' : '/chats';
        historyList.innerHTML = '';

        try {
            const response = await fetch(endpoint);
            const chats = await response.json();
            chats.forEach(chat => {
                const li = document.createElement('li');
                li.dataset.chatId = chat.id;
                li.textContent = chat.title;
                historyList.appendChild(li);
            });

            if (!isShowingArchived) {
                Object.values(temporaryChats).forEach(chat => {
                    const li = document.createElement('li');
                    li.dataset.chatId = chat.id;
                    li.textContent = chat.title;
                    li.classList.add('temporary-chat-item');
                    historyList.prepend(li);
                });
            }

        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
        updateHistoryActiveState();
    };

    const handleSendMessage = async () => {
        if (!messageInput || !messageArea) return;
        const text = messageInput.value.trim();
        if (!text) return;

        if (!promptHistory.includes(text)) { promptHistory.push(text); }
        historyIndex = -1;
        draftMessage = '';

        const userMessage = { role: 'user', text };
        messageInput.value = '';
        messageInput.style.height = '44px';

        const isTempChatMode = tempChatBtn.classList.contains('active');
        let chatToUpdateId = currentChatId;

        if (isTempChatMode && (!chatToUpdateId || !chatToUpdateId.startsWith('temp_'))) {
            const newTempId = `temp_${Date.now()}`;
            const newTempTitle = text.substring(0, 30) + '...';
            temporaryChats[newTempId] = { id: newTempId, title: newTempTitle, messages: [] };
            chatToUpdateId = newTempId;
            await loadChatHistory();
            loadTemporaryChat(newTempId);
        } else if (!chatToUpdateId) {
            const newChat = await fetch('/chats', { method: 'POST' }).then(res => res.json());
            chatToUpdateId = newChat.id;
            await loadChatHistory();
            await loadChat(chatToUpdateId);
        }

        renderMessage(userMessage, messageArea);
        scrollToBottom();

        const messageRequest = {
            text: text,
            model: globalModel,
            source_ids: selectedSourceIDs
        };

        try {
            const isCurrentChatTemporary = chatToUpdateId && chatToUpdateId.startsWith('temp_');
            const endpoint = isCurrentChatTemporary ? '/chat/temporary' : `/chat/${chatToUpdateId}/message`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageRequest)
            });

            const aiMessage = await response.json();
            if (!response.ok) {
                throw new Error(aiMessage.text || aiMessage.detail || 'Failed to get AI response.');
            }

            if (isCurrentChatTemporary) {
                temporaryChats[chatToUpdateId].messages.push(userMessage);
                temporaryChats[chatToUpdateId].messages.push(aiMessage);
                saveTemporaryChatsToSession();
            }

            renderMessage(aiMessage, messageArea);
            scrollToBottom();

        } catch (error) {
            const errorMessage = { role: 'assistant', text: `Error: ${error.message}` };
            renderMessage(errorMessage, messageArea);
            scrollToBottom();
        }
    };

    const setupEventListeners = () => {
        if (verifyApiKeyBtn) verifyApiKeyBtn.addEventListener('click', () => handleApiKeyVerification(false));
        if (apiKeyInput) {
            apiKeyInput.addEventListener('focus', () => {
                apiKeyInput.value = '';
                apiKeyInput.placeholder = 'Enter new API key...';
                if(verifyApiKeyBtn) verifyApiKeyBtn.style.display = 'block'; // Always show Verify when they are typing
            });

            apiKeyInput.addEventListener('blur', () => {
                if (apiKeyInput.value.trim() === '') {
                    const savedState = localStorage.getItem('neuroChatState');
                    if (savedState) {
                        const state = JSON.parse(savedState);
                        apiKeyInput.placeholder = maskApiKey(state.apiKey);
                    } else {
                        apiKeyInput.placeholder = 'sk-...';
                    }
                }
                updateVerifyButtonVisibility(); // Re-evaluate if the button should be shown
            });
        }

        if (aiModelContainer) aiModelContainer.addEventListener('click', (e) => { if (e.target.classList.contains('ai-model-item')) { const newModel = e.target.dataset.modelId; globalModel = newModel; if (!currentChatId || currentChatId.startsWith('temp_')) { if (currentModelBtn) currentModelBtn.textContent = globalModel.split('/').pop(); } saveState(); alert(`Global default model set to: ${newModel}`); } });
        if (currentModelBtn) currentModelBtn.addEventListener('click', async () => { if (!currentChatId || currentChatId.startsWith('temp_')) return alert("Select a permanent chat to set its model."); const modelListForPrompt = availableModels.map(m => m.id).join('\n'); const modelSelection = prompt(`Current model: ${currentModelBtn.textContent}\n\nEnter new model for this chat:\n\n${modelListForPrompt}`); if (modelSelection && modelSelection.trim()) { try { const newModel = modelSelection.trim(); await fetch(`/chat/${currentChatId}/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: newModel }) }); currentModelBtn.textContent = newModel.split('/').pop(); } catch { alert('Could not set model for chat.'); } } });
        newChatButtons.forEach(button => button.addEventListener('click', showHomePage));
        if (historyList) historyList.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && li.dataset.chatId) { loadChat(li.dataset.chatId); } });
        if (promptStartersContainer) promptStartersContainer.addEventListener('click', (e) => { const card = e.target.closest('.starter-card'); if (card && messageInput) { const h3 = card.querySelector('h3').textContent; const p = card.querySelector('p').textContent; messageInput.value = `${h3} ${p}`; handleSendMessage(); } });

        if (tempChatBtn) {
            const updateTempChatButtonState = () => {
                const isActive = tempChatBtn.classList.contains('active');
                tempChatBtn.title = `Temporary Chat is ${isActive ? 'ON' : 'OFF'}`;
            };

            tempChatBtn.addEventListener('click', () => {
                tempChatBtn.classList.toggle('active');
                updateTempChatButtonState();
            });
            updateTempChatButtonState();
        }

        if (toggleArchiveViewBtn) toggleArchiveViewBtn.addEventListener('click', () => { isShowingArchived = !isShowingArchived; toggleArchiveViewBtn.textContent = isShowingArchived ? 'Active Chats' : 'Archived'; showHomePage(); });
        if (kebabBtn && dropdownMenu) { kebabBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdownMenu.classList.toggle('show'); }); window.addEventListener('click', (e) => { if (dropdownMenu.classList.contains('show') && !kebabBtn.contains(e.target) && !dropdownMenu.contains(e.target)) { dropdownMenu.classList.remove('show'); } }); }
        if (optionsBtn && optionsPanel) optionsBtn.addEventListener('click', () => { optionsPanel.classList.toggle('show'); optionsBtn.textContent = optionsPanel.classList.contains('show') ? 'Close Options' : 'Options'; });

        if (dropdownMenu) dropdownMenu.addEventListener('click', async (e) => {
            e.preventDefault();
            const action = e.target.dataset.action;
            if (!action || !currentChatId) return;

            const isTemp = currentChatId.startsWith('temp_');
            const currentTitle = isTemp ? temporaryChats[currentChatId].title : chatHeaderTitle.textContent;

            if (action === 'rename') {
                const newTitle = prompt("Enter new title:", currentTitle);
                if (newTitle && newTitle.trim() !== "" && newTitle.trim() !== currentTitle) {
                    const finalTitle = newTitle.trim();
                    if (isTemp) {
                        temporaryChats[currentChatId].title = finalTitle;
                        saveTemporaryChatsToSession();
                        chatHeaderTitle.textContent = finalTitle;
                        historyList.querySelector(`[data-chat-id="${currentChatId}"]`).textContent = finalTitle;
                    } else {
                        try {
                            await fetch(`/chat/${currentChatId}/rename`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_title: finalTitle }) });
                            chatHeaderTitle.textContent = finalTitle;
                            historyList.querySelector(`[data-chat-id="${currentChatId}"]`).textContent = finalTitle;
                            loadSources();
                        } catch { alert('Could not rename chat.'); }
                    }
                }
            }
            else if (action === 'delete') {
                if (confirm("Delete this chat permanently? This cannot be undone.")) {
                    if (isTemp) {
                        delete temporaryChats[currentChatId];
                        saveTemporaryChatsToSession();
                        showHomePage();
                    } else {
                        try {
                            await fetch(`/chat/${currentChatId}`, { method: 'DELETE' });
                            showHomePage();
                            // After deleting a chat, we must refresh the sources list.
                            loadSources();
                        } catch { alert('Could not delete chat.'); }
                    }
                }
            }
            else if (action === 'archive') {
                if (confirm("Archive this chat?")) {
                    try { await fetch(`/chat/${currentChatId}/archive`, { method: 'POST' }); showHomePage(); } catch { alert('Could not archive chat.'); }
                }
            }
            else if (action === 'unarchive') {
                if (confirm("Unarchive this chat?")) {
                    try {
                        await fetch(`/chat/${currentChatId}/unarchive`, { method: 'POST' });
                        isShowingArchived = false;
                        toggleArchiveViewBtn.textContent = 'Archived';
                        showHomePage();
                    } catch { alert('Could not unarchive chat.'); }
                }
            }
            dropdownMenu.classList.remove('show');
        });

        if (importDropArea && jsonFileInput) { importDropArea.addEventListener('click', () => jsonFileInput.click()); jsonFileInput.addEventListener('change', (e) => handleRealFileImport(e.target.files[0])); importDropArea.addEventListener('dragover', (e) => { e.preventDefault(); importDropArea.classList.add('drag-over'); }); importDropArea.addEventListener('dragleave', () => importDropArea.classList.remove('drag-over')); importDropArea.addEventListener('drop', (e) => { e.preventDefault(); importDropArea.classList.remove('drag-over'); handleRealFileImport(e.dataTransfer.files[0]); }); }
        if (knowledgeUploadBtn) knowledgeUploadBtn.addEventListener('click', () => knowledgeFileInput.click());
        if (knowledgeFileInput) knowledgeFileInput.addEventListener('change', (e) => handleKnowledgeUpload(e.target.files));
        if (sourcesBtn) sourcesBtn.addEventListener('click', () => { if (sourcesModalOverlay) sourcesModalOverlay.style.display = 'flex'; loadSources(); });
        if (closeSourcesModalBtn) closeSourcesModalBtn.addEventListener('click', () => { if (sourcesModalOverlay) sourcesModalOverlay.style.display = 'none'; });
        if (sourcesModalOverlay) sourcesModalOverlay.addEventListener('click', (e) => { if (e.target === sourcesModalOverlay) { sourcesModalOverlay.style.display = 'none'; } });
        if (sourcesSearchInput) sourcesSearchInput.addEventListener('input', (e) => renderSourcesList(e.target.value));
        if (selectAllSourcesBtn) selectAllSourcesBtn.addEventListener('click', () => { sourcesModal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true); });
        if (selectNoneSourcesBtn) selectNoneSourcesBtn.addEventListener('click', () => { sourcesModal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false); });
        if (applySourcesBtn) applySourcesBtn.addEventListener('click', () => { const allChecked = sourcesModal.querySelectorAll('input[type="checkbox"]:checked'); const allBoxes = sourcesModal.querySelectorAll('input[type="checkbox"]'); selectedSourceIDs = allChecked.length === allBoxes.length ? null : Array.from(allChecked).map(cb => cb.dataset.id); updateSourcesBadge(); if (sourcesModalOverlay) sourcesModalOverlay.style.display = 'none'; });
        if (sendBtn) sendBtn.addEventListener('click', handleSendMessage);

        if (navUpBtn) navUpBtn.addEventListener('click', () => navigateToMessageBoundary('up'));
        if (navDownBtn) navDownBtn.addEventListener('click', () => navigateToMessageBoundary('down'));

        window.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'ArrowUp') {
                e.preventDefault();
                navigateToMessageBoundary('up');
            }
            if (e.altKey && e.key === 'ArrowDown') {
                e.preventDefault();
                navigateToMessageBoundary('down');
            }
        });

        if (messageInput) {
            messageInput.addEventListener('keydown', handlePromptHistory);
            messageInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                }
            });
        }
    };
	
const maskApiKey = (key) => {
    if (!key || key.length < 12) {
        return '';
    }
    const prefix = key.substring(0, 8);
    const suffix = key.substring(key.length - 4);
    return `${prefix}●●●●●●●●●●${suffix}`;
};

const updateVerifyButtonVisibility = () => {
    const savedState = localStorage.getItem('neuroChatState');
    let currentKey = '';
    if (savedState) {
        currentKey = JSON.parse(savedState).apiKey || '';
    }

    if ((defaultApiKey && currentKey !== defaultApiKey) || !defaultApiKey) {
        verifyApiKeyBtn.style.display = 'block';
    } else {
        verifyApiKeyBtn.style.display = 'none';
    }
};

const initializeAppState = async () => {
    const savedState = localStorage.getItem('neuroChatState');
    if (savedState) {
        const state = JSON.parse(savedState);
        globalModel = state.globalModel || null;
    }

    try {
        const response = await fetch('/config/status');
        const serverConfig = await response.json();
        
        let keyToUse = null;

        if (serverConfig.default_api_key) {
            console.log("Found default API key from the server's .env file.");
            defaultApiKey = serverConfig.default_api_key;
            keyToUse = defaultApiKey;
        } else {
            console.log("No default key on server. Checking browser storage.");
            // We can re-use the savedState we loaded earlier
            if (savedState) {
                keyToUse = JSON.parse(savedState).apiKey;
            }
        }

        if (keyToUse) {
            apiKeyInput.value = keyToUse;
            saveState(); // Save to localStorage (ensures key is stored if coming from .env)
            
            apiKeyInput.type = 'text';
            apiKeyInput.placeholder = maskApiKey(keyToUse);
            apiKeyInput.value = '';
            
            // Now, when this is called, globalModel will have your saved value!
            handleApiKeyVerification(true, keyToUse);
        } else {
            console.log("No API key found. Waiting for user input.");
            updateVerifyButtonVisibility();
        }

    } catch (error) {
        console.error("Failed to get server config status. Waiting for user input.", error);
        updateVerifyButtonVisibility();
    }

    loadTemporaryChatsFromSession();
    loadChatHistory();
    loadSources();
    updateSourcesBadge();
    setupEventListeners();
    if (currentChatId === null && homePageView) {
        homePageView.style.display = 'block';
    }
};

    const init = () => {
        initializeAppState();
    };

    init();
});