// backend/services/ragService.js
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const { getChatCompletion } = require('./aiService');

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME;

let searchClient;
if (searchEndpoint && searchApiKey && searchIndexName) {
  searchClient = new SearchClient(searchEndpoint, searchIndexName, new AzureKeyCredential(searchApiKey));
} else {
  console.warn('Azure AI Search not configured.');
}

async function performRagQuery(userQuery, history = []) {
  if (!searchClient) {
    throw new Error("RAG service is not configured.");
  }
  try {
    const searchResults = await searchClient.search(userQuery, { top: 3 });
    let contextText = "";
    for await (const result of searchResults.results) {
      contextText += result.document.content + "\n---\n";
    }
    const systemPrompt = `You are "Scholargy AI," a helpful assistant. Answer based only on the provided "SOURCES". If the answer is not in the sources, say you don't have the information. SOURCES: ${contextText || "No sources found."}`;
    const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: userQuery }];
    return await getChatCompletion(messages);
  } catch (error) {
    console.error("Error in RAG service:", error);
    throw new Error("Failed to get an answer from Scholargy AI.");
  }
}

module.exports = { performRagQuery };
