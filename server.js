// ✅ Refactored server startup to ensure DB connection is ready before loading services/routes
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Security middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Bot protection
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const suspiciousPatterns = [/bot/i, /crawler/i, /spider/i, /scanner/i, /robots/i];

  if (suspiciousPatterns.some((pattern) => pattern.test(userAgent))) {
    console.log(`🚫 Blocked suspicious request from: ${userAgent}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  const suspiciousPaths = [/robots\d+\.txt/i, /\.env/i, /wp-admin/i, /phpmyadmin/i, /admin/i];

  if (suspiciousPaths.some((pattern) => pattern.test(req.path))) {
    console.log(`🚫 Blocked suspicious path: ${req.path}`);
    return res.status(404).json({ error: 'Not found' });
  }

  next();
});

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendBuildPath));

const startServer = async () => {
  const PORT = process.env.PORT || 8080;

  try {
    console.log('🔄 Initializing services...');

    const { validateEnvironment } = require('./utils/envValidation');
    validateEnvironment();

    const { connectDB, getDB } = require('./db');
    const { connectCache, checkRedisHealth } = require('./cache');

    const db = await connectDB();
    await connectCache();

    if (!db) {
      console.warn('⚠️ Database connection failed, but continuing with mock data...');
    } else {
      console.log('✅ Database and cache connected');
    }

    const scholarshipService = require('./services/scholarshipService');
    const careerService = require('./services/careerService');
    const userService = require('./services/userService');

    await scholarshipService.initialize();
    await careerService.initialize();
    await userService.initialize();

    console.log('✅ All services initialized');

    console.log('🛣️ Loading API routes...');
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

    // StudentVue routes without /api prefix
    const studentVueRoutes = require('./routes/StudentVue');
    app.use(studentVueRoutes);

    console.log('✅ All API routes configured');

    app.get('/health', async (req, res) => {
      try {
        const redisHealth = await checkRedisHealth();
        const dbStatus = getDB() ? 'connected' : 'disconnected';

        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: dbStatus,
            redis: redisHealth.status,
            server: 'running',
          },
          redis: redisHealth,
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Fallback route
    app.get('*', (req, res) => {
      const indexPath = path.join(frontendBuildPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({
          error: 'Frontend not found.',
          message: 'Please ensure the frontend application has been built.',
        });
      }
    });

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is live on port ${PORT}`);
    });

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

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

startServer();
