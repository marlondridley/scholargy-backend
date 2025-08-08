// backend/server.js
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// --- Middleware & Security Setup ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic rate limiting to prevent abuse
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// --- Static File Serving ---
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendBuildPath));

// --- Main Server Startup Logic ---
const startServer = async () => {
  try {
    // Corrected: Define PORT inside the async function to ensure it's in scope.
    const PORT = process.env.PORT || 8080;

    console.log('🔄 Initializing services...');
    
    // Step 1: Connect to essential databases before loading routes
    const { connectDB } = require('./db');
    const { connectCache } = require('./cache');
    await connectDB();
    await connectCache();
    console.log('✅ Database and cache connected successfully.');

    // Step 2: Initialize services that depend on the database connection
    const scholarshipService = require('./services/scholarshipService');
    const careerService = require('./services/careerService');
    const userService = require('./services/userService');
    // Ensure services have an initialize method if they need async setup
    if (scholarshipService.initialize) await scholarshipService.initialize();
    if (careerService.initialize) await careerService.initialize();
    if (userService.initialize) await userService.initialize();
    console.log('✅ All services initialized.');

    // Step 3: Load API routes now that services are ready
    console.log('🛣️  Loading API routes...');
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
    app.use(require('./routes/StudentVue')); // Non-API route
    console.log('✅ All API routes configured.');

    // --- Frontend Catch-all ---
    app.get('*', (req, res) => {
        const indexPath = path.join(frontendBuildPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).json({ 
                error: "Frontend not found.",
                message: "Please ensure the frontend application has been built."
            });
        }
    });

    // --- Centralized Error Handler ---
    app.use((err, req, res, next) => {
        console.error('❌ Express Route Error:', err.stack || err);
        res.status(500).json({ error: 'Internal server error' });
    });

    // Start the server
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server is live and listening on port ${PORT}`);
    });

    // --- Graceful Shutdown ---
    const gracefulShutdown = (signal) => {
        console.log(`🛑 ${signal} received - shutting down gracefully...`);
        server.close(() => {
            console.log('✅ Server closed successfully.');
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Fatal: Failed to start server:', error);
    process.exit(1);
  }
};

// --- Global Unhandled Error Catchers ---
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// --- Start the Application ---
startServer();