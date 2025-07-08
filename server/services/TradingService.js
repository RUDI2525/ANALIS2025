import { EventEmitter } from 'events';
import { Trade, Position } from '../models/index.js';
import { v4 as uuidv4 } from 'uuid';

class TradingService extends EventEmitter {
  constructor(exchangeService, marketDataService) {
    super();
    this.exchangeService = exchangeService;
    this.marketDataService = marketDataService;
    this.positions = new Map();
    this.activeOrders = new Map();
    this.riskLimits = {
      maxPositionSize: 0.1, // 10% of portfolio
      maxDailyLoss: 0.05, // 5% daily loss limit
      maxOpenPositions: 5,
      stopLossPercentage: 0.02, // 2% stop loss
      takeProfitPercentage: 0.04 // 4% take profit
    };
    this.portfolioValue = 10000; // Starting portfolio value
    this.dailyPnL = 0;
    this.isRunning = false;
  }

  async initialize() {
    try {
      console.log('🔄 Initializing Trading Service...');
      
      // Load existing positions from database
      await this.loadPositions();
      
      // Setup position monitoring
      this.setupPositionMonitoring();
      
      console.log('✅ Trading Service initialized successfully');
    } catch (error) {
      console.error('❌ Trading Service initialization failed:', error);
      throw error;
    }
  }

  async loadPositions() {
    try {
      const openPositions = await Position.findAll({
        where: { status: 'OPEN' }
      });

      for (const pos of openPositions) {
        this.positions.set(pos.id, {
          id: pos.id,
          symbol: pos.symbol,
          side: pos.side,
          size: parseFloat(pos.size),
          entryPrice: parseFloat(pos.entry_price),
          currentPrice: parseFloat(pos.current_price),
          unrealizedPnL: parseFloat(pos.unrealized_pnl),
          stopLoss: pos.stop_loss ? parseFloat(pos.stop_loss) : null,
          takeProfit: pos.take_profit ? parseFloat(pos.take_profit) : null,
          exchange: pos.exchange,
          openedAt: pos.opened_at,
          metadata: pos.metadata || {}
        });
      }

      console.log(`✅ Loaded ${openPositions.length} open positions`);
    } catch (error) {
      console.error('❌ Error loading positions:', error);
    }
  }

  setupPositionMonitoring() {
    // Monitor positions every 30 seconds
    setInterval(async () => {
      if (this.isRunning) {
        await this.updatePositions();
        await this.checkStopLossAndTakeProfit();
      }
    }, 30000);

    // Listen to price updates
    this.marketDataService.on('priceUpdate', async (priceData) => {
      await this.handlePriceUpdate(priceData);
    });
  }

  async handlePriceUpdate(priceData) {
    const { symbol, price } = priceData;
    
    // Update positions for this symbol
    for (const [positionId, position] of this.positions.entries()) {
      if (position.symbol === symbol) {
        await this.updatePositionPrice(positionId, price);
      }
    }
  }

  async updatePositionPrice(positionId, newPrice) {
    const position = this.positions.get(positionId);
    if (!position) return;

    const oldPrice = position.currentPrice;
    position.currentPrice = newPrice;

    // Calculate unrealized P&L
    const priceDiff = newPrice - position.entryPrice;
    const multiplier = position.side === 'LONG' ? 1 : -1;
    position.unrealizedPnL = priceDiff * position.size * multiplier;

    // Update in database
    await Position.update({
      current_price: newPrice,
      unrealized_pnl: position.unrealizedPnL
    }, {
      where: { id: positionId }
    });

    // Emit position update
    this.emit('positionUpdate', {
      positionId,
      symbol: position.symbol,
      oldPrice,
      newPrice,
      unrealizedPnL: position.unrealizedPnL
    });
  }

  async updatePositions() {
    for (const [positionId, position] of this.positions.entries()) {
      try {
        const currentPrice = await this.marketDataService.getLatestPrice(position.symbol);
        if (currentPrice) {
          await this.updatePositionPrice(positionId, currentPrice);
        }
      } catch (error) {
        console.error(`❌ Error updating position ${positionId}:`, error);
      }
    }
  }

  async checkStopLossAndTakeProfit() {
    for (const [positionId, position] of this.positions.entries()) {
      try {
        // Check stop loss
        if (position.stopLoss) {
          const shouldTriggerStopLoss = position.side === 'LONG' 
            ? position.currentPrice <= position.stopLoss
            : position.currentPrice >= position.stopLoss;

          if (shouldTriggerStopLoss) {
            console.log(`🛑 Stop loss triggered for position ${positionId}`);
            await this.closePosition(positionId, 'STOP_LOSS');
            continue;
          }
        }

        // Check take profit
        if (position.takeProfit) {
          const shouldTriggerTakeProfit = position.side === 'LONG'
            ? position.currentPrice >= position.takeProfit
            : position.currentPrice <= position.takeProfit;

          if (shouldTriggerTakeProfit) {
            console.log(`🎯 Take profit triggered for position ${positionId}`);
            await this.closePosition(positionId, 'TAKE_PROFIT');
            continue;
          }
        }
      } catch (error) {
        console.error(`❌ Error checking stop/take profit for position ${positionId}:`, error);
      }
    }
  }

  async executeSignal(signal, symbol, confidence, metadata = {}) {
    try {
      console.log(`🎯 Executing signal: ${signal.signal_type} ${symbol} (${confidence}% confidence)`);

      // Risk management checks
      const riskCheck = await this.performRiskChecks(signal, symbol);
      if (!riskCheck.approved) {
        console.warn(`⚠️ Signal rejected: ${riskCheck.reason}`);
        return { success: false, reason: riskCheck.reason };
      }

      // Calculate position size
      const positionSize = this.calculatePositionSize(confidence, symbol);
      
      // Execute trade based on signal type
      let result;
      if (signal.signal_type === 'BUY') {
        result = await this.openLongPosition(symbol, positionSize, signal, metadata);
      } else if (signal.signal_type === 'SELL') {
        result = await this.openShortPosition(symbol, positionSize, signal, metadata);
      } else {
        return { success: false, reason: 'Invalid signal type' };
      }

      if (result.success) {
        this.emit('tradeExecuted', {
          signal,
          symbol,
          positionSize,
          result,
          timestamp: new Date()
        });
      }

      return result;
    } catch (error) {
      console.error(`❌ Error executing signal for ${symbol}:`, error);
      return { success: false, error: error.message };
    }
  }

  async performRiskChecks(signal, symbol) {
    // Check if trading is enabled
    if (!this.isRunning) {
      return { approved: false, reason: 'Trading is disabled' };
    }

    // Check maximum open positions
    if (this.positions.size >= this.riskLimits.maxOpenPositions) {
      return { approved: false, reason: 'Maximum open positions reached' };
    }

    // Check daily loss limit
    if (this.dailyPnL <= -this.riskLimits.maxDailyLoss * this.portfolioValue) {
      return { approved: false, reason: 'Daily loss limit exceeded' };
    }

    // Check if we already have a position in this symbol
    const existingPosition = Array.from(this.positions.values()).find(p => p.symbol === symbol);
    if (existingPosition) {
      return { approved: false, reason: 'Position already exists for this symbol' };
    }

    return { approved: true };
  }

  calculatePositionSize(confidence, symbol) {
    // Base position size as percentage of portfolio
    const baseSize = this.riskLimits.maxPositionSize;
    
    // Adjust based on confidence (50-100% confidence maps to 0.5-1.0 multiplier)
    const confidenceMultiplier = Math.max(0.5, confidence / 100);
    
    // Calculate final position size
    const positionValue = this.portfolioValue * baseSize * confidenceMultiplier;
    
    return positionValue;
  }

  async openLongPosition(symbol, positionValue, signal, metadata = {}) {
    try {
      const currentPrice = await this.marketDataService.getLatestPrice(symbol);
      if (!currentPrice) {
        throw new Error('Unable to get current price');
      }

      const size = positionValue / currentPrice;
      
      // Calculate stop loss and take profit
      const stopLoss = currentPrice * (1 - this.riskLimits.stopLossPercentage);
      const takeProfit = currentPrice * (1 + this.riskLimits.takeProfitPercentage);

      // Create position record
      const positionId = uuidv4();
      const position = {
        id: positionId,
        symbol,
        side: 'LONG',
        size,
        entryPrice: currentPrice,
        currentPrice,
        unrealizedPnL: 0,
        stopLoss,
        takeProfit,
        exchange: 'binance', // Default exchange
        openedAt: new Date(),
        metadata: {
          ...metadata,
          signalId: signal.id,
          confidence: signal.confidence
        }
      };

      // Store in database
      await Position.create({
        id: positionId,
        symbol,
        side: 'LONG',
        size,
        entry_price: currentPrice,
        current_price: currentPrice,
        unrealized_pnl: 0,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        exchange: 'binance',
        status: 'OPEN',
        opened_at: new Date(),
        metadata: position.metadata
      });

      // Store in memory
      this.positions.set(positionId, position);

      // Create trade record
      await this.createTradeRecord({
        positionId,
        symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: size,
        price: currentPrice,
        totalValue: positionValue,
        exchange: 'binance',
        status: 'FILLED',
        signalId: signal.id,
        metadata: position.metadata
      });

      console.log(`✅ Long position opened: ${symbol} at ${currentPrice}`);

      return {
        success: true,
        positionId,
        symbol,
        side: 'LONG',
        size,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit
      };
    } catch (error) {
      console.error(`❌ Error opening long position for ${symbol}:`, error);
      return { success: false, error: error.message };
    }
  }

  async openShortPosition(symbol, positionValue, signal, metadata = {}) {
    try {
      const currentPrice = await this.marketDataService.getLatestPrice(symbol);
      if (!currentPrice) {
        throw new Error('Unable to get current price');
      }

      const size = positionValue / currentPrice;
      
      // Calculate stop loss and take profit for short position
      const stopLoss = currentPrice * (1 + this.riskLimits.stopLossPercentage);
      const takeProfit = currentPrice * (1 - this.riskLimits.takeProfitPercentage);

      // Create position record
      const positionId = uuidv4();
      const position = {
        id: positionId,
        symbol,
        side: 'SHORT',
        size,
        entryPrice: currentPrice,
        currentPrice,
        unrealizedPnL: 0,
        stopLoss,
        takeProfit,
        exchange: 'binance',
        openedAt: new Date(),
        metadata: {
          ...metadata,
          signalId: signal.id,
          confidence: signal.confidence
        }
      };

      // Store in database
      await Position.create({
        id: positionId,
        symbol,
        side: 'SHORT',
        size,
        entry_price: currentPrice,
        current_price: currentPrice,
        unrealized_pnl: 0,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        exchange: 'binance',
        status: 'OPEN',
        opened_at: new Date(),
        metadata: position.metadata
      });

      // Store in memory
      this.positions.set(positionId, position);

      // Create trade record
      await this.createTradeRecord({
        positionId,
        symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: size,
        price: currentPrice,
        totalValue: positionValue,
        exchange: 'binance',
        status: 'FILLED',
        signalId: signal.id,
        metadata: position.metadata
      });

      console.log(`✅ Short position opened: ${symbol} at ${currentPrice}`);

      return {
        success: true,
        positionId,
        symbol,
        side: 'SHORT',
        size,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit
      };
    } catch (error) {
      console.error(`❌ Error opening short position for ${symbol}:`, error);
      return { success: false, error: error.message };
    }
  }

  async closePosition(positionId, reason = 'MANUAL') {
    try {
      const position = this.positions.get(positionId);
      if (!position) {
        throw new Error('Position not found');
      }

      const currentPrice = position.currentPrice;
      const realizedPnL = position.unrealizedPnL;

      // Update position in database
      await Position.update({
        status: 'CLOSED',
        closed_at: new Date(),
        realized_pnl: realizedPnL
      }, {
        where: { id: positionId }
      });

      // Create closing trade record
      await this.createTradeRecord({
        positionId,
        symbol: position.symbol,
        side: position.side === 'LONG' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: position.size,
        price: currentPrice,
        totalValue: position.size * currentPrice,
        exchange: position.exchange,
        status: 'FILLED',
        profitLoss: realizedPnL,
        metadata: { closeReason: reason }
      });

      // Update daily P&L
      this.dailyPnL += realizedPnL;

      // Remove from memory
      this.positions.delete(positionId);

      console.log(`✅ Position closed: ${position.symbol} P&L: ${realizedPnL.toFixed(2)}`);

      this.emit('positionClosed', {
        positionId,
        symbol: position.symbol,
        side: position.side,
        realizedPnL,
        reason,
        timestamp: new Date()
      });

      return {
        success: true,
        positionId,
        realizedPnL,
        reason
      };
    } catch (error) {
      console.error(`❌ Error closing position ${positionId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async createTradeRecord(tradeData) {
    try {
      const trade = await Trade.create({
        id: uuidv4(),
        symbol: tradeData.symbol,
        side: tradeData.side,
        type: tradeData.type || 'MARKET',
        quantity: tradeData.quantity,
        price: tradeData.price,
        total_value: tradeData.totalValue,
        fee: tradeData.fee || 0,
        profit_loss: tradeData.profitLoss || 0,
        exchange: tradeData.exchange,
        order_id: tradeData.orderId,
        status: tradeData.status || 'FILLED',
        strategy: tradeData.strategy,
        signal_id: tradeData.signalId,
        metadata: tradeData.metadata || {}
      });

      return trade;
    } catch (error) {
      console.error('❌ Error creating trade record:', error);
      throw error;
    }
  }

  async getPortfolioSummary() {
    const positions = Array.from(this.positions.values());
    const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    
    // Get recent trades for realized P&L
    const recentTrades = await Trade.findAll({
      where: {
        created_at: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    const totalRealizedPnL = recentTrades.reduce((sum, trade) => sum + parseFloat(trade.profit_loss || 0), 0);
    const totalValue = this.portfolioValue + totalUnrealizedPnL + totalRealizedPnL;

    return {
      portfolioValue: this.portfolioValue,
      totalValue,
      totalUnrealizedPnL,
      totalRealizedPnL,
      dailyPnL: this.dailyPnL,
      openPositions: positions.length,
      positions: positions.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side,
        size: pos.size,
        entryPrice: pos.entryPrice,
        currentPrice: pos.currentPrice,
        unrealizedPnL: pos.unrealizedPnL,
        unrealizedPnLPercent: (pos.unrealizedPnL / (pos.size * pos.entryPrice)) * 100,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        openedAt: pos.openedAt
      }))
    };
  }

  async getTradeHistory(limit = 100) {
    try {
      const trades = await Trade.findAll({
        order: [['created_at', 'DESC']],
        limit,
        raw: true
      });

      return trades.map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        type: trade.type,
        quantity: parseFloat(trade.quantity),
        price: parseFloat(trade.price),
        totalValue: parseFloat(trade.total_value),
        fee: parseFloat(trade.fee),
        profitLoss: parseFloat(trade.profit_loss || 0),
        exchange: trade.exchange,
        status: trade.status,
        timestamp: trade.created_at,
        metadata: trade.metadata
      }));
    } catch (error) {
      console.error('❌ Error getting trade history:', error);
      return [];
    }
  }

  setRiskLimits(limits) {
    this.riskLimits = { ...this.riskLimits, ...limits };
    console.log('✅ Risk limits updated:', this.riskLimits);
  }

  startTrading() {
    this.isRunning = true;
    console.log('🚀 Trading service started');
    this.emit('tradingStarted');
  }

  stopTrading() {
    this.isRunning = false;
    console.log('🛑 Trading service stopped');
    this.emit('tradingStopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      openPositions: this.positions.size,
      dailyPnL: this.dailyPnL,
      portfolioValue: this.portfolioValue,
      riskLimits: this.riskLimits
    };
  }

  async cleanup() {
    console.log('🔄 Cleaning up Trading Service...');
    
    this.stopTrading();
    this.positions.clear();
    this.activeOrders.clear();
    
    console.log('✅ Trading Service cleanup completed');
  }
}

export default TradingService;