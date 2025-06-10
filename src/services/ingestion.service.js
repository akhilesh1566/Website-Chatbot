// MODIFICATION: Add dotenv configuration for standalone testing
if (require.main === module) {
    require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
}

const { OpenAIEmbeddings } = require("@langchain/openai");
const { FaissStore } = require("@langchain/community/vectorstores/faiss");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { scrapeWebsite } = require("./scraper.service");


/**
 * Takes raw text, splits it into chunks, creates embeddings, and builds a FAISS vector store.
 * @param {string} text The raw text content from the website.
 * @returns {Promise<FaissStore>} A promise that resolves to the created FAISS vector store.
 */
async function ingest(text) {
    console.log("[Ingestion] Starting ingestion process...");

    // 1. Initialize the text splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    // 2. Split the text into documents
    const documents = await textSplitter.createDocuments([text]);
    console.log(`[Ingestion] Split text into ${documents.length} documents.`);

    // 3. Initialize OpenAI embeddings
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable is not set.");
    }
    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY
    });
    console.log("[Ingestion] OpenAI embeddings initialized.");

    // 4. Create a FAISS vector store from the documents and embeddings
    console.log("[Ingestion] Creating FAISS vector store...");
    const vectorStore = await FaissStore.fromDocuments(documents, embeddings);
    console.log("[Ingestion] FAISS vector store created successfully.");

    return vectorStore;
}

// --- TEMPORARY TEST SCRIPT ---
// This part of the code will only run if you execute this file directly.
// We will remove this and trigger it from our API in a later phase.
if (require.main === module) {
    (async () => {
        console.log("--- Running Standalone Ingestion Test ---");
        const testUrl = 'https://occamsadvisory.com/'; 
        
        try {
            // Note: Scraping is a one-time cost. The subsequent phases will implement caching.
            const rawText = await scrapeWebsite(testUrl, 50); // Using the 50-page limit
            if (rawText && rawText.trim().length > 0) {
                await ingest(rawText);
                console.log("--- Standalone Ingestion Test COMPLETED ---");
            } else {
                console.log("--- Standalone Ingestion Test FAILED: No text was scraped. ---");
            }
        } catch (error) {
            console.error("--- Standalone Ingestion Test FAILED ---");
            console.error(error);
        }
    })();
}

module.exports = { ingest };