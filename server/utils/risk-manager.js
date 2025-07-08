import { createLogger } from './logger.js';
import { ValidationError, TradingError } from './errors.js';

const logger = createLogger('risk-manager');

export class RiskManager {
  constructor(config = {}) {
    this.config = {
      maxPositionSize: config.maxPositionSize || 0.1, // 10% of portfolio
      maxDailyLoss: config.maxDailyLoss || 0.02, // 2% daily loss limit
      maxDrawdown: config.maxDrawdown || 0.05, // 5% max drawdown
      maxOpenPositions: config.maxOpenPositions || 5,
      minRiskRewardRatio: config.minRiskRewardRatio || 1.5,
      maxLeverage: config.maxLeverage || 3,
      stopLossPercentage: config.stopLossPercentage || 0.02, // 2% stop loss
      takeProfitPercentage: config.takeProfitPercentage || 0.04, // 4% take profit
      cooldownPeriod: config.cooldownPeriod || 300000, // 5 minutes in ms
      ...config
    };

    this.dailyStats = {
      totalPnL: 0,
      tradesCount: 0,
      winningTrades: 0,
      losingTrades: 0,
      lastResetDate: new Date().toDateString()
    };

    this.openPositions = new Map();
    this.lastTradeTime = new Map();
    this.portfolioValue = 0;
    this.initialPortfolioValue = 0;
    this.peakPortfolioValue = 0;

    logger.info('Risk Manager initialized', { config: this.config });
  }

  /**
   * Validate if a new trade can be executed
   * @param {Object} tradeParams - Trade parameters
   * @returns {Object} Validation result
   */
  validateTrade(tradeParams) {
    try {
      const {
        symbol,
        side,
        amount,
        price,
        leverage = 1,
        stopLoss,
        takeProfit
      } = tradeParams;

      // Reset daily stats if new day
      this.resetDailyStatsIfNewDay();

      // Validate required parameters
      if (!symbol || !side || !amount || !price) {
        throw new ValidationError('Missing required trade parameters');
      }

      // Check if symbol is in cooldown
      if (this.isSymbolInCooldown(symbol)) {
        throw new TradingError(`Symbol ${symbol} is in cooldown period`);
      }

      // Check maximum open positions
      if (this.openPositions.size >= this.config.maxOpenPositions) {
        throw new TradingError(`Maximum open positions reached (${this.config.maxOpenPositions})`);
      }

      // Check daily loss limit
      if (this.dailyStats.totalPnL <= -this.config.maxDailyLoss * this.portfolioValue) {
        throw new TradingError('Daily loss limit exceeded');
      }

      // Check maximum drawdown
      const currentDrawdown = this.calculateDrawdown();
      if (currentDrawdown >= this.config.maxDrawdown) {
        throw new TradingError(`Maximum drawdown exceeded: ${(currentDrawdown * 100).toFixed(2)}%`);
      }

      // Check position size
      const positionValue = amount * price;
      const maxPositionValue = this.portfolioValue * this.config.maxPositionSize;
      
      if (positionValue > maxPositionValue) {
        throw new TradingError(`Position size exceeds maximum allowed: ${this.config.maxPositionSize * 100}%`);
      }

      // Check leverage
      if (leverage > this.config.maxLeverage) {
        throw new TradingError(`Leverage exceeds maximum allowed: ${this.config.maxLeverage}x`);
      }

      // Validate stop loss and take profit
      const riskRewardRatio = this.calculateRiskRewardRatio(price, stopLoss, takeProfit, side);
      if (riskRewardRatio < this.config.minRiskRewardRatio) {
        throw new TradingError(`Risk-reward ratio too low: ${riskRewardRatio.toFixed(2)}`);
      }

      // Calculate suggested position size based on risk
      const suggestedSize = this.calculateOptimalPositionSize(price, stopLoss, amount);

      logger.info('Trade validation passed', {
        symbol,
        side,
        amount,
        suggestedSize,
        riskRewardRatio,
        currentDrawdown
      });

      return {
        isValid: true,
        suggestedSize,
        riskRewardRatio,
        currentDrawdown,
        message: 'Trade validation passed'
      };

    } catch (error) {
      logger.error('Trade validation failed', { error: error.message, tradeParams });
      return {
        isValid: false,
        error: error.message,
        errorType: error.constructor.name
      };
    }
  }

  /**
   * Calculate optimal position size based on risk
   * @param {number} entryPrice - Entry price
   * @param {number} stopLoss - Stop loss price
   * @param {number} requestedAmount - Requested amount
   * @returns {number} Optimal position size
   */
  calculateOptimalPositionSize(entryPrice, stopLoss, requestedAmount) {
    if (!stopLoss || !entryPrice) return requestedAmount;

    const riskPerShare = Math.abs(entryPrice - stopLoss);
    const maxRiskAmount = this.portfolioValue * this.config.stopLossPercentage;
    const optimalSize = maxRiskAmount / riskPerShare;

    return Math.min(optimalSize, requestedAmount);
  }

  /**
   * Calculate risk-reward ratio
   * @param {number} entryPrice - Entry price
   * @param {number} stopLoss - Stop loss price
   * @param {number} takeProfit - Take profit price
   * @param {string} side - 'buy' or 'sell'
   * @returns {number} Risk-reward ratio
   */
  calculateRiskRewardRatio(entryPrice, stopLoss, takeProfit, side) {
    if (!stopLoss || !takeProfit || !entryPrice) return 0;

    const isLong = side.toLowerCase() === 'buy';
    
    let risk, reward;
    
    if (isLong) {
      risk = entryPrice - stopLoss;
      reward = takeProfit - entryPrice;
    } else {
      risk = stopLoss - entryPrice;
      reward = entryPrice - takeProfit;
    }

    return risk > 0 ? reward / risk : 0;
  }

  /**
   * Register a new position
   * @param {Object} position - Position details
   */
  registerPosition(position) {
    const { symbol, side, amount, entryPrice, stopLoss, takeProfit } = position;
    
    this.openPositions.set(position.id, {
      ...position,
      openTime: Date.now(),
      unrealizedPnL: 0
    });

    logger.info('Position registered', {
      id: position.id,
      symbol,
      side,
      amount,
      entryPrice,
      openPositions: this.openPositions.size
    });
  }

  /**
   * Close a position and update stats
   * @param {string} positionId - Position ID
   * @param {number} exitPrice - Exit price
   * @param {number} realizedPnL - Realized PnL
   */
  closePosition(positionId, exitPrice, realizedPnL) {
    const position = this.openPositions.get(positionId);
    if (!position) {
      logger.warn('Attempted to close non-existent position', { positionId });
      return;
    }

    // Update daily stats
    this.dailyStats.totalPnL += realizedPnL;
    this.dailyStats.tradesCount++;
    
    if (realizedPnL > 0) {
      this.dailyStats.winningTrades++;
    } else {
      this.dailyStats.losingTrades++;
    }

    // Set cooldown for symbol
    this.lastTradeTime.set(position.symbol, Date.now());

    // Remove position
    this.openPositions.delete(positionId);

    // Update portfolio value
    this.portfolioValue += realizedPnL;
    this.peakPortfolioValue = Math.max(this.peakPortfolioValue, this.portfolioValue);

    logger.info('Position closed', {
      positionId,
      symbol: position.symbol,
      realizedPnL,
      dailyPnL: this.dailyStats.totalPnL,
      openPositions: this.openPositions.size
    });
  }

  /**
   * Update portfolio value
   * @param {number} value - Current portfolio value
   */
  updatePortfolioValue(value) {
    if (this.initialPortfolioValue === 0) {
      this.initialPortfolioValue = value;
    }
    
    this.portfolioValue = value;
    this.peakPortfolioValue = Math.max(this.peakPortfolioValue, value);
  }

  /**
   * Calculate current drawdown
   * @returns {number} Drawdown percentage
   */
  calculateDrawdown() {
    if (this.peakPortfolioValue === 0) return 0;
    return (this.peakPortfolioValue - this.portfolioValue) / this.peakPortfolioValue;
  }

  /**
   * Check if symbol is in cooldown period
   * @param {string} symbol - Trading symbol
   * @returns {boolean} Is in cooldown
   */
  isSymbolInCooldown(symbol) {
    const lastTradeTime = this.lastTradeTime.get(symbol);
    if (!lastTradeTime) return false;
    
    return Date.now() - lastTradeTime < this.config.cooldownPeriod;
  }

  /**
   * Reset daily stats if new day
   */
  resetDailyStatsIfNewDay() {
    const currentDate = new Date().toDateString();
    if (this.dailyStats.lastResetDate !== currentDate) {
      this.dailyStats = {
        totalPnL: 0,
        tradesCount: 0,
        winningTrades: 0,
        losingTrades: 0,
        lastResetDate: currentDate
      };
      logger.info('Daily stats reset for new day');
    }
  }

  /**
   * Get current risk metrics
   * @returns {Object} Risk metrics
   */
  getRiskMetrics() {
    const drawdown = this.calculateDrawdown();
    const winRate = this.dailyStats.tradesCount > 0 
      ? this.dailyStats.winningTrades / this.dailyStats.tradesCount 
      : 0;

    return {
      portfolioValue: this.portfolioValue,
      dailyPnL: this.dailyStats.totalPnL,
      dailyPnLPercentage: this.portfolioValue > 0 ? (this.dailyStats.totalPnL / this.portfolioValue) * 100 : 0,
      drawdown: drawdown * 100,
      openPositions: this.openPositions.size,
      maxOpenPositions: this.config.maxOpenPositions,
      dailyTrades: this.dailyStats.tradesCount,
      winRate: winRate * 100,
      isWithinRiskLimits: this.isWithinRiskLimits()
    };
  }

  /**
   * Check if trading is within risk limits
   * @returns {boolean} Is within limits
   */
  isWithinRiskLimits() {
    const dailyLossLimit = this.config.maxDailyLoss * this.portfolioValue;
    const maxDrawdownLimit = this.config.maxDrawdown;
    const currentDrawdown = this.calculateDrawdown();

    return (
      this.dailyStats.totalPnL > -dailyLossLimit &&
      currentDrawdown < maxDrawdownLimit &&
      this.openPositions.size < this.config.maxOpenPositions
    );
  }

  /**
   * Get emergency stop signal
   * @returns {Object} Emergency stop status
   */
  getEmergencyStopSignal() {
    const reasons = [];
    
    // Check daily loss limit
    if (this.dailyStats.totalPnL <= -this.config.maxDailyLoss * this.portfolioValue) {
      reasons.push('Daily loss limit exceeded');
    }

    // Check maximum drawdown
    const currentDrawdown = this.calculateDrawdown();
    if (currentDrawdown >= this.config.maxDrawdown) {
      reasons.push(`Maximum drawdown exceeded: ${(currentDrawdown * 100).toFixed(2)}%`);
    }

    // Check consecutive losing trades (if more than 5 in a row)
    if (this.dailyStats.losingTrades >= 5 && this.dailyStats.winningTrades === 0) {
      reasons.push('Consecutive losing trades detected');
    }

    return {
      shouldStop: reasons.length > 0,
      reasons,
      riskMetrics: this.getRiskMetrics()
    };
  }
}