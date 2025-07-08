/**
 * Enhanced Crypto Trading Bot - Main Server Entry Point
 * 
 * Features:
 * - Database integration
 * - Advanced error handling and logging
 * - Security enhancements
 * - Health monitoring
 * - Graceful shutdown
 * - Rate limiting
 * - Environment validation
 * 
 * @version 2.0.0
 * @author Crypto Trading Bot
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

// Import your existing modules
import { logger } from './utils/logger.js';
import { initDatabase, query } from './utils/database.js';
import { sendTelegramMessage } from './utils/telegram.js';
import { RiskManager } from './utils/risk-manager.js';
import { CustomError, ValidationError, TradingError } from './utils/errors.js';

// Import your main modules
import { setupTradingEngine } from './trading.js';
import { setupMLEngine } from './ml.js';
import { setupSignalGenerator } from './signals.js';
import { setupAPIRoutes } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

/**
 * Enhanced Crypto Trading Bot Server Class
 */
class CryptoTradingBotServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.services = new Map();
    this.isShuttingDown = false;
    this.cronJobs = [];
    this.startTime = Date.now();
    this.riskManager = null;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.setupMiddleware = this.setupMiddleware.bind(this);
    this.setupServices = this.setupServices.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);
    this.setupCronJobs = this.setupCronJobs.bind(this);
    this.startServer = this.startServer.bind(this);
    this.shutdown = this.shutdown.bind(this);
  }

  /**
   * Initialize the trading bot server
   */
  async initialize() {
    try {
      logger.info('🚀 Initializing Enhanced Crypto Trading Bot Server...');
      
      // Validate environment
      await this.validateEnvironment();
      
      // Initialize database
      await this.initializeDatabase();
      
      // Setup middleware
      await this.setupMiddleware();
      
      // Setup services
      await this.setupServices();
      
      // Setup routes
      await this.setupRoutes();
      
      // Setup cron jobs
      await this.setupCronJobs();
      
      // Start server
      await this.startServer();
      
      // Setup graceful shutdown
      await this.setupGracefulShutdown();
      
      logger.info('✅ Enhanced Trading Bot Server initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize server:', error);
      process.exit(1);
    }
  }

  /**
   * Validate environment variables
   */
  async validateEnvironment() {
    const requiredEnvVars = [
      'NODE_ENV',
      'PORT',
      'DB_HOST',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID'
    ];

    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new ValidationError(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('✅ Environment validation passed');
  }

  /**
   * Initialize database
   */
  async initializeDatabase() {
    try {
      await initDatabase();
      logger.info('✅ Database initialized successfully');
    } catch (error) {
      logger.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup middleware
   */
  async setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.RATE_LIMIT_MAX || 100,
      message: {
        error: 'Too many requests from this IP',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Compression
    this.app.use(compression());

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));

    // Request ID
    this.app.use((req, res, next) => {
      req.id = crypto.randomUUID();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    logger.info('✅ Middleware setup completed');
  }

  /**
   * Setup services
   */
  async setupServices() {
    try {
      // Initialize Risk Manager
      this.riskManager = new RiskManager({
        maxDailyLoss: process.env.MAX_DAILY_LOSS || 0.05,
        maxPositionSize: process.env.MAX_POSITION_SIZE || 0.1,
        stopLossPercentage: process.env.STOP_LOSS_PERCENTAGE || 0.02,
        maxOpenPositions: process.env.MAX_OPEN_POSITIONS || 5
      });

      // Setup Trading Engine
      const tradingEngine = await setupTradingEngine({
        riskManager: this.riskManager,
        logger
      });
      this.services.set('tradingEngine', tradingEngine);

      // Setup ML Engine
      const mlEngine = await setupMLEngine({
        logger
      });
      this.services.set('mlEngine', mlEngine);

      // Setup Signal Generator
      const signalGenerator = await setupSignalGenerator({
        mlEngine,
        logger
      });
      this.services.set('signalGenerator', signalGenerator);

      logger.info('✅ All services initialized successfully');
    } catch (error) {
      logger.error('❌ Error setting up services:', error);
      throw error;
    }
  }

  /**
   * Setup API routes
   */
  async setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const uptime = Date.now() - this.startTime;
      
      res.json({
        status: 'ok',
        uptime,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV,
        services: Array.from(this.services.keys())
      });
    });

    // API routes
    const apiRoutes = await setupAPIRoutes({
      services: this.services,
      riskManager: this.riskManager,
      logger
    });
    this.app.use('/api', apiRoutes);

    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Global error handler:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message,
          requestId: req.id
        });
      }
      
      if (error instanceof TradingError) {
        return res.status(422).json({
          error: 'Trading Error',
          message: error.message,
          requestId: req.id
        });
      }
      
      if (error instanceof CustomError) {
        return res.status(error.statusCode || 500).json({
          error: error.name,
          message: error.message,
          requestId: req.id
        });
      }
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Something went wrong',
        requestId: req.id
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.originalUrl
      });
    });

    logger.info('✅ Routes setup completed');
  }

  /**
   * Setup cron jobs for automated tasks
   */
  async setupCronJobs() {
    const tradingEngine = this.services.get('tradingEngine');
    const mlEngine = this.services.get('mlEngine');
    const signalGenerator = this.services.get('signalGenerator');

    // Market data collection (every 30 seconds)
    const marketDataJob = cron.schedule('*/30 * * * * *', async () => {
      try {
        await tradingEngine.collectMarketData();
      } catch (error) {
        logger.error('Market data collection error:', error);
      }
    }, { scheduled: false });

    // Signal generation (every 1 minute)
    const signalJob = cron.schedule('* * * * *', async () => {
      try {
        await signalGenerator.generateSignals();
      } catch (error) {
        logger.error('Signal generation error:', error);
      }
    }, { scheduled: false });

    // ML model training (every 4 hours)
    const mlTrainingJob = cron.schedule('0 */4 * * *', async () => {
      try {
        await mlEngine.trainModels();
      } catch (error) {
        logger.error('ML training error:', error);
      }
    }, { scheduled: false });

    // Risk assessment (every 5 minutes)
    const riskAssessmentJob = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.riskManager.assessRisk();
      } catch (error) {
        logger.error('Risk assessment error:', error);
      }
    }, { scheduled: false });

    // Health check and reporting (every 15 minutes)
    const healthCheckJob = cron.schedule('*/15 * * * *', async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health check error:', error);
      }
    }, { scheduled: false });

    this.cronJobs = [
      marketDataJob,
      signalJob,
      mlTrainingJob,
      riskAssessmentJob,
      healthCheckJob
    ];

    logger.info('✅ Cron jobs setup completed');
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      // Check database connection
      await query('SELECT 1');
      
      // Check services
      const serviceStatus = {};
      for (const [name, service] of this.services.entries()) {
        serviceStatus[name] = service.isHealthy ? service.isHealthy() : 'unknown';
      }
      
      const healthData = {
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        services: serviceStatus,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      };
      
      // Send health report to Telegram (optional)
      if (process.env.ENABLE_HEALTH_REPORTS === 'true') {
        await sendTelegramMessage(`🔍 Health Check Report:\n${JSON.stringify(healthData, null, 2)}`);
      }
      
      logger.info('✅ Health check completed successfully');
    } catch (error) {
      logger.error('❌ Health check failed:', error);
      await sendTelegramMessage(`⚠️ Health Check Failed: ${error.message}`);
    }
  }

  /**
   * Start the server
   */
  async startServer() {
    const port = process.env.PORT || 3001;
    const host = process.env.HOST || '0.0.0.0';

    this.server = this.app.listen(port, host, () => {
      logger.info(`🚀 Enhanced Trading Bot Server running on ${host}:${port}`);
      logger.info(`📊 Dashboard: http://${host}:5173`);
      logger.info(`🔗 API: http://${host}:${port}/api`);
      logger.info(`💚 Health: http://${host}:${port}/health`);
    });

    // Start cron jobs
    this.cronJobs.forEach(job => job.start());

    // Send startup notification
    await sendTelegramMessage(`🚀 Enhanced Trading Bot Server started successfully on ${host}:${port}`);

    logger.info('✅ Server started successfully');
  }

  /**
   * Setup graceful shutdown
   */
  async setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`📢 Received ${signal}, starting graceful shutdown...`);
        await this.shutdown();
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      sendTelegramMessage(`❌ Uncaught Exception: ${error.message}`);
      this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      sendTelegramMessage(`❌ Unhandled Rejection: ${reason}`);
      this.shutdown(1);
    });

    logger.info('✅ Graceful shutdown handlers setup completed');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(exitCode = 0) {
    if (this.isShuttingDown) {
      logger.warn('⚠️  Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    logger.info('🔄 Starting graceful shutdown...');

    try {
      // Stop cron jobs
      this.cronJobs.forEach(job => job.stop());
      logger.info('✅ Cron jobs stopped');

      // Stop services
      for (const [name, service] of this.services.entries()) {
        if (service.stop) {
          await service.stop();
          logger.info(`✅ ${name} service stopped`);
        }
      }

      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('✅ HTTP server closed');
      }

      // Send shutdown notification
      await sendTelegramMessage('⏹️ Enhanced Trading Bot Server shutdown completed');

      logger.info('✅ Graceful shutdown completed');
      process.exit(exitCode);

    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

/**
 * Start the enhanced trading bot
 */
async function startEnhancedTradingBot() {
  try {
    const bot = new CryptoTradingBotServer();
    await bot.initialize();
  } catch (error) {
    logger.error('❌ Fatal error starting trading bot:', error);
    process.exit(1);
  }
}

// Export for testing
export { CryptoTradingBotServer };

// Start the trading bot
if (import.meta.url === `file://${process.argv[1]}`) {
  startEnhancedTradingBot().catch((error) => {
    console.error('❌ Fatal error starting trading bot:', error);
    process.exit(1);
  });
}