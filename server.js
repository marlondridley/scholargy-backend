// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import environment validation
const { validateEnvironment } = require('./utils/envValidation');

const app = express();
const PORT = process.env.PORT || 8080;

// --- Middleware Setup ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Static File Serving ---
// Serve the built React application from a single, reliable location.
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendBuildPath));

// --- API Route Setup ---
const setupRoutes = () => {
    console.log('🛣️  Loading all API routes...');
    app.use('/api/articles', require('./routes/articles'));
    app.use('/api/institutions', require('./routes/institutions'));
    app.use('/api/probability', require('./routes/probability'));
    app.use('/api/rag', require('./routes/rag'));
    app.use('/api/scholarships', require('./routes/scholarships'));
    app.use('/api/studentvue', require('./routes/StudentVue'));
    app.use('/api/profile', require('./routes/profile'));
    app.use('/api/search', require('./routes/search'));
    app.use('/api/matching', require('./routes/matching'));
    app.use('/api/user', require('./routes/user'));
    app.use('/api/report', require('./routes/report'));
    app.use('/api/forecaster', require('./routes/forecaster'));
    console.log('✅ All API routes configured.');
};

setupRoutes();

// --- Frontend Catch-all ---
// This ensures that any request not matched by an API route is sent the React app.
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

// --- Server Startup Logic ---
const startServer = async () => {
    try {
        console.log('🔄 Validating environment...');
        validateEnvironment();
        
        console.log('🔄 Initializing services...');
        const { connectDB } = require('./db');
        const { connectCache } = require('./cache');

        // Connect to essential services *before* starting the server.
        await connectDB();
        await connectCache();
        console.log('✅ All services connected successfully.');

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
        console.error('❌ Fatal: Failed to start server or connect to services:', error);
        process.exit(1);
    }
};

// --- Global Error Handlers ---
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// --- Start the Application ---
startServer();
