// server.js - The main entry point for the Node.js backend.
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { connectDB } = require('./db');
const { connectCache } = require('./cache');
const institutionRoutes = require('./routes/institutions');
const articleRoutes = require('./routes/articles');
const profileRoutes = require('./routes/profile');
const ragRoutes = require('./routes/rag');
const studentVueRoutes = require('./routes/studentvue');

const OpenAI = require('openai');
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
const PORT = process.env.PORT || 8080;  // ✅ Fixed: Use PORT (uppercase) and 8080 for Azure

app.use(cors());
app.use(express.json());

// ✅ NEW: Serve React build files as static content
app.use(express.static(path.join(__dirname, 'build')));

// API Routes
app.use('/api/institutions', institutionRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/studentvue', studentVueRoutes);

let serviceStatus = { 
  cosmosDB: 'connecting...',
  redis: 'connecting...',
  openAI: 'connecting...',
  azureSearch: 'connecting...',
  blobStorage: 'connecting...'
};

app.get('/api/health', (req, res) => res.json(serviceStatus));

const startServer = async () => {
  try {
    await connectDB();
    serviceStatus.cosmosDB = 'connected';
    console.log('✅ CosmosDB: Connected.');
  } catch (error) {
    serviceStatus.cosmosDB = `error - ${error.message}`;
    console.error(`❌ CosmosDB: FAILED. ${error.message}`);
  }

  try {
    await connectCache();
    serviceStatus.redis = 'connected';
    console.log('✅ Redis Cache: Connected.');
  } catch (error) {
    serviceStatus.redis = `error - ${error.message}`;
    console.error(`❌ Redis Cache: FAILED. ${error.message}`);
  }

  try {
    const openaiClient = new OpenAI({
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai`,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      defaultQuery: { "api-version": "2023-05-15" },
      defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY },
    });
    await openaiClient.models.list();
    serviceStatus.openAI = 'connected';
    console.log('✅ Azure OpenAI: Connected.');
  } catch (error) {
    serviceStatus.openAI = `error - ${error.message}`;
    console.error(`❌ Azure OpenAI: FAILED. ${error.message}`);
  }

  // Test Azure Search if configured
  if (process.env.AZURE_SEARCH_ENDPOINT && process.env.AZURE_SEARCH_API_KEY) {
    try {
      const searchClient = new SearchClient(
        process.env.AZURE_SEARCH_ENDPOINT,
        "your-index-name", // Update with your actual index name
        new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
      );
      serviceStatus.azureSearch = 'connected';
      console.log('✅ Azure Search: Connected.');
    } catch (error) {
      serviceStatus.azureSearch = `error - ${error.message}`;
      console.error(`❌ Azure Search: FAILED. ${error.message}`);
    }
  }

  // ✅ NEW: Handle React Router (catch-all route for SPA)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
  
  console.log("-------------------------------------------\n");

  // ✅ Fixed: Use PORT variable and bind to all interfaces for Azure
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Backend server is running on http://0.0.0.0:${PORT}`);
    console.log(`Health check available at http://0.0.0.0:${PORT}/api/health`);
  });
};

startServer().catch(console.error);