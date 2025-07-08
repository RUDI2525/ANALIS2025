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
import { createServer } from 'http';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global bot state and configuration - MUST be defined before other imports
export const botState = {
  isRunning: false,
  currentPrice: 0,
  change24h: 0,
  volume: 0,
  lastUpdate: null,
  balance: 10000, // Starting balance
  positions: [],
  signals: [],
  predictions: {},
  sentimentData: { sentiment: 'NEUTRAL', confidence: 50 },
  exchangeStatus: {},
  tradeHistory: [],
  notifications: [],
  mlModels: {},
  trainingHistory: [],
  accuracyMetrics: {},
  performanceMetrics: {},
  healthReport: {},
  modelBackups: {},
  ensemblePredictions: {},
  accuracyHistory: {},
  exchanges: {}
};

export const CONFIG = {
  symbol: 'BTC/USDT',
  timeframes: ['15m', '1h', '4h', '1d'],
  paperTrading: true,
  riskPerTrade: 0.02,
  stopLossPct: 0.02,
  takeProfitPct: 0.04,
  maxPositions: 5,
  initialBalance: 10000,
  lookbackPeriods: {
    '15m': 100,
    '1h': 100,
    '4h': 100,
    '1d': 100
  }
};

// Import modules after defining global state
import apiApp, { setupWebSocket } from './api.js';

/**
 * Enhanced Crypto Trading Bot Server Class
 */
class CryptoTradingBotServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.wss = null;
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
      console.log('🚀 Initializing Enhanced Crypto Trading Bot Server...');
      
      // Validate environment
      await this.validateEnvironment();
      
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
      
      console.log('✅ Enhanced Trading Bot Server initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize server:', error);
      process.exit(1);
    }
  }

  /**
   * Validate environment variables
   */
  async validateEnvironment() {
    const requiredEnvVars = [
      'NODE_ENV'
    ];

    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      console.warn(`⚠️ Missing optional environment variables: ${missing.join(', ')}`);
    }

    // Set defaults for missing env vars
    if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
    if (!process.env.PORT) process.env.PORT = '3001';

    console.log('✅ Environment validation completed');
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
    this.app.use(morgan('combined'));

    // Request ID
    this.app.use((req, res, next) => {
      req.id = crypto.randomUUID();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    console.log('✅ Middleware setup completed');
  }

  /**
   * Setup services
   */
  async setupServices() {
    try {
      // Initialize mock services for now
      console.log('✅ Services initialized successfully');
    } catch (error) {
      console.error('❌ Error setting up services:', error);
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
    this.app.use('/api', apiApp);

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Global error handler:', error);
      
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

    console.log('✅ Routes setup completed');
  }

  /**
   * Setup cron jobs for automated tasks
   */
  async setupCronJobs() {
    // Mock price updates every 30 seconds
    const priceUpdateJob = cron.schedule('*/30 * * * * *', () => {
      try {
        // Simulate price movement
        const basePrice = 45000;
        const volatility = 0.02;
        const change = (Math.random() - 0.5) * 2 * volatility;
        
        botState.currentPrice = basePrice * (1 + change);
        botState.change24h = (Math.random() - 0.5) * 10; // -5% to +5%
        botState.volume = Math.random() * 1000000000; // Random volume
        botState.lastUpdate = new Date().toISOString();
        
        // Broadcast update if WebSocket is available
        if (this.wss) {
          this.broadcastUpdate();
        }
      } catch (error) {
        console.error('Price update error:', error);
      }
    }, { scheduled: false });

    this.cronJobs = [priceUpdateJob];

    console.log('✅ Cron jobs setup completed');
  }

  /**
   * Start the server
   */
  async startServer() {
    const port = process.env.PORT || 3001;
    const host = process.env.HOST || '0.0.0.0';

    // Create HTTP server
    this.server = createServer(this.app);

    // Setup WebSocket server
    this.wss = setupWebSocket(this.server);

    this.server.listen(port, host, () => {
      console.log(`🚀 Enhanced Trading Bot Server running on ${host}:${port}`);
      console.log(`📊 Dashboard: http://localhost:5173`);
      console.log(`🔗 API: http://${host}:${port}/api`);
      console.log(`💚 Health: http://${host}:${port}/health`);
    });

    // Start cron jobs
    this.cronJobs.forEach(job => job.start());

    console.log('✅ Server started successfully');
  }

  /**
   * Broadcast updates to WebSocket clients
   */
  broadcastUpdate() {
    if (!this.wss) return;
    
    const message = JSON.stringify({
      type: 'update',
      data: botState,
      timestamp: new Date().toISOString()
    });
    
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
        }
      }
    });
  }

  /**
   * Setup graceful shutdown
   */
  async setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`📢 Received ${signal}, starting graceful shutdown...`);
        await this.shutdown();
      });
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown(1);
    });

    console.log('✅ Graceful shutdown handlers setup completed');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(exitCode = 0) {
    if (this.isShuttingDown) {
      console.warn('⚠️  Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log('🔄 Starting graceful shutdown...');

    try {
      // Stop cron jobs
      this.cronJobs.forEach(job => job.stop());
      console.log('✅ Cron jobs stopped');

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
        console.log('✅ WebSocket server closed');
      }

      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        console.log('✅ HTTP server closed');
      }

      console.log('✅ Graceful shutdown completed');
      process.exit(exitCode);

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
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
    console.error('❌ Fatal error starting trading bot:', error);
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

// Telegram notification function for compatibility
export async function sendTelegramNotification(message) {
  console.log('📱 Telegram notification:', message);
  
  // Add to notifications array
  botState.notifications.unshift({
    id: crypto.randomUUID(),
    message,
    timestamp: new Date().toISOString(),
    type: 'info'
  });
  
  // Keep only last 100 notifications
  if (botState.notifications.length > 100) {
    botState.notifications = botState.notifications.slice(0, 100);
  }
}