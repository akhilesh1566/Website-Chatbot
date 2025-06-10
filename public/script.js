document.addEventListener('DOMContentLoaded', () => {
    // URL Loading Elements
    const urlInput = document.getElementById('url-input');
    const loadButton = document.getElementById('load-button');
    const loaderStatus = document.getElementById('loader-status');

    // Chat Elements
    const chatContainer = document.getElementById('chat-container');
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    // --- Event Listeners ---
    loadButton.addEventListener('click', handleLoadWebsite);
    chatForm.addEventListener('submit', handleSendMessage);

    // --- Handlers ---

    /**
     * Handles the "Load Website" button click.
     * Triggers the backend to scrape and ingest the site.
     */
    async function handleLoadWebsite() {
        const url = urlInput.value.trim();
        if (!isValidUrl(url)) {
            setLoaderStatus('Please enter a valid URL (e.g., https://example.com).', 'error');
            return;
        }

        // Disable UI during loading
        toggleLoadingUI(true);
        setLoaderStatus('Scraping and indexing website... This may take a few minutes.', 'loading');

        try {
            const response = await fetch('/api/prepare-site', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load website.');
            }

            setLoaderStatus(`Successfully loaded ${url}. You can now start chatting.`, 'success');
            // Hide loader and show chat
            document.getElementById('site-loader').classList.add('hidden');
            chatContainer.classList.remove('hidden');
            // Enable chat input
            toggleChatUI(false);

        } catch (error) {
            setLoaderStatus(`Error: ${error.message}`, 'error');
            toggleLoadingUI(false);
        }
    }

    /**
     * Handles sending a chat message.
     */
    async function handleSendMessage(event) {
        event.preventDefault();
        const message = messageInput.value.trim();
        if (!message) return;

        // Display user message and disable UI
        addMessageToChat(message, 'user');
        messageInput.value = '';
        toggleChatUI(true);

        // Add a "thinking" bubble for the bot
        const thinkingBubble = addMessageToChat('...', 'bot', true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to get response.');
            }
            
            // Update the "thinking" bubble with the actual response
            thinkingBubble.textContent = data.response;
            thinkingBubble.classList.remove('thinking');

        } catch (error) {
            thinkingBubble.textContent = `Error: ${error.message}`;
            thinkingBubble.classList.add('error');
        } finally {
            toggleChatUI(false);
            messageInput.focus();
        }
    }

    // --- UI Helper Functions ---

    /**
     * Adds a message to the chat window.
     * @param {string} text - The message text.
     * @param {'user' | 'bot'} sender - The sender of the message.
     * @param {boolean} isThinking - If the bot message is a placeholder.
     * @returns {HTMLElement} The created message element.
     */
    function addMessageToChat(text, sender, isThinking = false) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);
        if (isThinking) {
            messageElement.classList.add('thinking');
        }
        messageElement.textContent = text;
        chatWindow.appendChild(messageElement);
        // Scroll to the bottom
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return messageElement;
    }

    function toggleLoadingUI(isLoading) {
        urlInput.disabled = isLoading;
        loadButton.disabled = isLoading;
    }

    function toggleChatUI(isSending) {
        messageInput.disabled = isSending;
        sendButton.disabled = isSending;
    }

    function setLoaderStatus(message, type = 'info') {
        loaderStatus.textContent = message;
        loaderStatus.style.color = type === 'error' ? 'red' : (type === 'success' ? 'green' : '');
    }

    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
});