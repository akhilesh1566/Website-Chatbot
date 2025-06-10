const { ChatOpenAI } = require("@langchain/openai");
const { BufferMemory, ChatMessageHistory } = require("langchain/memory");
const {
  ChatPromptTemplate,
  MessagesPlaceholder,
} = require("@langchain/core/prompts");
const { RunnableSequence } = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { formatDocumentsAsString } = require("langchain/util/document");

// We will use a singleton pattern to hold our memory and vector store
const state = {
  vectorStore: null,
  chatHistory: new ChatMessageHistory(),
};

/**
 * Sets the vector store to be used by the chat service.
 * @param {FaissStore} vectorStore - The FAISS vector store.
 */
function setVectorStore(vectorStore) {
  console.log("[ChatService] Vector store has been set.");
  state.vectorStore = vectorStore;
  state.chatHistory = new ChatMessageHistory();
  console.log("[ChatService] Chat history has been reset.");
}

/**
 * Creates and returns the full RAG chain for conversation.
 * @returns {RunnableSequence} The runnable RAG chain.
 */
function createChain() {
  if (!state.vectorStore) {
    throw new Error("Vector store not set. Please prepare a site first.");
  }

  const llm = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0.2,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const llmReranker = async (query, documents) => {
    console.log('[Reranker] Starting LLM-based reranking...');
    const docStrings = documents.map(d => d.pageContent);
    const rerankPrompt = `Given the following user query and a list of document snippets, score each document for its relevance to the query from 0 to 10. The query is: "${query}". Respond ONLY with a JSON object where keys are the document index (as a string, e.g., "0", "1") and values are the scores.

Documents:
${docStrings.map((doc, i) => `Doc ${i}: ${doc}`).join("\n\n")}

JSON Response:`;

    const rerankLlm = new ChatOpenAI({ modelName: "gpt-3.5-turbo-0125", temperature: 0 });
    const response = await rerankLlm.invoke(rerankPrompt);
    
    try {
        const cleanedResponse = response.content.replace(/```json\n?|\n?```/g, '').trim();
        const scores = JSON.parse(cleanedResponse);
        console.log('[Reranker] Parsed scores:', scores);
        const sortedDocs = documents
            .map((doc, i) => ({ doc, score: scores[String(i)] || 0 }))
            .sort((a, b) => b.score - a.score);
        
        const topDocs = sortedDocs.slice(0, 3).map(item => item.doc);
        console.log('[Reranker] Reranking complete. Returning top 3 documents.');
        return topDocs;
    } catch(e) {
        console.error("[Reranker] Failed to parse LLM reranker response. Falling back to original documents.", e);
        return documents.slice(0, 3);
    }
  };

  const retriever = state.vectorStore.asRetriever(5);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `You are an expert assistant for the website being discussed. Your goal is to provide accurate and helpful answers based ONLY on the context provided below. Be friendly and conversational. If you don't know the answer or it's not in the context, say "I'm sorry, I couldn't find information about that on this website." DO NOT make up information.

    Context:
    {context}`],
    new MessagesPlaceholder("chat_history"),
    ["human", "{question}"],
  ]);

  const memory = new BufferMemory({
    chatHistory: state.chatHistory,
    returnMessages: true,
    memoryKey: "chat_history",
  });

  const ragChain = RunnableSequence.from([
    {
      question: (input) => input.question,
      chat_history: async (_) => {
        const memoryVariables = await memory.loadMemoryVariables({});
        return memoryVariables.chat_history;
      },
      context: async (input) => {
        console.log('[Chain] Retrieving initial documents...');
        const initialDocs = await retriever.getRelevantDocuments(input.question);
        console.log(`[Chain] Retrieved ${initialDocs.length} documents for reranking.`);
        const rerankedDocs = await llmReranker(input.question, initialDocs);
        return formatDocumentsAsString(rerankedDocs);
      },
    },
    prompt,
    llm,
    new StringOutputParser(),
  ]);

  // MODIFICATION: The wrapper to handle memory is the source of the object response.
  // We'll simplify how it works.
  const chainWithMemory = RunnableSequence.from([
    {
      question: (input) => input.question,
      memory: () => memory, // Pass memory directly
    },
    {
      // Load history, run the chain, then save the new interaction
      question: (input) => input.question,
      response: async (input) => {
        const memoryVariables = await input.memory.loadMemoryVariables({});
        const chat_history = memoryVariables.chat_history;
        const response = await ragChain.invoke({ question: input.question, chat_history });
        await input.memory.saveContext({ question: input.question }, { output: response });
        return response; // Return the string response directly
      }
    }
  ]);

  // We only care about the final 'response' key.
  return chainWithMemory.pick("response");
}

/**
 * Processes a user question and returns the chatbot's response.
 * @param {string} question The user's question.
 * @returns {Promise<string>} The chatbot's answer.
 */
async function callChain(question) {
    if (typeof question !== 'string' || !question.trim()) {
        return "Please ask a valid question.";
    }
    console.log(`[ChatService] Received question: "${question}"`);
    const chain = createChain();
    // The invoke will now directly return the string.
    const response = await chain.invoke({ question });
    console.log(`[ChatService] Generated response: "${response}"`);
    return response;
}

module.exports = {
  setVectorStore,
  callChain,
};