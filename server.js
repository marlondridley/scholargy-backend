// ✅ Best practice: Load environment variables at the very top.
require('dotenv').config();
// ✅ Add automatic error handling for all async routes.
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();

// --- Core Server Configuration ---

// 🚀 Enforce never binding to MSI's port 8081, default to 8080 for safety.
const PORT = process.env.PORT && process.env.PORT !== '8081'
  ? process.env.PORT
  : 8080;
console.log(`📢 Server starting on PORT=${PORT} (Azure override allowed)`);

// --- Security & Middleware Setup ---

// Apply rate limiting to all requests to prevent abuse.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Enable Cross-Origin Resource Sharing (CORS) for all routes.
app.use(cors());
// Parse JSON and URL-encoded request bodies with a 10mb limit.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Set security-related HTTP headers to protect against common attacks.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middleware to block suspicious user agents and path requests.
app.use((req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  const suspiciousUA = [/bot/i, /crawler/i, /spider/i, /scanner/i, /robots/i];
  const suspiciousPaths = [/robots\d+\.txt/i, /\.env/i, /wp-admin/i, /phpmyadmin/i, /admin/i];
  
  if (suspiciousUA.some(p => p.test(ua))) {
    console.log(`🚫 Blocked suspicious request from: ${ua}`);
    return res.status(403).json({ error: 'Access denied' });
  }
  if (suspiciousPaths.some(p => p.test(req.path))) {
    console.log(`🚫 Blocked suspicious path: ${req.path}`);
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// --- Static File Serving ---

// Determine the path to the frontend build directory based on the environment.
const frontendBuildPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'frontend', 'build');
console.log(`📁 Serving static files from: ${frontendBuildPath}`);
app.use(express.static(frontendBuildPath));

/**
 * 🚀 Main server startup function.
 * Initializes database connections, services, and routes before starting the server.
 */
const startServer = async () => {
  try {
    console.log('🔄 Initializing services...');
    // Validate that all required environment variables are set.
    const { validateEnvironment } = require('./utils/envValidation');
    validateEnvironment();

    // Establish connections to the database and cache.
    const { connectDB, getDB } = require('./db');
    const { connectCache, checkRedisHealth } = require('./cache');
    await connectDB();
    await connectCache();
    console.log('✅ Database and cache connected');

    // Initialize all application services.
    const scholarshipService = require('./services/scholarshipService');
    const careerService = require('./services/careerService');
    const userService = require('./services/userService');
    await scholarshipService.initialize();
    await careerService.initialize();
    await userService.initialize();
    console.log('✅ All services initialized');

    // --- API Routes ---
    app.use('/api/articles', require('./routes/articles'));
    app.use('/api/dashboard', require('./routes/dashboard'));
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
    app.use('/api/studentvue', require('./routes/StudentVue')); // Assuming this is correct
    console.log('✅ All API routes configured');

    // --- Health Check Endpoint ---
    app.get('/health', async (req, res) => {
      const redisHealth = await checkRedisHealth();
      const dbStatus = getDB() ? 'connected' : 'disconnected';
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: { database: dbStatus, redis: redisHealth.status, server: 'running' },
      });
    });

    // --- React Frontend Fallback ---
    // For any GET request that doesn't match an API route, serve the React app.
    app.get('*', (req, res) => {
      const indexPath = path.join(frontendBuildPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({ error: 'Frontend not found' });
      }
    });
    
    // --- Global Express Error Handler ---
    // This must be the LAST `app.use()` call. It catches all errors from the routes.
    app.use((err, req, res, next) => {
        console.error('❌ Express Error:', err.stack);
        const statusCode = err.statusCode || 500;
        const message = err.message || 'Internal Server Error';
        res.status(statusCode).json({
            status: 'error',
            statusCode,
            message,
        });
    });

    // --- Start Server ---
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is live on port ${PORT}`);
    });

    // --- Graceful Shutdown Logic ---
    const shutdown = (signal) => {
      console.log(`🛑 ${signal} received - shutting down gracefully...`);
      server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Fatal: Failed to start server:', error);
    process.exit(1);
  }
};

// --- Process-level Error Handlers ---
// Catch exceptions that occur outside of the Express request-response cycle.
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Start the server application.
startServer();
