// backend/services/aiService.js
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openaiApiKey = process.env.AZURE_OPENAI_API_KEY;
const gpt4oDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const embeddingDeploymentName = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME;

let openaiClient;

if (openaiEndpoint && openaiApiKey) {
  // Create separate clients for chat and embeddings with proper deployment endpoints
  const chatClient = new OpenAIClient(
    `${openaiEndpoint}/openai/deployments/${gpt4oDeploymentName}`,
    new AzureKeyCredential(openaiApiKey)
  );
  const embeddingClient = new OpenAIClient(
    `${openaiEndpoint}/openai/deployments/${embeddingDeploymentName}`,
    new AzureKeyCredential(openaiApiKey)
  );
  
  // Store both clients
  openaiClient = {
    chat: chatClient,
    embedding: embeddingClient
  };
  
  console.log('✅ Azure OpenAI Service Initialized.');
} else {
  console.warn('⚠️ Azure OpenAI environment variables not configured. AI features will be disabled.');
}

async function generateEmbedding(text) {
  if (!openaiClient?.embedding) throw new Error("OpenAI embedding client is not initialized.");
  try {
    const response = await openaiClient.embedding.getEmbeddings([text]);
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error("Failed to generate text embedding.");
  }
}

async function getChatCompletion(messages) {
    if (!openaiClient?.chat) throw new Error("OpenAI chat client is not initialized.");
    try {
        const response = await openaiClient.chat.getChatCompletions(messages, {
            maxTokens: 800,
            temperature: 0.7,
        });
        if (response.choices?.length > 0) {
            return response.choices[0].message.content;
        }
        throw new Error("No response from OpenAI model.");
    } catch (error) {
        console.error("Error getting chat completion:", error);
        throw new Error("Failed to get chat completion.");
    }
}

module.exports = { generateEmbedding, getChatCompletion };
