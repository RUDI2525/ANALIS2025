/**
 * Professional Real-time Crypto Trading Bot
 * 
 * Features:
 * - Real-time market data streaming
 * - Advanced ML predictions with multiple models
 * - Professional signal generation
 * - Automated trading with risk management
 * - Database persistence
 * - WebSocket real-time updates
 * - Microservices architecture
 * 
 * @version 2.0.0
 * @author Professional Trading Bot
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cron from 'node-cron';

// Load environment variables
dotenv.config();

// Import database
import { initializeDatabase, testConnection } from './config/database.js';

// Import services
import ExchangeService from './services/ExchangeService.js';
import MarketDataService from './services/MarketDataService.js';
import MLService from './services/MLService.js';
import SignalService from './services/SignalService.js';
import TradingService from './services/TradingService.js';

// Import models
import { Trade, Position, MarketData, Signal, Prediction } from './models/index.js';

class ProfessionalTradingBot {
  constructor() {
    this.app = express();
    this.server = null;
    this.io = null;
    this.services = {};
    this.isRunning = false;
    this.cronJobs = [];
    this.startTime = Date.now();
    
    // Bot state for real-time updates
    this.botState = {
      isRunning: false,
      currentPrice: 0,
      change24h: 0,
      volume: 0,
      lastUpdate: null,
      balance: 10000,
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
      performanceMetrics: {}
    };
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Professional Trading Bot...');
      
      // Test database connection
      const dbConnected = await testConnection();
      if (!dbConnected) {
        throw new Error('Database connection failed');
      }
      
      // Initialize database
      await initializeDatabase();
      
      // Setup Express app
      await this.setupExpress();
      
      // Initialize services
      await this.initializeServices();
      
      // Setup API routes
      this.setupAPIRoutes();
      
      // Setup WebSocket
      this.setupWebSocket();
      
      // Setup cron jobs
      this.setupCronJobs();
      
      // Start server
      await this.startServer();
      
      console.log('✅ Professional Trading Bot initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize trading bot:', error);
      process.exit(1);
    }
  }

  async setupExpress() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: 'Too many requests' }
    });
    this.app.use('/api/', limiter);

    // Middleware
    this.app.use(compression());
    this.app.use(cors({
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    console.log('✅ Express middleware setup completed');
  }

  async initializeServices() {
    try {
      console.log('🔄 Initializing services...');
      
      // Initialize Exchange Service
      this.services.exchange = new ExchangeService();
      await this.services.exchange.initialize();
      
      // Initialize Market Data Service
      this.services.marketData = new MarketDataService(this.services.exchange);
      await this.services.marketData.initialize();
      
      // Initialize ML Service
      this.services.ml = new MLService(this.services.marketData);
      await this.services.ml.initialize();
      
      // Initialize Signal Service
      this.services.signal = new SignalService(this.services.marketData, this.services.ml);
      await this.services.signal.initialize();
      
      // Initialize Trading Service
      this.services.trading = new TradingService(this.services.exchange, this.services.marketData);
      await this.services.trading.initialize();
      
      // Setup service event listeners
      this.setupServiceEventListeners();
      
      console.log('✅ All services initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing services:', error);
      throw error;
    }
  }

  setupServiceEventListeners() {
    // Market data events
    this.services.marketData.on('priceUpdate', (data) => {
      this.botState.currentPrice = data.price;
      this.botState.change24h = data.percentage || 0;
      this.botState.volume = data.volume || 0;
      this.botState.lastUpdate = new Date().toISOString();
      this.broadcastUpdate('priceUpdate', data);
    });

    // Signal events
    this.services.signal.on('signalsGenerated', (signals) => {
      this.botState.signals = signals;
      this.broadcastUpdate('signalsUpdate', signals);
      
      // Auto-execute high-confidence signals if trading is enabled
      if (this.isRunning) {
        this.executeHighConfidenceSignals(signals);
      }
    });

    // Trading events
    this.services.trading.on('tradeExecuted', (trade) => {
      this.botState.tradeHistory.unshift(trade);
      if (this.botState.tradeHistory.length > 100) {
        this.botState.tradeHistory = this.botState.tradeHistory.slice(0, 100);
      }
      this.broadcastUpdate('tradeExecuted', trade);
    });

    this.services.trading.on('positionUpdate', (position) => {
      this.updatePositionInState(position);
      this.broadcastUpdate('positionUpdate', position);
    });

    this.services.trading.on('positionClosed', (position) => {
      this.removePositionFromState(position.positionId);
      this.broadcastUpdate('positionClosed', position);
    });

    // ML events
    this.services.ml.on('modelTrained', (model) => {
      this.botState.mlModels[model.modelKey] = model;
      this.broadcastUpdate('modelTrained', model);
    });
  }

  async executeHighConfidenceSignals(signals) {
    const highConfidenceSignals = signals.filter(s => 
      s.confidence >= 80 && s.strength >= 85
    );

    for (const signal of highConfidenceSignals) {
      try {
        await this.services.trading.executeSignal(signal, signal.symbol, signal.confidence);
      } catch (error) {
        console.error(`❌ Error executing signal ${signal.id}:`, error);
      }
    }
  }

  updatePositionInState(positionUpdate) {
    const index = this.botState.positions.findIndex(p => p.id === positionUpdate.positionId);
    if (index !== -1) {
      this.botState.positions[index] = {
        ...this.botState.positions[index],
        currentPrice: positionUpdate.newPrice,
        unrealizedPnL: positionUpdate.unrealizedPnL
      };
    }
  }

  removePositionFromState(positionId) {
    this.botState.positions = this.botState.positions.filter(p => p.id !== positionId);
  }

  setupAPIRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        uptime: Date.now() - this.startTime,
        timestamp: new Date().toISOString(),
        services: Object.keys(this.services),
        version: '2.0.0'
      });
    });

    // Dashboard data
    this.app.get('/api/dashboard', async (req, res) => {
      try {
        const portfolio = await this.services.trading.getPortfolioSummary();
        const exchangeStatus = this.services.exchange.getExchangeStatus();
        const recentTrades = await this.services.trading.getTradeHistory(10);
        
        res.json({
          status: {
            isRunning: this.isRunning,
            currentPrice: this.botState.currentPrice,
            change24h: this.botState.change24h,
            volume: this.botState.volume,
            lastUpdate: this.botState.lastUpdate
          },
          portfolio,
          signals: this.botState.signals.slice(0, 10),
          predictions: this.botState.predictions,
          sentiment: this.botState.sentimentData,
          exchanges: exchangeStatus,
          recentTrades
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Bot control
    this.app.post('/api/bot/start', async (req, res) => {
      try {
        await this.startBot();
        res.json({ success: true, isRunning: this.isRunning });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/bot/stop', async (req, res) => {
      try {
        await this.stopBot();
        res.json({ success: true, isRunning: this.isRunning });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/bot/toggle', async (req, res) => {
      try {
        if (this.isRunning) {
          await this.stopBot();
        } else {
          await this.startBot();
        }
        res.json({ success: true, isRunning: this.isRunning });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Trading endpoints
    this.app.post('/api/trade', async (req, res) => {
      try {
        const { signal, size, exchange } = req.body;
        
        // Create mock signal for manual trading
        const mockSignal = {
          id: `manual_${Date.now()}`,
          signal_type: signal,
          confidence: 75,
          strength: 70
        };
        
        const result = await this.services.trading.executeSignal(
          mockSignal, 
          'BTC/USDT', 
          75, 
          { manual: true, size, exchange }
        );
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ML endpoints
    this.app.post('/api/ml/train', async (req, res) => {
      try {
        const { symbol, timeframe, modelType } = req.body;
        const result = await this.services.ml.trainModel(
          symbol || 'BTC/USDT',
          timeframe || '1h',
          modelType || 'lstm'
        );
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/ml/predict', async (req, res) => {
      try {
        const { symbol, timeframe, modelType } = req.body;
        const prediction = await this.services.ml.generatePrediction(
          symbol || 'BTC/USDT',
          timeframe || '1h',
          modelType || 'lstm'
        );
        
        this.botState.predictions[`${symbol}_${timeframe}`] = prediction;
        res.json({ success: true, prediction });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Signal endpoints
    this.app.post('/api/signals/generate', async (req, res) => {
      try {
        const { symbols } = req.body;
        const signals = await this.services.signal.generateSignals(symbols);
        res.json({ success: true, signals });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/signals', async (req, res) => {
      try {
        const { symbol, timeframe } = req.query;
        const signals = await this.services.signal.getActiveSignals(symbol, timeframe);
        res.json(signals);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Data endpoints
    this.app.get('/api/historical/:symbol/:timeframe', async (req, res) => {
      try {
        const { symbol, timeframe } = req.params;
        const { limit } = req.query;
        const data = await this.services.marketData.getHistoricalData(
          symbol,
          timeframe,
          parseInt(limit) || 100
        );
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/positions', async (req, res) => {
      try {
        const portfolio = await this.services.trading.getPortfolioSummary();
        res.json(portfolio.positions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/trades', async (req, res) => {
      try {
        const { limit } = req.query;
        const trades = await this.services.trading.getTradeHistory(parseInt(limit) || 50);
        res.json(trades);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Settings endpoints
    this.app.post('/api/settings', (req, res) => {
      try {
        const { riskLimits } = req.body;
        if (riskLimits) {
          this.services.trading.setRiskLimits(riskLimits);
        }
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Test notification
    this.app.post('/api/telegram/test', (req, res) => {
      try {
        const { message } = req.body;
        console.log('📱 Test notification:', message || 'Test message from trading bot');
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log('✅ API routes setup completed');
  }

  setupWebSocket() {
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      console.log('📡 Client connected:', socket.id);
      
      // Send current state
      socket.emit('state', this.botState);
      
      socket.on('subscribe', (channels) => {
        socket.join(channels);
        console.log(`📡 Client ${socket.id} subscribed to:`, channels);
      });
      
      socket.on('disconnect', () => {
        console.log('📡 Client disconnected:', socket.id);
      });
    });

    console.log('✅ WebSocket setup completed');
  }

  broadcastUpdate(type, data) {
    if (this.io) {
      this.io.emit('update', {
        type,
        data,
        timestamp: new Date().toISOString()
      });
    }
  }

  setupCronJobs() {
    // Generate signals every 5 minutes
    const signalJob = cron.schedule('*/5 * * * *', async () => {
      if (this.isRunning) {
        try {
          await this.services.signal.generateSignals(['BTC/USDT', 'ETH/USDT']);
        } catch (error) {
          console.error('❌ Error in signal generation cron:', error);
        }
      }
    }, { scheduled: false });

    // Update ML predictions every 15 minutes
    const predictionJob = cron.schedule('*/15 * * * *', async () => {
      if (this.isRunning) {
        try {
          const symbols = ['BTC/USDT', 'ETH/USDT'];
          const timeframes = ['1h', '4h'];
          
          for (const symbol of symbols) {
            for (const timeframe of timeframes) {
              try {
                const prediction = await this.services.ml.generatePrediction(symbol, timeframe);
                this.botState.predictions[`${symbol}_${timeframe}`] = prediction;
              } catch (error) {
                console.error(`❌ Error generating prediction for ${symbol} ${timeframe}:`, error);
              }
            }
          }
          
          this.broadcastUpdate('predictionsUpdate', this.botState.predictions);
        } catch (error) {
          console.error('❌ Error in prediction generation cron:', error);
        }
      }
    }, { scheduled: false });

    // Portfolio update every minute
    const portfolioJob = cron.schedule('* * * * *', async () => {
      if (this.isRunning) {
        try {
          const portfolio = await this.services.trading.getPortfolioSummary();
          this.botState.positions = portfolio.positions;
          this.broadcastUpdate('portfolioUpdate', portfolio);
        } catch (error) {
          console.error('❌ Error in portfolio update cron:', error);
        }
      }
    }, { scheduled: false });

    this.cronJobs = [signalJob, predictionJob, portfolioJob];
    console.log('✅ Cron jobs setup completed');
  }

  async startServer() {
    const port = process.env.PORT || 3001;
    const host = process.env.HOST || '0.0.0.0';

    this.server = createServer(this.app);
    
    this.server.listen(port, host, () => {
      console.log(`🚀 Professional Trading Bot Server running on ${host}:${port}`);
      console.log(`📊 Dashboard: http://localhost:5173`);
      console.log(`🔗 API: http://${host}:${port}/api`);
      console.log(`💚 Health: http://${host}:${port}/health`);
    });
  }

  async startBot() {
    if (this.isRunning) {
      console.warn('⚠️ Bot is already running');
      return;
    }

    try {
      console.log('🚀 Starting Professional Trading Bot...');
      
      // Start market data collection
      await this.services.marketData.startDataCollection(['BTC/USDT', 'ETH/USDT']);
      
      // Start signal generation
      this.services.signal.startSignalGeneration();
      
      // Start trading service
      this.services.trading.startTrading();
      
      // Start cron jobs
      this.cronJobs.forEach(job => job.start());
      
      this.isRunning = true;
      this.botState.isRunning = true;
      
      console.log('✅ Professional Trading Bot started successfully');
      this.broadcastUpdate('botStarted', { isRunning: true });
      
    } catch (error) {
      console.error('❌ Error starting bot:', error);
      throw error;
    }
  }

  async stopBot() {
    if (!this.isRunning) {
      console.warn('⚠️ Bot is not running');
      return;
    }

    try {
      console.log('🛑 Stopping Professional Trading Bot...');
      
      // Stop cron jobs
      this.cronJobs.forEach(job => job.stop());
      
      // Stop services
      await this.services.marketData.stopDataCollection();
      this.services.signal.stopSignalGeneration();
      this.services.trading.stopTrading();
      
      this.isRunning = false;
      this.botState.isRunning = false;
      
      console.log('✅ Professional Trading Bot stopped successfully');
      this.broadcastUpdate('botStopped', { isRunning: false });
      
    } catch (error) {
      console.error('❌ Error stopping bot:', error);
      throw error;
    }
  }

  async shutdown() {
    console.log('🔄 Shutting down Professional Trading Bot...');
    
    try {
      // Stop bot if running
      if (this.isRunning) {
        await this.stopBot();
      }
      
      // Cleanup services
      for (const [name, service] of Object.entries(this.services)) {
        if (service.cleanup) {
          await service.cleanup();
          console.log(`✅ ${name} service cleaned up`);
        }
      }
      
      // Close server
      if (this.server) {
        this.server.close();
        console.log('✅ Server closed');
      }
      
      console.log('✅ Professional Trading Bot shutdown completed');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Initialize and start the bot
async function main() {
  const bot = new ProfessionalTradingBot();
  
  // Setup graceful shutdown
  process.on('SIGTERM', () => bot.shutdown());
  process.on('SIGINT', () => bot.shutdown());
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    bot.shutdown();
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    bot.shutdown();
  });
  
  // Initialize bot
  await bot.initialize();
}

// Start the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export default ProfessionalTradingBot;