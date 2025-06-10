// Import core modules
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs'); // Node.js File System module
const crypto = require('crypto'); // Node.js Crypto module for hashing

// Import our services
const { scrapeWebsite } = require('./src/services/scraper.service');
const { ingest } = require('./src/services/ingestion.service');
const chatService = require('./src/services/chat.service');

// MODIFICATION: Import new LangChain components required for loading the store
const { FaissStore } = require('@langchain/community/vectorstores/faiss');
const { OpenAIEmbeddings } = require('@langchain/openai');

// Load environment variables from .env file
dotenv.config();

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- State Management ---
const appState = {
    isReady: false,
    siteUrl: null,
};

// --- Cache Configuration ---
const CACHE_DIR = path.join(__dirname, 'vector_stores');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
}

/**
 * Creates a safe filename from a URL.
 * @param {string} url The URL to sanitize.
 * @returns {string} A safe filename.
 */
function getCacheKeyFromUrl(url) {
    // Sanitize URL to remove protocol and trailing slashes for consistency
    const sanitizedUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    // Create a hash for a short, consistent, and safe filename
    return crypto.createHash('md5').update(sanitizedUrl).digest('hex');
}


// --- API Routes ---

app.post('/api/prepare-site', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }

    const cacheKey = getCacheKeyFromUrl(url);
    const cachePath = path.join(CACHE_DIR, cacheKey);

    console.log(`[API] Received request for ${url}. Cache key: ${cacheKey}`);
    appState.isReady = false;

    try {
        // --- CACHE CHECK ---
        if (fs.existsSync(cachePath)) {
            console.log(`[CACHE HIT] Found existing vector store for ${url}. Loading...`);
            
            // If cache exists, load it from disk
            const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY });
            const vectorStore = await FaissStore.load(cachePath, embeddings);
            
            chatService.setVectorStore(vectorStore);
            console.log('[CACHE] Vector store loaded successfully.');

        } else {
            // --- CACHE MISS ---
            console.log(`[CACHE MISS] No vector store found for ${url}. Starting fresh scrape.`);
            console.log(`[API] Starting scrape for ${url}...`);
            const rawText = await scrapeWebsite(url, 30);

            if (!rawText || rawText.trim().length === 0) {
                throw new Error("Could not find any text content on the provided URL.");
            }
            
            console.log('[API] Scraping complete. Starting ingestion...');
            const vectorStore = await ingest(rawText);
            
            console.log('[API] Ingestion complete. Setting vector store for chat service...');
            chatService.setVectorStore(vectorStore);

            // Save the newly created vector store to disk
            await vectorStore.save(cachePath);
            console.log(`[CACHE] New vector store saved to ${cachePath}`);
        }

        appState.isReady = true;
        appState.siteUrl = url;

        console.log(`[API] ✅ Site ready: ${url}`);
        res.status(200).json({ message: `Successfully loaded and indexed ${url}` });

    } catch (error) {
        console.error('[API] Error preparing site:', error);
        appState.isReady = false;
        appState.siteUrl = null;
        res.status(500).json({ error: error.message || 'Failed to prepare the website.' });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    
    if (!appState.isReady) {
        return res.status(400).json({ error: 'Chatbot is not ready. Please load a website first.' });
    }
    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    try {
        const response = await chatService.callChain(message);
        res.status(200).json({ response });
    } catch (error) {
        console.error('[Server] Chat Error:', error);
        res.status(500).json({ error: 'Failed to get response from chatbot.' });
    }
});

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'Server is running', isReady: appState.isReady, siteUrl: appState.siteUrl });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Application is now in dynamic mode with caching enabled.');
});