// server.js - Clean, optimized entry point for Scholargy Backend

console.log('🚀 Starting Scholargy Backend Server...');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Platform:', process.platform);
console.log('Node version:', process.version);

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// ✅ Service status tracking
let serviceStatus = { 
  server: 'starting',
  cosmosDB: 'initializing',
  redis: 'initializing',
  openAI: 'initializing',
  azureSearch: 'initializing',
  timestamp: new Date().toISOString()
};

console.log('🔧 Configuring Express middleware...');

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://scholargy-dz3lcl3szkm74.azurewebsites.net']
    : ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Serve React build files
const buildPath = path.join(__dirname, 'build');
console.log('📁 Build path:', buildPath);

if (fs.existsSync(buildPath)) {
  console.log('✅ Serving static files from build directory');
  app.use(express.static(buildPath));
} else {
  console.log('⚠️ Build directory not found');
}

// ✅ Essential endpoints (available immediately)
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({
    status: 'ok',
    services: serviceStatus,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

app.get('/api/test', (req, res) => {
  console.log('🧪 Test endpoint accessed');
  res.json({ 
    message: 'Scholargy API is running!', 
    timestamp: new Date().toISOString(),
    port: PORT,
    status: 'healthy'
  });
});

// ✅ Load and setup routes (with error handling)
const setupRoutes = () => {
  try {
    console.log('🛣️ Loading API routes...');
    const probabilityRoutes = require('./routes/probability');
    const institutionRoutes = require('./routes/institutions');
    const articleRoutes = require('./routes/articles');
    const profileRoutes = require('./routes/profile');
    const ragRoutes = require('./routes/rag');
    const studentVueRoutes = require('./routes/StudentVue');

	app.use('/api/probability', probabilityRoutes);
    app.use('/api/institutions', institutionRoutes);
    app.use('/api/articles', articleRoutes);
    app.use('/api/profile', profileRoutes);
    app.use('/api/rag', ragRoutes);
    app.use('/api/studentvue', studentVueRoutes);
    
    console.log('✅ All API routes configured');
    return true;
  } catch (error) {
    console.error('❌ Error loading routes:', error.message);
    
    // Add fallback routes for essential functionality
    app.get('/api/institutions/*', (req, res) => {
      res.status(503).json({ error: 'Institution service temporarily unavailable' });
    });
    app.post('/api/rag/query', (req, res) => {
      res.status(503).json({ error: 'RAG service temporarily unavailable' });
    });
    app.post('/api/probability/*', (req, res) => {
    res.status(503).json({ error: 'Probability service temporarily unavailable' });
	});
	
    return false;
  }
};

// ✅ React Router catch-all (after API routes)
const setupFrontendRouting = () => {
  app.get('*', (req, res) => {
    console.log('🔄 Frontend request for:', req.path);
    
    const indexPath = path.join(__dirname, 'build', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send(`
        <h1>🚀 Scholargy Server</h1>
        <p><strong>Status:</strong> Running</p>
        <p><strong>API Health:</strong> <a href="/api/health">/api/health</a></p>
        <p><strong>API Test:</strong> <a href="/api/test">/api/test</a></p>
        <p><em>Frontend build not available</em></p>
      `);
    }
  });
};

// ✅ Start HTTP server immediately (fast startup)
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ HTTP Server started successfully!');
  console.log(`🌐 Listening on: http://0.0.0.0:${PORT}`);
  console.log(`🏥 Health: http://0.0.0.0:${PORT}/api/health`);
  serviceStatus.server = 'running';
});

// ✅ Setup routes after server starts
setupRoutes();
setupFrontendRouting();

// ✅ Initialize services asynchronously (non-blocking)
const initializeServices = async () => {
  console.log('🔄 Initializing background services...');

  // CosmosDB
  try {
    const { connectDB } = require('./db');
    await connectDB();
    serviceStatus.cosmosDB = 'connected';
    console.log('✅ CosmosDB: Connected');
  } catch (error) {
    serviceStatus.cosmosDB = `error: ${error.message}`;
    console.error('❌ CosmosDB failed:', error.message);
  }

  // Redis Cache
  try {
    const { connectCache } = require('./cache');
    await connectCache();
    serviceStatus.redis = 'connected';
    console.log('✅ Redis: Connected');
  } catch (error) {
    serviceStatus.redis = `error: ${error.message}`;
    console.error('❌ Redis failed:', error.message);
  }

  // Azure OpenAI
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      const openaiClient = new OpenAI({
        baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai`,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        defaultQuery: { "api-version": "2024-02-01" },
        defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY },
      });
      
      await openaiClient.models.list();
      serviceStatus.openAI = 'connected';
      console.log('✅ Azure OpenAI: Connected');
    } catch (error) {
      serviceStatus.openAI = `error: ${error.message}`;
      console.error('❌ Azure OpenAI failed:', error.message);
    }
  } else {
    serviceStatus.openAI = 'not configured';
  }

  // Azure Search
  if (process.env.AZURE_SEARCH_ENDPOINT && process.env.AZURE_SEARCH_API_KEY) {
    try {
      const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
      const searchClient = new SearchClient(
        process.env.AZURE_SEARCH_ENDPOINT,
        process.env.AZURE_SEARCH_INDEX_NAME || "scholargyindex",
        new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
      );
      serviceStatus.azureSearch = 'connected';
      console.log('✅ Azure Search: Connected');
    } catch (error) {
      serviceStatus.azureSearch = `error: ${error.message}`;
      console.error('❌ Azure Search failed:', error.message);
    }
  } else {
    serviceStatus.azureSearch = 'not configured';
  }

  console.log('🎯 Service initialization complete!');
  serviceStatus.timestamp = new Date().toISOString();
};

// ✅ Initialize services in background (doesn't block server startup)
initializeServices().catch(error => {
  console.error('❌ Service initialization error:', error);
});

// ✅ Error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  serviceStatus.server = `error: ${error.message}`;
  process.exit(1);
});

// ✅ Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`🛑 ${signal} received - shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ✅ Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

console.log('🎯 Scholargy server initialization complete!');
console.log('-------------------------------------------');