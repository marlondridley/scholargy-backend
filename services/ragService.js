// backend/services/ragService.js
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const { generateEmbedding, getChatCompletion } = require("./aiService");

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME;

let searchClient;

if (searchEndpoint && searchApiKey && searchIndexName) {
  searchClient = new SearchClient(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
  );
  console.log("✅ Azure Search initialized.");
} else {
  console.warn("⚠️ Azure Search environment variables are not configured.");
}

// 🔍 Vector-based embedding search
async function performVectorSearch(userQuery, topK = 3) {
  const embedding = await generateEmbedding(userQuery);
  const results = await searchClient.search("", {
    vector: {
      value: embedding,
      kNearestNeighborsCount: topK,
      fields: "embedding"
    }
  });

  const contextChunks = [];
  for await (const result of results.results) {
    if (result?.document?.content) {
      contextChunks.push(result.document.content);
    }
  }

  return contextChunks;
}

// 💬 Combine RAG workflow
async function performRagQuery(userQuery, history = []) {
  if (!searchClient) {
    throw new Error("Azure Cognitive Search is not configured.");
  }

  try {
    const contextTextChunks = await performVectorSearch(userQuery, 3);
    const contextText = contextTextChunks.join("\n---\n") || "No relevant sources found.";

    const systemPrompt = `
You are "Scholargy AI", a helpful assistant. Use ONLY the following SOURCES to answer. 
If the answer is not found in the sources, say "I don't have that information."

SOURCES:
${contextText}
    `.trim();

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userQuery }
    ];

    const reply = await getChatCompletion(messages);
    return reply;

  } catch (err) {
    console.error("❌ RAG processing failed:", err);
    throw new Error("Failed to complete RAG query.");
  }
}

module.exports = { performRagQuery };
