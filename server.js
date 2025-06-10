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


// --- State Management (Simple In-Memory) ---
// This object will hold the state of our application, like the initialized vector store.
const appState = {
  isReady: false,
  siteUrl: null,
};

// --- API Routes ---
app.get('/api/status', (req, res) => {
    // Return the status including whether the chatbot is ready
    res.status(200).json({ 
        status: 'Server is running',
        isReady: appState.isReady,
        siteUrl: appState.siteUrl
    });
});

// A new endpoint to handle chat messages
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    
    // Validate request
    if (!appState.isReady) {
        return res.status(400).json({ error: 'Chatbot is not ready. Please initialize a site first.' });
    }
    if (!message) {
        return res.status(400).json({ error: 'Message is required in the request body.' });
    }

    try {
        const response = await chatService.callChain(message);
        res.status(200).json({ response });
    } catch (error) {
        console.error('[Server] Chat Error:', error);
        res.status(500).json({ error: 'Failed to get response from chatbot.' });
    }
});


// --- Server Activation & Initial Data Loading ---
app.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('------------------------------------------------');
    console.log('PHASE 3: Standalone Chat Test Mode');
    console.log('The server will now scrape and ingest a test website.');
    console.log('This is a one-time process on server start.');
    console.log('------------------------------------------------');
    
    const testUrl = 'https://occamsadvisory.com/';
    
    try {
        console.log(`[Initializer] Starting scrape for ${testUrl}...`);
        const rawText = await scrapeWebsite(testUrl, 30); // Limit to 30 pages for faster startup
        
        console.log('[Initializer] Scraping complete. Starting ingestion...');
        const vectorStore = await ingest(rawText);
        
        console.log('[Initializer] Ingestion complete. Setting vector store for chat service...');
        chatService.setVectorStore(vectorStore);
        
        appState.isReady = true;
        appState.siteUrl = testUrl;

        console.log('------------------------------------------------');
        console.log('✅ CHATBOT IS READY TO USE! ✅');
        console.log(`Test by sending a POST request to http://localhost:${PORT}/api/chat`);
        console.log('Example with curl:');
        console.log(`curl -X POST -H "Content-Type: application/json" -d '{"message":"What services do you offer?"}' http://localhost:${PORT}/api/chat`);
        console.log('------------------------------------------------');

    } catch (error) {
        console.error('[Initializer] Failed to initialize chatbot:', error);
    }
});