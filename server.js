// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendBuildPath));

// Initialize services and routes AFTER database connection
const startServer = async () => {
    try {
        console.log('🔄 Initializing services...');
        
        // Connect to database FIRST
        const { connectDB } = require('./db');
        const { connectCache } = require('./cache');
        
        await connectDB();
        await connectCache();
        
        console.log('✅ Database and cache connected');
        
        // Initialize services AFTER database is connected
        const scholarshipService = require('./services/scholarshipService');
        await scholarshipService.initialize();
        
        // Setup routes AFTER services are initialized
        console.log('🛣️ Loading API routes...');
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
        console.log('✅ All API routes configured');
        
        // React catch-all - MUST be after API routes
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
        
        // Start server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server is live on port ${PORT}`);
        });
        
        // Graceful shutdown
        const gracefulShutdown = (signal) => {
            console.log(`🛑 ${signal} received - shutting down gracefully...`);
            server.close(() => {
                console.log('✅ Server closed successfully');
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

// Error handlers
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
    process.exit(1);
});

// Start the application
startServer();