import { renderMessage } from './messageRenderer.js';

document.addEventListener('DOMContentLoaded', () => {
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

    let currentChatId = null;
    let temporaryChatMessages = [];
    let isShowingArchived = false;
    let globalModel = "google/gemini-2.0-flash-exp:free";
    let availableModels = [];
    let allSources = [];
    let selectedSourceIDs = null;

    // --- NEW STATE FOR PROMPT HISTORY ---
    let promptHistory = [];
    let historyIndex = -1;
    let draftMessage = '';
    // --- END NEW STATE ---

    const saveState = () => {
        if (!apiKeyInput) return;
        const state = { globalModel, apiKey: apiKeyInput.value };
        localStorage.setItem('neuroChatState', JSON.stringify(state));
    };

    const loadState = () => {
        const savedState = localStorage.getItem('neuroChatState');
        if (savedState) {
            const state = JSON.parse(savedState);
            globalModel = state.globalModel || "google/gemini-2.0-flash-exp:free";
            if (state.apiKey && apiKeyInput) {
                apiKeyInput.value = state.apiKey;
                handleApiKeyVerification(true);
            }
        }
        if (currentModelBtn) {
            currentModelBtn.textContent = globalModel.split('/').pop();
        }
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

    const saveTemporaryChat = () => {
        sessionStorage.setItem('temporaryChat', JSON.stringify(temporaryChatMessages));
    };

    const renderModelList = () => {
        if (!aiModelContainer) return;
        if (availableModels.length === 0) {
            aiModelContainer.innerHTML = '<p style="font-size: 12px; color: #BDBDBD;">No models available. Enter a valid API key.</p>';
            return;
        }
        const preferredModel = "google/gemini-2.0-flash-exp:free";
        let recommendedHTML = '';
        let otherModels = [...availableModels];
        if (availableModels.includes(preferredModel)) {
            recommendedHTML = `<div class="recommended-model-section"><div class="recommend-title">Recommended</div><div class="ai-model-item" data-model-id="${preferredModel}">${preferredModel}</div></div><hr />`;
            otherModels = availableModels.filter(m => m !== preferredModel);
        }
        const otherModelsHTML = otherModels.map(model => `<div class="ai-model-item" data-model-id="${model}">${model}</div>`).join('');
        aiModelContainer.innerHTML = `<label>Set Global Default Model</label><div class="ai-model-list">${recommendedHTML}${otherModelsHTML}</div>`;
    };

    const handleApiKeyVerification = async (isSilent = false) => {
        if (!apiKeyInput || !verifyApiKeyBtn || !currentModelBtn) return;
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            if (!isSilent) alert("Please enter an API key.");
            return;
        }
        verifyApiKeyBtn.textContent = 'Verifying...';
        verifyApiKeyBtn.disabled = true;
        try {
            const response = await fetch('/config/api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey }) });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Verification failed');
            }
            const data = await response.json();
            availableModels = data.models;
            const preferredDefault = "google/gemini-2.0-flash-exp:free";
            if (availableModels.includes(preferredDefault)) {
                globalModel = preferredDefault;
            } else if (availableModels.length > 0) {
                globalModel = availableModels[0];
            }
            renderModelList();
            currentModelBtn.textContent = globalModel.split('/').pop();
            saveState();
            verifyApiKeyBtn.textContent = 'Verified';
            setTimeout(() => { verifyApiKeyBtn.textContent = 'Verify'; verifyApiKeyBtn.disabled = false; }, 2000);
        } catch (error) {
            if (!isSilent) alert(`API Key verification failed: ${error.message}`);
            availableModels = [];
            renderModelList();
            verifyApiKeyBtn.textContent = 'Verify';
            verifyApiKeyBtn.disabled = false;
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

    // --- [REPLACED] HELPER: Find the first message visible from the top ---
    const findFirstVisibleMessage = () => {
        const messages = messageArea.querySelectorAll('.message-wrapper');
        const containerRect = messageArea.getBoundingClientRect();

        for (const msg of messages) {
            const msgRect = msg.getBoundingClientRect();
            // A message is considered "visible" if its bottom edge is below the top of the container
            // and its top edge is above the bottom of the container.
            if (msgRect.bottom > containerRect.top && msgRect.top < containerRect.bottom) {
                return msg; // Return the very first one that meets the criteria
            }
        }
        return messages[messages.length - 1]; // Fallback to the last message if none are found
    };

    // --- [UPDATED] LOGIC: Navigate to message boundaries ---
    const navigateToMessageBoundary = (direction) => {
        const currentMsg = findFirstVisibleMessage(); // Use the new, more reliable helper
        if (!currentMsg) return;

        const containerScrollTop = messageArea.scrollTop;
        const messageTop = currentMsg.offsetTop - messageArea.offsetTop;

        if (direction === 'up') {
            if (containerScrollTop > messageTop + 5) {
                currentMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                const prevMsg = currentMsg.previousElementSibling;
                if (prevMsg) {
                    prevMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    // If there's no previous message, scroll to the very top of the container
                    messageArea.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        } else { // direction === 'down'
            const messageBottom = messageTop + currentMsg.offsetHeight;
            const containerBottom = containerScrollTop + messageArea.clientHeight;

            // Use a 5px tolerance for being "at the bottom"
            const isAtOrPastBottom = containerBottom >= messageBottom - 5;

            if (isAtOrPastBottom) {
                const nextMsg = currentMsg.nextElementSibling;
                if (nextMsg) {
                    nextMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    // If there's no next message, scroll to the very end of the container
                    messageArea.scrollTo({ top: messageArea.scrollHeight, behavior: 'smooth' });
                }
            } else {
                // If we are not yet at the bottom of the current message, scroll to its end.
                currentMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }
    };

    // --- [NEW] LOGIC: Handle prompt history recall ---
    const handlePromptHistory = (event) => {
        // Only trigger if input is empty or cursor is at the very beginning
        if (messageInput.value !== '' && messageInput.selectionStart > 0) return;
        
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (historyIndex === -1) { // Navigating for the first time
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
            } else { // Reached the end of history, restore draft
                historyIndex = -1;
                messageInput.value = draftMessage;
            }
        }
    };

    const showHomePage = () => {
        currentChatId = null;
        updateHistoryActiveState();
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

    const loadTemporaryChat = () => {
        if (!mainChatArea || !messageArea || !chatHeaderTitle || !currentModelBtn) return;
        currentChatId = 'temporary';
        updateHistoryActiveState();
        mainChatArea.classList.remove('is-archived');
        chatHeaderTitle.textContent = "Temporary Chat";
        currentModelBtn.textContent = globalModel.split('/').pop();
        messageArea.innerHTML = '';
        temporaryChatMessages.forEach(msg => renderMessage(msg, messageArea));
        showChatView();
        scrollToBottom();
    };
    
    const updateHistoryActiveState = () => {
        if (!historyList) return;
        const items = historyList.querySelectorAll('li');
        items.forEach(li => {
            li.classList.toggle('active', li.dataset.chatId === currentChatId);
        });
    };

    const loadChat = async (chatId) => {
        if (!chatId || !chatHeaderTitle || !messageArea || !mainChatArea || !currentModelBtn) return;
        if (chatId === 'temporary') {
            loadTemporaryChat();
            return;
        }
        currentChatId = chatId;
        updateHistoryActiveState();
        mainChatArea.classList.toggle('is-archived', isShowingArchived);
        try {
            const response = await fetch(`/chat/${chatId}`);
            if (!response.ok) throw new Error(`Chat not found`);
            const chatData = await response.json();
            
            messageArea.innerHTML = '';
            chatHeaderTitle.textContent = chatData.title;
            const modelName = chatData.model || globalModel;
            currentModelBtn.textContent = modelName.split('/').pop();
            chatData.messages_page.messages.forEach(msg => renderMessage(msg, messageArea));
            showChatView();
            scrollToBottom();
        } catch (error) {
            console.error('Failed to load chat:', error);
            showHomePage();
            alert('Failed to load chat.');
        }
    };

    const loadChatHistory = async () => {
        if (!historyList) return;
        const endpoint = isShowingArchived ? '/chats/archived' : '/chats';
        try {
            const response = await fetch(endpoint);
            const chats = await response.json();
            historyList.innerHTML = '';
            if (currentChatId === 'temporary') {
                const li = document.createElement('li');
                li.dataset.chatId = 'temporary';
                li.textContent = 'Temporary Chat';
                li.className = 'temporary-chat-item active';
                historyList.appendChild(li);
            }
            chats.forEach(chat => {
                const li = document.createElement('li');
                li.dataset.chatId = chat.id;
                li.textContent = chat.title;
                li.className = chat.id === currentChatId ? 'active' : '';
                historyList.appendChild(li);
            });
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    };
    
    const handleSendMessage = async () => {
        if (!messageInput || !messageArea) return;
        const text = messageInput.value.trim();
        if (!text) return;

        // --- ADD THIS BLOCK ---
        if (!promptHistory.includes(text)) { // Avoid duplicate entries
            promptHistory.push(text);
        }
        historyIndex = -1; // Reset history navigation
        draftMessage = '';
        // --- END OF ADDITION ---
    
        const userMessage = { role: 'user', text };
        messageInput.value = '';
        messageInput.style.height = '44px'; // Reset height

        const isTemporary = tempChatBtn.classList.contains('active') || currentChatId === 'temporary';

        if (isTemporary && !currentChatId) {
            loadTemporaryChat();
        }
        
        if (currentChatId === 'temporary') {
            temporaryChatMessages.push(userMessage);
            saveTemporaryChat();
        }

        renderMessage(userMessage, messageArea);
        scrollToBottom();

        if (!isTemporary && !currentChatId) {
            try {
                const newChatResponse = await fetch('/chats', { method: 'POST' });
                const newChat = await newChatResponse.json();
                currentChatId = newChat.id;
                await loadChatHistory();
                updateHistoryActiveState();
                chatHeaderTitle.textContent = newChat.title;
                showChatView();
            } catch (error) {
                renderMessage({ role: 'assistant', text: `Error: Could not create a new chat. ${error.message}` }, messageArea);
                return;
            }
        }

        const messageRequest = {
            text: text,
            model: globalModel,
            source_ids: selectedSourceIDs
        };

        try {
            const endpoint = currentChatId === 'temporary' ? '/chat/temporary' : `/chat/${currentChatId}/message`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageRequest)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to get response.');
            }

            const aiMessage = await response.json();

            if (currentChatId === 'temporary') {
                temporaryChatMessages.push(aiMessage);
                saveTemporaryChat();
            } else {
                 if (historyList.querySelector(`[data-chat-id="${currentChatId}"]`).textContent.startsWith("New Chat")) {
                    await loadChatHistory();
                    updateHistoryActiveState();
                 }
            }
            
            renderMessage(aiMessage, messageArea);
            scrollToBottom();

        } catch (error) {
            const errorMessage = { role: 'assistant', text: `Error: ${error.message}` };
            renderMessage(errorMessage, messageArea);
            scrollToBottom();
        }
    };

    // --- Event Listeners & Initial Load ---
    const setupEventListeners = () => {
        if (verifyApiKeyBtn) verifyApiKeyBtn.addEventListener('click', () => handleApiKeyVerification(false));
        if (aiModelContainer) aiModelContainer.addEventListener('click', (e) => { if (e.target.classList.contains('ai-model-item')) { const newModel = e.target.dataset.modelId; globalModel = newModel; if (!currentChatId || currentChatId === 'temporary') { if(currentModelBtn) currentModelBtn.textContent = globalModel.split('/').pop(); } saveState(); alert(`Global default model set to: ${newModel}`); } });
        if (currentModelBtn) currentModelBtn.addEventListener('click', async () => { if (!currentChatId || currentChatId === 'temporary') return alert("Select a permanent chat to set its model."); const modelSelection = prompt(`Current model: ${currentModelBtn.textContent}\n\nEnter new model for this chat:\n\n${availableModels.join('\n')}`); if (modelSelection && modelSelection.trim()) { try { const newModel = modelSelection.trim(); await fetch(`/chat/${currentChatId}/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: newModel }) }); currentModelBtn.textContent = newModel.split('/').pop(); } catch { alert('Could not set model for chat.'); } } });
        newChatButtons.forEach(button => button.addEventListener('click', showHomePage));
        if (historyList) historyList.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && li.dataset.chatId) { loadChat(li.dataset.chatId); } });
        if (promptStartersContainer) promptStartersContainer.addEventListener('click', (e) => { const card = e.target.closest('.starter-card'); if (card && messageInput) { const h3 = card.querySelector('h3').textContent; const p = card.querySelector('p').textContent; messageInput.value = `${h3} ${p}`; handleSendMessage(); } });
        if (tempChatBtn) tempChatBtn.addEventListener('click', () => tempChatBtn.classList.toggle('active'));
        if (toggleArchiveViewBtn) toggleArchiveViewBtn.addEventListener('click', () => { isShowingArchived = !isShowingArchived; toggleArchiveViewBtn.textContent = isShowingArchived ? 'Active Chats' : 'Archived'; showHomePage(); });
        if (kebabBtn && dropdownMenu) { kebabBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdownMenu.classList.toggle('show'); }); window.addEventListener('click', (e) => { if (dropdownMenu.classList.contains('show') && !kebabBtn.contains(e.target) && !dropdownMenu.contains(e.target)) { dropdownMenu.classList.remove('show'); } }); }
        if (optionsBtn && optionsPanel) optionsBtn.addEventListener('click', () => { optionsPanel.classList.toggle('show'); optionsBtn.textContent = optionsPanel.classList.contains('show') ? 'Close Options' : 'Options'; });
        if (dropdownMenu) dropdownMenu.addEventListener('click', async (e) => { e.preventDefault(); const action = e.target.dataset.action; if (!action || !currentChatId || currentChatId === 'temporary') return; if (action === 'rename') { const newTitle = prompt("Enter new title:", chatHeaderTitle.textContent); if (newTitle && newTitle.trim() !== "" && newTitle !== chatHeaderTitle.textContent) { try { await fetch(`/chat/${currentChatId}/rename`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_title: newTitle.trim() }) }); chatHeaderTitle.textContent = newTitle; historyList.querySelector(`[data-chat-id="${currentChatId}"]`).textContent = newTitle; loadSources(); } catch { alert('Could not rename chat.'); } } } else if (action === 'archive') { if (confirm("Archive this chat?")) { try { await fetch(`/chat/${currentChatId}/archive`, { method: 'POST' }); showHomePage(); } catch { alert('Could not archive chat.'); } } } else if (action === 'delete') { if (confirm("Delete this chat permanently?")) { try { await fetch(`/chat/${currentChatId}`, { method: 'DELETE' }); showHomePage(); } catch { alert('Could not delete chat.'); } } } dropdownMenu.classList.remove('show'); });
        if (importDropArea && jsonFileInput) { importDropArea.addEventListener('click', () => jsonFileInput.click()); jsonFileInput.addEventListener('change', (e) => handleRealFileImport(e.target.files[0])); importDropArea.addEventListener('dragover', (e) => { e.preventDefault(); importDropArea.classList.add('drag-over'); }); importDropArea.addEventListener('dragleave', () => importDropArea.classList.remove('drag-over')); importDropArea.addEventListener('drop', (e) => { e.preventDefault(); importDropArea.classList.remove('drag-over'); handleRealFileImport(e.dataTransfer.files[0]); }); }
        if (knowledgeUploadBtn) knowledgeUploadBtn.addEventListener('click', () => knowledgeFileInput.click());
        if (knowledgeFileInput) knowledgeFileInput.addEventListener('change', (e) => handleKnowledgeUpload(e.target.files));
        if (sourcesBtn) sourcesBtn.addEventListener('click', () => { if (sourcesModalOverlay) sourcesModalOverlay.style.display = 'flex'; loadSources(); });
        if (closeSourcesModalBtn) closeSourcesModalBtn.addEventListener('click', () => { if (sourcesModalOverlay) sourcesModalOverlay.style.display = 'none'; });
        if (sourcesModalOverlay) sourcesModalOverlay.addEventListener('click', (e) => { if (e.target === sourcesModalOverlay) { sourcesModalOverlay.style.display = 'none'; } });
        if (sourcesSearchInput) sourcesSearchInput.addEventListener('input', (e) => renderSourcesList(e.target.value));
        if (selectAllSourcesBtn) selectAllSourcesBtn.addEventListener('click', () => { sourcesModal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true); });
        if (selectNoneSourcesBtn) selectNoneSourcesBtn.addEventListener('click', () => { sourcesModal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false); });
        if (applySourcesBtn) applySourcesBtn.addEventListener('click', () => { const allChecked = sourcesModal.querySelectorAll('input[type="checkbox"]:checked'); const allBoxes = sourcesModal.querySelectorAll('input[type="checkbox"]'); selectedSourceIDs = allChecked.length === allBoxes.length ? null : Array.from(allChecked).map(cb => cb.dataset.id); updateSourcesBadge(); if(sourcesModalOverlay) sourcesModalOverlay.style.display = 'none'; });
        if (sendBtn) sendBtn.addEventListener('click', handleSendMessage);
        
        // --- ADD THESE NEW LISTENERS ---
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

        // Add history recall to the message input
        if (messageInput) {
            messageInput.addEventListener('keydown', handlePromptHistory);
            // The existing Enter key listener should remain
            messageInput.addEventListener('keydown', (event) => { 
                if (event.key === 'Enter' && !event.shiftKey) { 
                    event.preventDefault(); 
                    handleSendMessage(); 
                } 
            });
        }
        // --- END OF ADDITIONS ---
    };

    const init = () => {
        loadState();
        restoreTemporaryChat();
        loadChatHistory();
        loadSources();
        updateSourcesBadge();
        setupEventListeners();
        if (currentChatId === null && homePageView) {
            homePageView.style.display = 'block';
        }
    };

    init();
});