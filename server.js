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
const port = process.env.PORT || 3000;  // Use Azure-assigned port or fallback to 3000 for local dev


app.use(cors());
app.use(express.json());

app.use('/api/institutions', institutionRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/studentvue', studentVueRoutes);

let serviceStatus = { /* ... */ };
app.get('/api/health', (req, res) => res.json(serviceStatus));

const startServer = async () => {
  await connectDB();
  serviceStatus.cosmosDB = 'connected';
  await connectCache();
  // ... (rest of health check logic)

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
  
  console.log("-------------------------------------------\n");

  app.listen(PORT, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Backend server is running on http://localhost:${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/api/health`);
  });
};

startServer();