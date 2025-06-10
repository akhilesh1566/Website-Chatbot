// Import core modules
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

// Import our services
const { scrapeWebsite } = require('./src/services/scraper.service');
const { ingest } = require('./src/services/ingestion.service');
const chatService = require('./src/services/chat.service');

// Load environment variables from .env file
dotenv.config();

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// --- State Management ---
// NOTE: This simple in-memory state is NOT suitable for production with multiple users.
// Each user would overwrite the other's vector store.
// For this demo, it works because we assume one user at a time.
const appState = {
    isReady: false,
    siteUrl: null,
};


// --- API Routes ---

// The /api/prepare-site endpoint now dynamically loads a website.
app.post('/api/prepare-site', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }

    console.log(`[API] Received request to prepare site: ${url}`);
    appState.isReady = false; // Mark as not ready during processing

    try {
        console.log(`[API] Starting scrape for ${url}...`);
        const rawText = await scrapeWebsite(url, 30); // Limiting pages for quicker demo response

        if (!rawText || rawText.trim().length === 0) {
            throw new Error("Could not find any text content on the provided URL.");
        }
        
        console.log('[API] Scraping complete. Starting ingestion...');
        const vectorStore = await ingest(rawText);
        
        console.log('[API] Ingestion complete. Setting vector store for chat service...');
        chatService.setVectorStore(vectorStore);
        
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

// The chat endpoint remains mostly the same, but now relies on the dynamic state.
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    
    // Validate state and request
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

// A simple status endpoint for health checks or initial UI state
app.get('/api/status', (req, res) => {
    res.status(200).json({ 
        status: 'Server is running',
        isReady: appState.isReady,
        siteUrl: appState.siteUrl 
    });
});


// --- Server Activation ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Application is now in dynamic mode.');
    console.log('Open a browser and navigate to the root URL to use the UI.');
});