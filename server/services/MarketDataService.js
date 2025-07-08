import { EventEmitter } from 'events';
import { MarketData } from '../models/index.js';
import ExchangeService from './ExchangeService.js';

class MarketDataService extends EventEmitter {
  constructor(exchangeService) {
    super();
    this.exchangeService = exchangeService;
    this.subscriptions = new Map();
    this.intervals = new Map();
    this.isRunning = false;
    this.dataBuffer = new Map();
    this.maxBufferSize = 1000;
  }

  async initialize() {
    try {
      console.log('🔄 Initializing Market Data Service...');
      
      // Wait for exchange service to be ready
      if (!this.exchangeService.isInitialized) {
        await new Promise(resolve => {
          this.exchangeService.once('initialized', resolve);
        });
      }
      
      console.log('✅ Market Data Service initialized successfully');
    } catch (error) {
      console.error('❌ Market Data Service initialization failed:', error);
      throw error;
    }
  }

  async startDataCollection(symbols, timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']) {
    if (this.isRunning) {
      console.warn('⚠️ Market data collection is already running');
      return;
    }

    console.log('🚀 Starting market data collection...');
    this.isRunning = true;

    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        await this.subscribeToSymbol(symbol, timeframe);
      }
    }

    // Start real-time price updates
    this.startRealTimeUpdates(symbols);

    console.log('✅ Market data collection started');
  }

  async subscribeToSymbol(symbol, timeframe) {
    const key = `${symbol}_${timeframe}`;
    
    if (this.subscriptions.has(key)) {
      console.warn(`⚠️ Already subscribed to ${key}`);
      return;
    }

    try {
      // Initial data fetch
      await this.fetchAndStoreHistoricalData(symbol, timeframe);
      
      // Set up periodic updates
      const interval = this.getIntervalMs(timeframe);
      const intervalId = setInterval(async () => {
        try {
          await this.fetchAndStoreLatestData(symbol, timeframe);
        } catch (error) {
          console.error(`❌ Error updating ${key}:`, error);
        }
      }, interval);

      this.subscriptions.set(key, {
        symbol,
        timeframe,
        intervalId,
        lastUpdate: new Date()
      });

      console.log(`✅ Subscribed to ${key}`);
    } catch (error) {
      console.error(`❌ Failed to subscribe to ${key}:`, error);
    }
  }

  async fetchAndStoreHistoricalData(symbol, timeframe, limit = 500) {
    try {
      const exchanges = ['binance']; // Add more exchanges as needed
      
      for (const exchangeId of exchanges) {
        try {
          const ohlcvData = await this.exchangeService.fetchOHLCV(
            symbol, 
            timeframe, 
            limit, 
            exchangeId
          );

          // Store in database
          for (const candle of ohlcvData) {
            await MarketData.upsert({
              symbol: candle.symbol,
              timeframe: candle.timeframe,
              timestamp: new Date(candle.timestamp),
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
              exchange: candle.exchange
            });
          }

          // Update buffer for real-time access
          const bufferKey = `${symbol}_${timeframe}_${exchangeId}`;
          this.dataBuffer.set(bufferKey, ohlcvData.slice(-100)); // Keep last 100 candles

          console.log(`✅ Fetched ${ohlcvData.length} candles for ${symbol} ${timeframe} from ${exchangeId}`);
        } catch (error) {
          console.error(`❌ Error fetching data from ${exchangeId}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Error fetching historical data for ${symbol} ${timeframe}:`, error);
    }
  }

  async fetchAndStoreLatestData(symbol, timeframe) {
    try {
      const exchanges = ['binance'];
      
      for (const exchangeId of exchanges) {
        try {
          const ohlcvData = await this.exchangeService.fetchOHLCV(
            symbol, 
            timeframe, 
            1, 
            exchangeId
          );

          if (ohlcvData.length > 0) {
            const candle = ohlcvData[0];
            
            // Store in database
            await MarketData.upsert({
              symbol: candle.symbol,
              timeframe: candle.timeframe,
              timestamp: new Date(candle.timestamp),
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
              exchange: candle.exchange
            });

            // Update buffer
            const bufferKey = `${symbol}_${timeframe}_${exchangeId}`;
            const buffer = this.dataBuffer.get(bufferKey) || [];
            buffer.push(candle);
            
            // Keep buffer size manageable
            if (buffer.length > this.maxBufferSize) {
              buffer.shift();
            }
            
            this.dataBuffer.set(bufferKey, buffer);

            // Emit real-time update
            this.emit('candleUpdate', {
              symbol,
              timeframe,
              exchange: exchangeId,
              candle
            });
          }
        } catch (error) {
          console.error(`❌ Error fetching latest data from ${exchangeId}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Error fetching latest data for ${symbol} ${timeframe}:`, error);
    }
  }

  startRealTimeUpdates(symbols) {
    // Real-time price updates every 5 seconds
    const priceUpdateInterval = setInterval(async () => {
      for (const symbol of symbols) {
        try {
          const ticker = await this.exchangeService.fetchTicker(symbol);
          
          this.emit('priceUpdate', {
            symbol: ticker.symbol,
            price: ticker.price,
            change: ticker.change,
            percentage: ticker.percentage,
            volume: ticker.volume,
            timestamp: ticker.timestamp,
            exchange: ticker.exchange
          });
        } catch (error) {
          console.error(`❌ Error fetching ticker for ${symbol}:`, error);
        }
      }
    }, 5000);

    this.intervals.set('priceUpdates', priceUpdateInterval);
  }

  async getHistoricalData(symbol, timeframe, limit = 100, exchangeId = 'binance') {
    try {
      // Try buffer first for recent data
      const bufferKey = `${symbol}_${timeframe}_${exchangeId}`;
      const bufferedData = this.dataBuffer.get(bufferKey);
      
      if (bufferedData && bufferedData.length >= limit) {
        return bufferedData.slice(-limit);
      }

      // Fallback to database
      const data = await MarketData.findAll({
        where: {
          symbol,
          timeframe,
          exchange: exchangeId
        },
        order: [['timestamp', 'DESC']],
        limit,
        raw: true
      });

      return data.reverse().map(row => ({
        timestamp: new Date(row.timestamp).getTime(),
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseFloat(row.volume),
        exchange: row.exchange,
        symbol: row.symbol,
        timeframe: row.timeframe
      }));
    } catch (error) {
      console.error(`❌ Error getting historical data for ${symbol} ${timeframe}:`, error);
      return [];
    }
  }

  async getLatestPrice(symbol, exchangeId = 'binance') {
    try {
      const ticker = await this.exchangeService.fetchTicker(symbol, exchangeId);
      return ticker.price;
    } catch (error) {
      console.error(`❌ Error getting latest price for ${symbol}:`, error);
      return null;
    }
  }

  getIntervalMs(timeframe) {
    const intervals = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    
    return intervals[timeframe] || 60 * 1000; // Default to 1 minute
  }

  async unsubscribeFromSymbol(symbol, timeframe) {
    const key = `${symbol}_${timeframe}`;
    const subscription = this.subscriptions.get(key);
    
    if (subscription) {
      clearInterval(subscription.intervalId);
      this.subscriptions.delete(key);
      console.log(`✅ Unsubscribed from ${key}`);
    }
  }

  async stopDataCollection() {
    if (!this.isRunning) {
      console.warn('⚠️ Market data collection is not running');
      return;
    }

    console.log('🔄 Stopping market data collection...');

    // Clear all subscriptions
    for (const [key, subscription] of this.subscriptions.entries()) {
      clearInterval(subscription.intervalId);
    }
    this.subscriptions.clear();

    // Clear all intervals
    for (const [key, intervalId] of this.intervals.entries()) {
      clearInterval(intervalId);
    }
    this.intervals.clear();

    this.isRunning = false;
    console.log('✅ Market data collection stopped');
  }

  getSubscriptionStatus() {
    const status = {};
    
    for (const [key, subscription] of this.subscriptions.entries()) {
      status[key] = {
        symbol: subscription.symbol,
        timeframe: subscription.timeframe,
        lastUpdate: subscription.lastUpdate,
        isActive: true
      };
    }
    
    return status;
  }

  async cleanup() {
    console.log('🔄 Cleaning up Market Data Service...');
    
    await this.stopDataCollection();
    this.dataBuffer.clear();
    
    console.log('✅ Market Data Service cleanup completed');
  }
}

export default MarketDataService;