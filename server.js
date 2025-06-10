// Import core modules
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import services and LangChain components
const { scrapeWebsite } = require('./src/services/scraper.service');
const { ingest } = require('./src/services/ingestion.service');
const chatService = require('./src/services/chat.service');
const { FaissStore } = require('@langchain/community/vectorstores/faiss');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { Storage } = require('@google-cloud/storage');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// State Management
const appState = {
    isReady: false,
    siteUrl: null,
};

// --- Cache & GCS Configuration ---
const LOCAL_CACHE_DIR = path.join(__dirname, 'vector_stores');
if (!fs.existsSync(LOCAL_CACHE_DIR)) {
    fs.mkdirSync(LOCAL_CACHE_DIR);
}

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const useGcs = !!GCS_BUCKET_NAME;
const storage = useGcs ? new Storage() : null;
const gcsBucket = useGcs ? storage.bucket(GCS_BUCKET_NAME) : null;

if (useGcs) {
    console.log(`[GCS] Google Cloud Storage is ENABLED. Using bucket: ${GCS_BUCKET_NAME}`);
} else {
    console.log('[GCS] Google Cloud Storage is DISABLED. Using local filesystem cache.');
}

function getCacheKeyFromUrl(url) {
    const sanitizedUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    return crypto.createHash('md5').update(sanitizedUrl).digest('hex');
}

// --- NEW GCS HELPER FUNCTIONS ---

/**
 * Downloads a directory structure from GCS.
 * @param {string} gcsPrefix - The "folder" in GCS to download from.
 * @param {string} localDest - The local directory to download to.
 */
async function downloadDirectoryFromGCS(gcsPrefix, localDest) {
    console.log(`[GCS] Downloading directory from gs://${GCS_BUCKET_NAME}/${gcsPrefix} to ${localDest}`);
    const [files] = await gcsBucket.getFiles({ prefix: gcsPrefix });
    
    if (files.length === 0) {
        throw new Error(`GCS directory prefix ${gcsPrefix} not found or is empty.`);
    }

    fs.mkdirSync(localDest, { recursive: true });

    await Promise.all(
        files.map(async (file) => {
            const destFileName = path.join(localDest, path.basename(file.name));
            await file.download({ destination: destFileName });
            console.log(`[GCS] Downloaded ${file.name} to ${destFileName}`);
        })
    );
}

/**
 * Uploads a local directory's contents to GCS.
 * @param {string} localPath - The local directory to upload.
 * @param {string} gcsPrefix - The "folder" in GCS to upload to.
 */
async function uploadDirectoryToGCS(localPath, gcsPrefix) {
    console.log(`[GCS] Uploading directory ${localPath} to gs://${GCS_BUCKET_NAME}/${gcsPrefix}`);
    const files = fs.readdirSync(localPath);
    await Promise.all(
        files.map(async (fileName) => {
            const localFilePath = path.join(localPath, fileName);
            const gcsFilePath = `${gcsPrefix}/${fileName}`;
            await gcsBucket.upload(localFilePath, { destination: gcsFilePath });
            console.log(`[GCS] Uploaded ${localFilePath} to ${gcsFilePath}`);
        })
    );
}


// --- API Routes ---

app.post('/api/prepare-site', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required.' });

    const cacheKey = getCacheKeyFromUrl(url);
    const localCachePath = path.join(LOCAL_CACHE_DIR, cacheKey);

    console.log(`[API] Received request for ${url}. Cache key: ${cacheKey}`);
    appState.isReady = false;

    let vectorStore;

    try {
        let cacheExists = false;
        if (useGcs) {
            // A more robust check: does the index file exist within the prefix?
            const [exists] = await gcsBucket.file(`${cacheKey}/faiss.index`).exists();
            cacheExists = exists;
        } else {
            cacheExists = fs.existsSync(localCachePath);
        }

        if (cacheExists) {
            console.log(`[CACHE HIT] Found vector store for ${url}.`);
            if (useGcs) {
                await downloadDirectoryFromGCS(cacheKey, localCachePath);
            }
            const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY });
            vectorStore = await FaissStore.load(localCachePath, embeddings);
            console.log('[CACHE] Vector store loaded successfully.');
        } else {
            console.log(`[CACHE MISS] No vector store found for ${url}. Starting fresh scrape.`);
            const rawText = await scrapeWebsite(url, 30);
            if (!rawText || !rawText.trim()) throw new Error("Could not find any text content on the provided URL.");
            
            console.log('[API] Starting ingestion...');
            vectorStore = await ingest(rawText);
            
            await vectorStore.save(localCachePath);
            console.log(`[CACHE] New vector store saved locally to ${localCachePath}`);
            
            if (useGcs) {
                await uploadDirectoryToGCS(localCachePath, cacheKey);
            }
        }
        
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


// ... (The other routes /api/chat and /api/status remain unchanged) ...
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!appState.isReady) return res.status(400).json({ error: 'Chatbot is not ready. Please load a website first.' });
    if (!message) return res.status(400).json({ error: 'Message is required.' });
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

// Server Activation
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Application is now in dynamic mode with caching enabled.');
});