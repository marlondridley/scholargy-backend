console.log('Node.js version:', process.version);
console.log('ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT || 8080);
console.log('COSMOS_DB_CONNECTION_STRING:', process.env.COSMOS_DB_CONNECTION_STRING);
console.log('AZURE_REDIS_CONNECTION_STRING:', process.env.AZURE_REDIS_CONNECTION_STRING);
console.log('DB_NAME:', process.env.DB_NAME);

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server started on port ${PORT}`);
});

const express = require('express');
const path = require('path');
const app = express();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Static Frontend ---
const frontendPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendPath));

// --- Basic Health Route ---
app.get('/health', (_, res) => res.send('✅ Server is running'));

// --- Routes ---
try {
  console.log('🛣️  Loading routes...');
  app.use('/api/articles', require('./routes/articles'));
  app.use('/api/institutions', require('./routes/institutions'));
  app.use('/api/probability', require('./routes/probability'));
  app.use('/api/rag', require('./routes/rag'));
  app.use('/api/scholarships', require('./routes/scholarships'));
  app.use('/api/profile', require('./routes/profile'));
  app.use('/api/search', require('./routes/search'));
  app.use('/api/matching', require('./routes/matching'));
  app.use('/api/user', require('./routes/user'));
  app.use('/api/report', require('./routes/report'));
  app.use('/api/forecaster', require('./routes/forecaster'));
  app.use(require('./routes/StudentVue')); // No /api/ prefix
  console.log('✅ All routes loaded');
} catch (err) {
  console.error('❌ Route loading failed:', err);
}

// --- Catch-All to Frontend ---
app.get('*', (_, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- Start Server ---
const startServer = () => {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
  });
};

startServer();
