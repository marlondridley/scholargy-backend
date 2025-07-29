// server.js - The main entry point for the Node.js backend.

// 🚀 Debug logging at startup
console.log('🚀 Starting Scholargy Backend Server...');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Current directory:', __dirname);
console.log('Platform:', process.platform);
console.log('Node version:', process.version);

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Check if required modules exist
try {
  const { connectDB } = require('./db');
  const { connectCache } = require('./cache');
  const institutionRoutes = require('./routes/institutions');
  const articleRoutes = require('./routes/articles');
  const profileRoutes = require('./routes/profile');
  const ragRoutes = require('./routes/rag');
  const studentVueRoutes = require('./routes/studentvue');
  console.log('✅ All route modules loaded successfully');
} catch (error) {
  console.error('❌ Error loading route modules:', error.message);
  console.error('Available files in current directory:', require('fs').readdirSync(__dirname));
  // Continue without routes for basic server functionality
}

const OpenAI = require('openai');
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
const PORT = process.env.PORT || 8080;  // ✅ Fixed: Consistent PORT variable

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

// ✅ Serve React build files as static content
const buildPath = path.join(__dirname, 'build');
console.log('📁 Static build path:', buildPath);

// Check if build directory exists
const fs = require('fs');
if (fs.existsSync(buildPath)) {
  console.log('✅ Build directory found, serving static files');
  app.use(express.static(buildPath));
  
  // List build contents for debugging
  try {
    const buildContents = fs.readdirSync(buildPath);
    console.log('📦 Build directory contents:', buildContents);
  } catch (error) {
    console.error('❌ Error reading build directory:', error.message);
  }
} else {
  console.log('⚠️  Build directory not found at:', buildPath);
  console.log('📂 Current directory contents:', fs.readdirSync(__dirname));
}

// Health check endpoint (available immediately)
let serviceStatus = { 
  server: 'starting',
  cosmosDB: 'connecting...',
  redis: 'connecting...',
  openAI: 'connecting...',
  azureSearch: 'connecting...',
  blobStorage: 'connecting...',
  timestamp: new Date().toISOString()
};

app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({
    ...serviceStatus,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: {
      node_env: process.env.NODE_ENV,
      port: PORT,
      has_openai_endpoint: !!process.env.AZURE_OPENAI_ENDPOINT,
      has_openai_key: !!process.env.AZURE_OPENAI_API_KEY
    }
  });
});

// Basic test endpoint
app.get('/api/test', (req, res) => {
  console.log('🧪 Test endpoint requested');
  res.json({ 
    message: 'Scholargy API is running!', 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// Load routes with error handling
try {
  const { connectDB } = require('./db');
  const { connectCache } = require('./cache');
  const institutionRoutes = require('./routes/institutions');
  const articleRoutes = require('./routes/articles');
  const profileRoutes = require('./routes/profile');
  const ragRoutes = require('./routes/rag');
  const studentVueRoutes = require('./routes/studentvue');

  console.log('🛣️  Setting up API routes...');
  app.use('/api/institutions', institutionRoutes);
  app.use('/api/articles', articleRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/rag', ragRoutes);
  app.use('/api/studentvue', studentVueRoutes);
  console.log('✅ All API routes configured');
} catch (error) {
  console.error('❌ Error setting up routes:', error.message);
  console.log('⚠️  Server will continue without custom routes');
}

const startServer = async () => {
  console.log('🔄 Starting service connections...');
  
  // Database connection with error handling
  try {
    const { connectDB } = require('./db');
    await connectDB();
    serviceStatus.cosmosDB = 'connected';
    console.log('✅ CosmosDB: Connected');
  } catch (error) {
    serviceStatus.cosmosDB = `error - ${error.message}`;
    console.error('❌ CosmosDB: FAILED -', error.message);
    // Don't exit - continue without database
  }

  // Redis cache connection with error handling
  try {
    const { connectCache } = require('./cache');
    await connectCache();
    serviceStatus.redis = 'connected';
    console.log('✅ Redis Cache: Connected');
  } catch (error) {
    serviceStatus.redis = `error - ${error.message}`;
    console.error('❌ Redis Cache: FAILED -', error.message);
    // Don't exit - continue without cache
  }

  // Azure OpenAI connection with error handling
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    try {
      const openaiClient = new OpenAI({
        baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai`,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        defaultQuery: { "api-version": "2023-05-15" },
        defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY },
      });
      
      // Test the connection
      await openaiClient.models.list();
      serviceStatus.openAI = 'connected';
      console.log('✅ Azure OpenAI: Connected');
    } catch (error) {
      serviceStatus.openAI = `error - ${error.message}`;
      console.error('❌ Azure OpenAI: FAILED -', error.message);
    }
  } else {
    serviceStatus.openAI = 'not configured';
    console.log('⚠️  Azure OpenAI: Environment variables not set');
  }

  // Azure Search connection (optional)
  if (process.env.AZURE_SEARCH_ENDPOINT && process.env.AZURE_SEARCH_API_KEY) {
    try {
      const searchClient = new SearchClient(
        process.env.AZURE_SEARCH_ENDPOINT,
        process.env.AZURE_SEARCH_INDEX_NAME || "default-index",
        new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
      );
      serviceStatus.azureSearch = 'connected';
      console.log('✅ Azure Search: Connected');
    } catch (error) {
      serviceStatus.azureSearch = `error - ${error.message}`;
      console.error('❌ Azure Search: FAILED -', error.message);
    }
  } else {
    serviceStatus.azureSearch = 'not configured';
    console.log('⚠️  Azure Search: Not configured');
  }

  // ✅ React Router catch-all (must be AFTER API routes)
  app.get('*', (req, res) => {
    console.log('🔄 Serving React app for:', req.path);
    
    const indexPath = path.join(__dirname, 'build', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.error('❌ index.html not found at:', indexPath);
      res.status(404).send(`
        <h1>Scholargy Server Running</h1>
        <p>Frontend build not found</p>
        <p>API available at: <a href="/api/health">/api/health</a></p>
        <p>Build path: ${indexPath}</p>
      `);
    }
  });
  
  serviceStatus.server = 'ready';
  console.log("-------------------------------------------");
  console.log('🚀 Starting HTTP server...');

  // ✅ Start server with comprehensive error handling
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server successfully started!`);
    console.log(`🌐 Server listening on: http://0.0.0.0:${PORT}`);
    console.log(`🏥 Health check: http://0.0.0.0:${PORT}/api/health`);
    console.log(`🧪 Test endpoint: http://0.0.0.0:${PORT}/api/test`);
    console.log("-------------------------------------------");
    serviceStatus.server = 'running';
  });

  // Handle server errors
  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use`);
    }
    serviceStatus.server = `error - ${error.message}`;
    process.exit(1);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
};

// ✅ Start server with error handling
startServer().catch((error) => {
  console.error('❌ Critical server startup error:', error);
  console.error('Stack trace:', error.stack);
  serviceStatus.server = `startup failed - ${error.message}`;
  
  // Still try to start a basic server for debugging
  console.log('🆘 Starting emergency server for debugging...');
  app.get('*', (req, res) => {
    res.status(500).json({
      error: 'Server startup failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  });
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🆘 Emergency server running on port ${PORT}`);
  });
});

// Alternative simple error handling (as backup)
// startServer().catch(console.error);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Stack trace:', reason.stack);
  process.exit(1);
});