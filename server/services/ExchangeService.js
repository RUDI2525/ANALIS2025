import ccxt from 'ccxt';
import { EventEmitter } from 'events';

class ExchangeService extends EventEmitter {
  constructor() {
    super();
    this.exchanges = new Map();
    this.isInitialized = false;
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
  }

  async initialize() {
    try {
      console.log('🔄 Initializing Exchange Service...');
      
      // Initialize exchanges
      await this.initializeExchanges();
      
      this.isInitialized = true;
      console.log('✅ Exchange Service initialized successfully');
      
      this.emit('initialized');
    } catch (error) {
      console.error('❌ Exchange Service initialization failed:', error);
      throw error;
    }
  }

  async initializeExchanges() {
    const exchangeConfigs = [
      {
        id: 'binance',
        class: ccxt.binance,
        config: {
          apiKey: process.env.BINANCE_API_KEY,
          secret: process.env.BINANCE_SECRET,
          sandbox: process.env.NODE_ENV !== 'production',
          enableRateLimit: true,
          options: {
            defaultType: 'spot'
          }
        }
      },
      {
        id: 'kraken',
        class: ccxt.kraken,
        config: {
          apiKey: process.env.KRAKEN_API_KEY,
          secret: process.env.KRAKEN_SECRET,
          sandbox: process.env.NODE_ENV !== 'production',
          enableRateLimit: true
        }
      }
    ];

    for (const config of exchangeConfigs) {
      try {
        const exchange = new config.class(config.config);
        
        // Test connection
        await this.testExchangeConnection(exchange);
        
        this.exchanges.set(config.id, {
          instance: exchange,
          status: 'connected',
          lastCheck: new Date(),
          markets: null
        });
        
        console.log(`✅ ${config.id} exchange connected`);
      } catch (error) {
        console.warn(`⚠️ Failed to connect to ${config.id}:`, error.message);
        
        // Store as disconnected for monitoring
        this.exchanges.set(config.id, {
          instance: null,
          status: 'disconnected',
          lastCheck: new Date(),
          error: error.message,
          markets: null
        });
      }
    }
  }

  async testExchangeConnection(exchange) {
    try {
      await exchange.loadMarkets();
      return true;
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  getExchange(exchangeId) {
    const exchange = this.exchanges.get(exchangeId);
    if (!exchange || exchange.status !== 'connected') {
      throw new Error(`Exchange ${exchangeId} is not available`);
    }
    return exchange.instance;
  }

  async fetchTicker(symbol, exchangeId = 'binance') {
    try {
      const exchange = this.getExchange(exchangeId);
      const ticker = await exchange.fetchTicker(symbol);
      
      return {
        symbol: ticker.symbol,
        price: ticker.last,
        bid: ticker.bid,
        ask: ticker.ask,
        volume: ticker.baseVolume,
        change: ticker.change,
        percentage: ticker.percentage,
        timestamp: ticker.timestamp,
        exchange: exchangeId
      };
    } catch (error) {
      console.error(`Error fetching ticker for ${symbol} from ${exchangeId}:`, error);
      throw error;
    }
  }

  async fetchOHLCV(symbol, timeframe = '1m', limit = 100, exchangeId = 'binance') {
    try {
      const exchange = this.getExchange(exchangeId);
      const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
      
      return ohlcv.map(candle => ({
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5],
        exchange: exchangeId,
        symbol,
        timeframe
      }));
    } catch (error) {
      console.error(`Error fetching OHLCV for ${symbol} from ${exchangeId}:`, error);
      throw error;
    }
  }

  async fetchOrderBook(symbol, limit = 100, exchangeId = 'binance') {
    try {
      const exchange = this.getExchange(exchangeId);
      const orderBook = await exchange.fetchOrderBook(symbol, limit);
      
      return {
        symbol,
        bids: orderBook.bids,
        asks: orderBook.asks,
        timestamp: orderBook.timestamp,
        exchange: exchangeId
      };
    } catch (error) {
      console.error(`Error fetching order book for ${symbol} from ${exchangeId}:`, error);
      throw error;
    }
  }

  async createOrder(symbol, type, side, amount, price = null, exchangeId = 'binance') {
    try {
      const exchange = this.getExchange(exchangeId);
      
      let order;
      if (type === 'market') {
        order = await exchange.createMarketOrder(symbol, side, amount);
      } else if (type === 'limit') {
        if (!price) throw new Error('Price is required for limit orders');
        order = await exchange.createLimitOrder(symbol, side, amount, price);
      } else {
        throw new Error(`Unsupported order type: ${type}`);
      }
      
      return {
        id: order.id,
        symbol: order.symbol,
        type: order.type,
        side: order.side,
        amount: order.amount,
        price: order.price,
        status: order.status,
        timestamp: order.timestamp,
        exchange: exchangeId
      };
    } catch (error) {
      console.error(`Error creating order on ${exchangeId}:`, error);
      throw error;
    }
  }

  async fetchBalance(exchangeId = 'binance') {
    try {
      const exchange = this.getExchange(exchangeId);
      const balance = await exchange.fetchBalance();
      
      return {
        total: balance.total,
        free: balance.free,
        used: balance.used,
        exchange: exchangeId,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error fetching balance from ${exchangeId}:`, error);
      throw error;
    }
  }

  async fetchMyTrades(symbol, limit = 100, exchangeId = 'binance') {
    try {
      const exchange = this.getExchange(exchangeId);
      const trades = await exchange.fetchMyTrades(symbol, undefined, limit);
      
      return trades.map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        price: trade.price,
        cost: trade.cost,
        fee: trade.fee,
        timestamp: trade.timestamp,
        exchange: exchangeId
      }));
    } catch (error) {
      console.error(`Error fetching trades for ${symbol} from ${exchangeId}:`, error);
      throw error;
    }
  }

  getExchangeStatus() {
    const status = {};
    
    for (const [id, exchange] of this.exchanges.entries()) {
      status[id] = {
        status: exchange.status,
        lastCheck: exchange.lastCheck,
        error: exchange.error || null,
        markets: exchange.markets ? Object.keys(exchange.markets).length : 0
      };
    }
    
    return status;
  }

  async healthCheck() {
    const results = {};
    
    for (const [id, exchangeData] of this.exchanges.entries()) {
      if (exchangeData.status === 'connected' && exchangeData.instance) {
        try {
          await exchangeData.instance.fetchStatus();
          results[id] = { status: 'healthy', timestamp: new Date() };
        } catch (error) {
          results[id] = { 
            status: 'unhealthy', 
            error: error.message, 
            timestamp: new Date() 
          };
        }
      } else {
        results[id] = { 
          status: 'disconnected', 
          timestamp: new Date() 
        };
      }
    }
    
    return results;
  }

  async reconnectExchange(exchangeId) {
    const attempts = this.reconnectAttempts.get(exchangeId) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts reached for ${exchangeId}`);
      return false;
    }
    
    try {
      console.log(`🔄 Attempting to reconnect to ${exchangeId} (attempt ${attempts + 1})`);
      
      await this.initializeExchanges();
      
      this.reconnectAttempts.delete(exchangeId);
      console.log(`✅ Successfully reconnected to ${exchangeId}`);
      
      return true;
    } catch (error) {
      this.reconnectAttempts.set(exchangeId, attempts + 1);
      console.error(`❌ Reconnection failed for ${exchangeId}:`, error.message);
      
      // Schedule next reconnection attempt
      setTimeout(() => {
        this.reconnectExchange(exchangeId);
      }, this.reconnectDelay * (attempts + 1));
      
      return false;
    }
  }

  async shutdown() {
    console.log('🔄 Shutting down Exchange Service...');
    
    for (const [id, exchange] of this.exchanges.entries()) {
      if (exchange.instance) {
        try {
          // Close any open connections
          if (exchange.instance.close) {
            await exchange.instance.close();
          }
          console.log(`✅ ${id} exchange connection closed`);
        } catch (error) {
          console.error(`❌ Error closing ${id} connection:`, error);
        }
      }
    }
    
    this.exchanges.clear();
    this.isInitialized = false;
    
    console.log('✅ Exchange Service shutdown completed');
  }
}

export default ExchangeService;