import { botState, CONFIG } from './index.js';
import { createLogger } from './utils/logger.js';
import { TelegramNotifier } from './utils/telegram.js';
import { DatabaseManager } from './utils/database.js';
import { RiskManager } from './utils/risk-manager.js';
import { ValidationError, TradingError, ExchangeError } from './utils/errors.js';

// Initialize services
const logger = createLogger('trading');
const telegramNotifier = new TelegramNotifier();
const dbManager = new DatabaseManager();
const riskManager = new RiskManager();

// Constants
const TECHNICAL_INDICATORS = {
  RSI_PERIOD: 14,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  BB_PERIOD: 20,
  BB_MULTIPLIER: 2,
  STOCH_PERIOD: 14,
  STOCH_SMOOTH: 3,
  PIVOT_LOOKBACK: 5
};

const TRADE_STATES = {
  PENDING: 'PENDING',
  FILLED: 'FILLED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED'
};

/**
 * Enhanced Historical Data Fetcher with Multiple Exchange Support
 * @param {string} timeframe - Trading timeframe (1m, 5m, 15m, 1h, 4h, 1d)
 * @param {number} limit - Number of candles to fetch
 * @param {string} exchangeName - Specific exchange to use
 * @returns {Promise<Array>} Historical OHLCV data
 */
export async function fetchHistoricalData(timeframe, limit = null, exchangeName = null) {
  const startTime = Date.now();
  
  try {
    // Validate inputs
    if (!timeframe || typeof timeframe !== 'string') {
      throw new ValidationError('Invalid timeframe provided');
    }
    
    const exchanges = botState.exchanges;
    const exchangeToUse = exchangeName ? 
      exchanges[exchangeName] : 
      exchanges.binance || exchanges.kraken || exchanges.tokocrypto || exchanges.indodax;
    
    if (!exchangeToUse) {
      throw new ExchangeError(`No exchange available${exchangeName ? ` for ${exchangeName}` : ''}`);
    }
    
    const limitToUse = limit || CONFIG.lookbackPeriods[timeframe] || 100;
    
    // Add rate limiting
    await rateLimiter.waitForSlot(exchangeName || 'default');
    
    logger.info(`Fetching ${limitToUse} candles of ${timeframe} data for ${CONFIG.symbol}`);
    
    const ohlcv = await exchangeToUse.fetchOHLCV(
      CONFIG.symbol, 
      timeframe, 
      undefined, 
      limitToUse
    );
    
    if (!ohlcv || ohlcv.length === 0) {
      throw new ExchangeError('No data received from exchange');
    }
    
    const processedData = ohlcv.map(candle => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      datetime: new Date(candle[0]).toISOString()
    }));
    
    // Cache the data
    await dbManager.cacheHistoricalData(CONFIG.symbol, timeframe, processedData);
    
    const executionTime = Date.now() - startTime;
    logger.info(`✅ Fetched ${processedData.length} candles in ${executionTime}ms`);
    
    return processedData;
    
  } catch (error) {
    logger.error(`❌ Error fetching ${timeframe} data:`, {
      error: error.message,
      stack: error.stack,
      exchangeName,
      timeframe,
      limit
    });
    
    // Try to get cached data as fallback
    try {
      const cachedData = await dbManager.getCachedHistoricalData(CONFIG.symbol, timeframe);
      if (cachedData && cachedData.length > 0) {
        logger.warn('Using cached data as fallback');
        return cachedData;
      }
    } catch (cacheError) {
      logger.error('Failed to retrieve cached data:', cacheError.message);
    }
    
    throw error;
  }
}

/**
 * Advanced Technical Analysis Calculator
 * @param {Array} data - Historical price data
 * @param {Object} options - Configuration options
 * @returns {Object} Complete technical analysis
 */
export function calculateIndicators(data, options = {}) {
  const startTime = Date.now();
  
  try {
    if (!data || !Array.isArray(data) || data.length < 20) {
      throw new ValidationError('Insufficient data for technical analysis');
    }
    
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const opens = data.map(d => d.open);
    
    logger.debug(`Calculating indicators for ${data.length} candles`);
    
    // Moving Averages
    const movingAverages = calculateMovingAverages(closes);
    
    // Momentum Indicators
    const rsi = calculateRSI(closes, options.rsiPeriod || TECHNICAL_INDICATORS.RSI_PERIOD);
    const macd = calculateMACD(closes, options.macdFast, options.macdSlow, options.macdSignal);
    const stochastic = calculateStochastic(highs, lows, closes, options.stochPeriod);
    
    // Volatility Indicators
    const bollingerBands = calculateBollingerBands(closes, options.bbPeriod, options.bbMultiplier);
    const atr = calculateATR(highs, lows, closes);
    
    // Volume Indicators
    const volumeAnalysis = calculateVolumeIndicators(volumes, closes);
    
    // Support/Resistance
    const supportResistance = calculateSupportResistance(data);
    
    // Trend Analysis
    const trendAnalysis = calculateTrendAnalysis(closes, movingAverages);
    
    // Market Structure
    const marketStructure = analyzeMarketStructure(highs, lows, closes);
    
    // Price Action Patterns
    const pricePatterns = detectPricePatterns(opens, highs, lows, closes);
    
    const indicators = {
      timestamp: new Date().toISOString(),
      dataLength: data.length,
      price: {
        current: closes[closes.length - 1],
        previous: closes[closes.length - 2],
        change: closes[closes.length - 1] - closes[closes.length - 2],
        changePercent: ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
      },
      movingAverages,
      momentum: {
        rsi,
        macd,
        stochastic
      },
      volatility: {
        bollingerBands,
        atr,
        volatilityRatio: calculateVolatilityRatio(closes)
      },
      volume: volumeAnalysis,
      supportResistance,
      trend: trendAnalysis,
      marketStructure,
      patterns: pricePatterns,
      signals: generateTradingSignals({
        rsi,
        macd,
        bollingerBands,
        stochastic,
        movingAverages,
        volumeAnalysis,
        trendAnalysis
      })
    };
    
    const executionTime = Date.now() - startTime;
    logger.debug(`✅ Technical analysis completed in ${executionTime}ms`);
    
    return indicators;
    
  } catch (error) {
    logger.error('❌ Error calculating indicators:', {
      error: error.message,
      stack: error.stack,
      dataLength: data ? data.length : 0
    });
    
    throw error;
  }
}

/**
 * Enhanced RSI Calculation with Wilder's Smoothing
 */
function calculateRSI(closes, period = TECHNICAL_INDICATORS.RSI_PERIOD) {
  if (closes.length < period + 1) return { current: 50, previous: 50, trend: 'neutral' };
  
  const changes = closes.slice(1).map((close, i) => close - closes[i]);
  const gains = changes.map(change => change > 0 ? change : 0);
  const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);
  
  // Calculate initial averages
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  const rsiValues = [];
  
  // Calculate RSI for each period using Wilder's smoothing
  for (let i = period; i < gains.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
    
    if (avgLoss === 0) {
      rsiValues.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsiValues.push(100 - (100 / (1 + rs)));
    }
  }
  
  const current = rsiValues[rsiValues.length - 1];
  const previous = rsiValues[rsiValues.length - 2] || current;
  
  return {
    current,
    previous,
    trend: current > previous ? 'rising' : current < previous ? 'falling' : 'neutral',
    overbought: current > 70,
    oversold: current < 30,
    divergence: detectRSIDivergence(closes.slice(-20), rsiValues.slice(-20))
  };
}

/**
 * Enhanced MACD Calculation
 */
function calculateMACD(closes, fastPeriod = TECHNICAL_INDICATORS.MACD_FAST, 
                      slowPeriod = TECHNICAL_INDICATORS.MACD_SLOW, 
                      signalPeriod = TECHNICAL_INDICATORS.MACD_SIGNAL) {
  if (closes.length < slowPeriod) {
    return { macd: 0, signal: 0, histogram: 0, trend: 'neutral' };
  }
  
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  
  // Calculate MACD line
  const macdLine = [];
  for (let i = slowPeriod - 1; i < closes.length; i++) {
    const fastEMA = calculateEMA(closes.slice(0, i + 1), fastPeriod);
    const slowEMA = calculateEMA(closes.slice(0, i + 1), slowPeriod);
    macdLine.push(fastEMA - slowEMA);
  }
  
  // Calculate signal line
  const signalLine = calculateEMA(macdLine, signalPeriod);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine;
  const histogram = macd - signal;
  const previousHistogram = macdLine.length > 1 ? 
    macdLine[macdLine.length - 2] - calculateEMA(macdLine.slice(0, -1), signalPeriod) : 0;
  
  return {
    macd,
    signal,
    histogram,
    previousHistogram,
    trend: histogram > previousHistogram ? 'rising' : 'falling',
    bullishCrossover: histogram > 0 && previousHistogram <= 0,
    bearishCrossover: histogram < 0 && previousHistogram >= 0
  };
}

/**
 * Enhanced EMA Calculation
 */
function calculateEMA(data, period) {
  if (data.length < period) return data[data.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Enhanced Bollinger Bands with Squeeze Detection
 */
function calculateBollingerBands(closes, period = TECHNICAL_INDICATORS.BB_PERIOD, 
                                multiplier = TECHNICAL_INDICATORS.BB_MULTIPLIER) {
  if (closes.length < period) {
    return { upper: 0, middle: 0, lower: 0, width: 0, position: 0 };
  }
  
  const recentCloses = closes.slice(-period);
  const middle = recentCloses.reduce((a, b) => a + b, 0) / period;
  
  const variance = recentCloses.reduce((sum, close) => sum + Math.pow(close - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  const upper = middle + (stdDev * multiplier);
  const lower = middle - (stdDev * multiplier);
  const width = ((upper - lower) / middle) * 100;
  const currentPrice = closes[closes.length - 1];
  const position = (currentPrice - lower) / (upper - lower);
  
  // Detect squeeze (low volatility)
  const previousWidth = closes.length > period + 1 ? 
    calculateBollingerBands(closes.slice(0, -1), period, multiplier).width : width;
  
  return {
    upper,
    middle,
    lower,
    width,
    position,
    squeeze: width < 10, // Less than 10% width indicates squeeze
    expansion: width > previousWidth * 1.1,
    contraction: width < previousWidth * 0.9
  };
}

/**
 * Enhanced Stochastic Oscillator
 */
function calculateStochastic(highs, lows, closes, period = TECHNICAL_INDICATORS.STOCH_PERIOD) {
  if (closes.length < period) return { k: 50, d: 50, trend: 'neutral' };
  
  const kValues = [];
  
  for (let i = period - 1; i < closes.length; i++) {
    const periodHighs = highs.slice(i - period + 1, i + 1);
    const periodLows = lows.slice(i - period + 1, i + 1);
    const currentClose = closes[i];
    
    const highestHigh = Math.max(...periodHighs);
    const lowestLow = Math.min(...periodLows);
    
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(isNaN(k) ? 50 : k);
  }
  
  // Calculate %D (SMA of %K)
  const dValues = [];
  for (let i = TECHNICAL_INDICATORS.STOCH_SMOOTH - 1; i < kValues.length; i++) {
    const dValue = kValues.slice(i - TECHNICAL_INDICATORS.STOCH_SMOOTH + 1, i + 1)
      .reduce((a, b) => a + b, 0) / TECHNICAL_INDICATORS.STOCH_SMOOTH;
    dValues.push(dValue);
  }
  
  const k = kValues[kValues.length - 1];
  const d = dValues[dValues.length - 1] || k;
  const previousK = kValues[kValues.length - 2] || k;
  
  return {
    k,
    d,
    previousK,
    trend: k > previousK ? 'rising' : 'falling',
    overbought: k > 80,
    oversold: k < 20,
    bullishCrossover: k > d && previousK <= d,
    bearishCrossover: k < d && previousK >= d
  };
}

/**
 * Calculate Moving Averages
 */
function calculateMovingAverages(closes) {
  const periods = [7, 14, 21, 50, 100, 200];
  const smas = {};
  const emas = {};
  
  periods.forEach(period => {
    if (closes.length >= period) {
      smas[`sma${period}`] = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
      emas[`ema${period}`] = calculateEMA(closes, period);
    }
  });
  
  return { sma: smas, ema: emas };
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return 0;
  
  const trueRanges = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Advanced Volume Analysis
 */
function calculateVolumeIndicators(volumes, closes) {
  const volumeHistory = volumes.slice(-20);
  const avgVolume = volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length;
  const currentVolume = volumes[volumes.length - 1];
  
  // Volume-Price Trend (VPT)
  const vpt = [];
  for (let i = 1; i < closes.length; i++) {
    const priceChange = (closes[i] - closes[i - 1]) / closes[i - 1];
    const vptValue = (vpt[i - 2] || 0) + (volumes[i] * priceChange);
    vpt.push(vptValue);
  }
  
  return {
    current: currentVolume,
    average: avgVolume,
    ratio: currentVolume / avgVolume,
    trend: volumes.slice(-5).reduce((a, b) => a + b, 0) > volumes.slice(-10, -5).reduce((a, b) => a + b, 0) ? 'increasing' : 'decreasing',
    vpt: vpt[vpt.length - 1] || 0,
    highVolume: currentVolume > avgVolume * 1.5,
    lowVolume: currentVolume < avgVolume * 0.5
  };
}

/**
 * Enhanced Support and Resistance Detection
 */
function calculateSupportResistance(data) {
  if (data.length < 20) return { support: [], resistance: [], pivotHigh: 0, pivotLow: 0 };
  
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  
  const lookback = TECHNICAL_INDICATORS.PIVOT_LOOKBACK;
  const pivotHighs = [];
  const pivotLows = [];
  
  for (let i = lookback; i < data.length - lookback; i++) {
    const high = highs[i];
    const low = lows[i];
    
    let isPivotHigh = true;
    let isPivotLow = true;
    
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i) {
        if (highs[j] >= high) isPivotHigh = false;
        if (lows[j] <= low) isPivotLow = false;
      }
    }
    
    if (isPivotHigh) {
      pivotHighs.push({ price: high, index: i, timestamp: data[i].timestamp });
    }
    if (isPivotLow) {
      pivotLows.push({ price: low, index: i, timestamp: data[i].timestamp });
    }
  }
  
  // Find significant levels
  const resistanceLevels = pivotHighs
    .sort((a, b) => b.price - a.price)
    .slice(0, 5)
    .map(p => p.price);
  
  const supportLevels = pivotLows
    .sort((a, b) => a.price - b.price)
    .slice(0, 5)
    .map(p => p.price);
  
  return {
    support: supportLevels,
    resistance: resistanceLevels,
    pivotHigh: pivotHighs.length > 0 ? pivotHighs[pivotHighs.length - 1].price : 0,
    pivotLow: pivotLows.length > 0 ? pivotLows[pivotLows.length - 1].price : 0,
    nearSupport: supportLevels.some(level => Math.abs(closes[closes.length - 1] - level) / level < 0.01),
    nearResistance: resistanceLevels.some(level => Math.abs(closes[closes.length - 1] - level) / level < 0.01)
  };
}

/**
 * Smart Trade Execution with Advanced Risk Management
 */
export async function executeSmartTrade(signal, confidence, metadata = {}) {
  const tradeId = generateTradeId();
  const startTime = Date.now();
  
  try {
    logger.info(`🎯 Executing smart trade: ${signal}`, {
      tradeId,
      signal,
      confidence,
      metadata
    });
    
    // Pre-trade validation
    const validationResult = await riskManager.validateTrade(signal, confidence, metadata);
    if (!validationResult.approved) {
      throw new TradingError(`Trade rejected: ${validationResult.reason}`);
    }
    
    // Calculate optimal position size
    const positionSize = await riskManager.calculatePositionSize(signal, confidence, metadata);
    
    // Execute trade
    const tradeResult = CONFIG.paperTrading ? 
      await executePaperTrade(signal, positionSize, metadata) :
      await executeLiveTrade(signal, positionSize, metadata.exchangeName || 'binance');
    
    // Post-trade management
    await setupTradeManagement(tradeResult, metadata);
    
    const executionTime = Date.now() - startTime;
    logger.info(`✅ Smart trade executed successfully in ${executionTime}ms`, {
      tradeId,
      result: tradeResult
    });
    
    return tradeResult;
    
  } catch (error) {
    logger.error(`❌ Smart trade execution failed:`, {
      tradeId,
      error: error.message,
      stack: error.stack,
      signal,
      confidence
    });
    
    await telegramNotifier.sendAlert(`🚨 Trade Execution Failed\n\nTrade ID: ${tradeId}\nSignal: ${signal}\nError: ${error.message}`);
    
    throw error;
  }
}

/**
 * Enhanced Paper Trading with Realistic Simulation
 */
export async function executePaperTrade(signal, size, metadata = {}) {
  const tradeId = generateTradeId();
  const price = botState.currentPrice;
  const timestamp = new Date().toISOString();
  
  // Simulate slippage and fees
  const slippage = price * (Math.random() * 0.001); // 0-0.1% slippage
  const executionPrice = signal === 'BUY' ? price + slippage : price - slippage;
  const fee = size * executionPrice * 0.001; // 0.1% fee
  
  const trade = {
    id: tradeId,
    type: 'paper',
    symbol: CONFIG.symbol,
    side: signal,
    size: size,
    price: executionPrice,
    cost: size * executionPrice,
    fee: fee,
    timestamp: timestamp,
    status: TRADE_STATES.FILLED,
    metadata: metadata
  };
  
  // Update portfolio
  if (signal === 'BUY') {
    const totalCost = trade.cost + trade.fee;
    if (botState.balance >= totalCost) {
      botState.balance -= totalCost;
      botState.positions.push({
        id: tradeId,
        symbol: CONFIG.symbol,
        side: 'BUY',
        size: size,
        entryPrice: executionPrice,
        currentPrice: price,
        pnl: 0,
        pnlPercentage: 0,
        timestamp: timestamp,
        exchange: 'paper',
        stopLoss: metadata.stopLoss,
        takeProfit: metadata.takeProfit
      });
    } else {
      throw new TradingError('Insufficient balance for paper trade');
    }
  } else if (signal === 'SELL') {
    const position = botState.positions.find(p => p.symbol === CONFIG.symbol);
    if (position) {
      const revenue = size * executionPrice - fee;
      botState.balance += revenue;
      botState.positions = botState.positions.filter(p => p.id !== position.id);
      
      trade.pnl = revenue - (position.size * position.entryPrice);
      trade.pnlPercentage = (trade.pnl / (position.size * position.entryPrice)) * 100;
    } else {
      throw new TradingError('No position to sell');
    }
  }
  
  // Record trade
  botState.tradeHistory.unshift(trade);
  await dbManager.saveTrade(trade);
  
  // Send notification
  const message = formatTradeNotification(trade);
  await telegramNotifier.sendNotification(message);
  
  logger.info(`📊 Paper trade executed:`, trade);
  
  return trade;
}

/**
 * Enhanced Live Trading with Order Management
 */
export async function executeLiveTrade(signal, size, exchangeName = 'binance') {
  const tradeId = generateTradeId();
  const exchange = botState.exchanges[exchangeName];
  
  if (!exchange) {
    throw new ExchangeError(`Exchange ${exchangeName} not available`);
  }
  
  try {
    const symbol = CONFIG.symbol;
    const price = botState.currentPrice;
    
    // Pre-flight checks
    await performPreFlightChecks(exchange, symbol, signal, size);
    
    let order = null;
    
    if (signal === 'BUY') {
      order = await exchange.createMarketBuyOrder(symbol, size);
    } else if (signal === 'SELL') {
      order = await exchange.createMarketSellOrder(symbol, size);
    }
    
    // Wait for order confirmation
    const confirmedOrder = await waitForOrderConfirmation(exchange, order.id);
    
    const trade = {
      id: tradeId,
      type: 'live',
      symbol: symbol,
      side: signal,
      size: confirmedOrder.filled || size,
      price: confirmedOrder.average || confirmedOrder.price || price,
      cost: confirmedOrder.cost || (size * price),
      fee: confirmedOrder.fee || 0,
      timestamp: new Date().toISOString(),
      exchange: exchangeName,
      orderId: confirmedOrder.id,
      status: confirmedOrder.status,
      metadata: {
        originalOrder: order,
        confirmedOrder: confirmedOrder
      }
    };
    
    // Update positions
    await updatePositions(trade);
    
    // Record trade
    botState.tradeHistory.unshift(trade);
    await dbManager.saveTrade(trade);
    
    // Send notification
    const message = formatTradeNotification(trade);
    await telegramNotifier.sendNotification(message);
    
    logger.info(`💰 Live trade executed:`, trade);
    
    return trade;
    
  } catch (error) {
    logger.error(`❌ Live trading error on ${exchangeName}:`, {
      error: error.message,
      stack: error.stack,
      signal,
      size
    });
    
    throw new TradingError(`Live trading failed: ${error.message}`);
  }
}

/**
 * Utility Functions
 */

// Rate limiter for API calls
const rateLimiter = {
  limits: new Map(),
  async waitForSlot(key) {
    const now = Date.now();
    const limit = this.limits.get(key) || { count: 0, resetTime: now };
    
    if (now > limit.resetTime) {
      limit.count = 0;
      limit.resetTime = now + 60000; // Reset every minute
    }
    
    if (limit.count >= 10) { // Max 10 calls per minute
      const waitTime = limit.resetTime - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot(key);
    }
    
    limit.count++;
    this.limits.set(key, limit);
  }
};

function generateTradeId() {
  return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatTradeNotification(trade) {
  const emoji = trade.side === 'BUY' ? '🛒' : '💰';
  const typeEmoji = trade.type === 'paper' ? '📊' : '💰';
  
  return `${emoji} ${typeEmoji} *${trade.type.toUpperCase()} TRADE EXECUTED*\n\n` +
    `Symbol: ${trade.symbol}\n` +
    `Side: ${trade.side}\n` +
    `Size: ${trade.size}\n` +
    `Price: $${trade.price.toLocaleString()}\n` +
    `Cost: $${trade.cost.toLocaleString()}\n` +
    `Fee: $${trade.fee.toFixed(2)}\n` +
    `${trade.pnl ? `PnL: $${trade.pnl.toFixed(2)} (${trade.pnlPercentage.toFixed(2)}%)` : ''}`;
}

async function performPreFlightChecks(exchange, symbol, signal, size) {
  // Check exchange status
  const status = await exchange.fetchStatus();
  if (status.status !== 'ok') {
    throw new ExchangeError('Exchange is not operational');
  }
  
  // Check account balance
  const balance = await exchange.fetchBalance();
  const requiredBalance = size * botState.currentPrice;
  
  if (signal === 'BUY' && balance.free.USDT < requiredBalance) {
    throw new TradingError('Insufficient USDT balance');
  }
  
  if (signal === 'SELL' && balance.free[symbol.split('/')[0]] < size) {
    throw new TradingError('Insufficient crypto balance');
  }
  
  // Check market status
  const market = await exchange.fetchMarket(symbol);
  if (!market.active) {
    throw new ExchangeError('Market is not active');
  }
  
  // Validate order size
  if (size < market.limits.amount.min || size > market.limits.amount.max) {
    throw new ValidationError('Order size is outside allowed limits');
  }
}

async function waitForOrderConfirmation(exchange, orderId, timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const order = await exchange.fetchOrder(orderId);
      
      if (order.status === 'closed' || order.status === 'filled') {
        return order;
      }
      
      if (order.status === 'canceled' || order.status === 'rejected') {
        throw new TradingError(`Order ${order.status}: ${order.info}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      if (error instanceof TradingError) throw error;
      
      logger.warn('Error checking order status:', error.message);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new TradingError('Order confirmation timeout');
}

async function updatePositions(trade) {
  if (trade.side === 'BUY') {
    const position = {
      id: trade.id,
      symbol: trade.symbol,
      side: 'BUY',
      size: trade.size,
      entryPrice: trade.price,
      currentPrice: botState.currentPrice,
      pnl: 0,
      pnlPercentage: 0,
      timestamp: trade.timestamp,
      exchange: trade.exchange,
      stopLoss: null,
      takeProfit: null
    };
    
    botState.positions.push(position);
    
  } else if (trade.side === 'SELL') {
    const positionIndex = botState.positions.findIndex(p => 
      p.symbol === trade.symbol && p.exchange === trade.exchange
    );
    
    if (positionIndex !== -1) {
      const position = botState.positions[positionIndex];
      const pnl = (trade.price - position.entryPrice) * trade.size;
      const pnlPercentage = (pnl / (position.entryPrice * position.size)) * 100;
      
      trade.pnl = pnl;
      trade.pnlPercentage = pnlPercentage;
      
      botState.positions.splice(positionIndex, 1);
    }
  }
}

async function setupTradeManagement(trade, metadata) {
  if (trade.side === 'BUY') {
    const position = botState.positions.find(p => p.id === trade.id);
    if (!position) return;
    
    // Set stop loss
    if (metadata.stopLoss || CONFIG.stopLossPct) {
      const stopLossPrice = trade.price * (1 - (metadata.stopLoss || CONFIG.stopLossPct));
      position.stopLoss = stopLossPrice;
      
      logger.info(`🛡️ Stop loss set at ${stopLossPrice.toFixed(2)}`);
    }
    
    // Set take profit
    if (metadata.takeProfit || CONFIG.takeProfitPct) {
      const takeProfitPrice = trade.price * (1 + (metadata.takeProfit || CONFIG.takeProfitPct));
      position.takeProfit = takeProfitPrice;
      
      logger.info(`🎯 Take profit set at ${takeProfitPrice.toFixed(2)}`);
    }
    
    // Set trailing stop
    if (metadata.trailingStop) {
      position.trailingStop = {
        percentage: metadata.trailingStop,
        highestPrice: trade.price,
        triggerPrice: trade.price * (1 - metadata.trailingStop)
      };
      
      logger.info(`📈 Trailing stop set at ${(metadata.trailingStop * 100).toFixed(2)}%`);
    }
  }
}

/**
 * Advanced Signal Generation
 */
function generateTradingSignals(indicators) {
  const signals = [];
  let overallSignal = 'HOLD';
  let confidence = 0;
  
  // RSI Signals
  if (indicators.rsi.oversold && indicators.rsi.trend === 'rising') {
    signals.push({ type: 'RSI_OVERSOLD_REVERSAL', signal: 'BUY', strength: 3 });
  }
  if (indicators.rsi.overbought && indicators.rsi.trend === 'falling') {
    signals.push({ type: 'RSI_OVERBOUGHT_REVERSAL', signal: 'SELL', strength: 3 });
  }
  
  // MACD Signals
  if (indicators.macd.bullishCrossover) {
    signals.push({ type: 'MACD_BULLISH_CROSSOVER', signal: 'BUY', strength: 4 });
  }
  if (indicators.macd.bearishCrossover) {
    signals.push({ type: 'MACD_BEARISH_CROSSOVER', signal: 'SELL', strength: 4 });
  }
  
  // Bollinger Bands Signals
  if (indicators.bollingerBands.position < 0.1 && indicators.bollingerBands.squeeze) {
    signals.push({ type: 'BB_SQUEEZE_OVERSOLD', signal: 'BUY', strength: 3 });
  }
  if (indicators.bollingerBands.position > 0.9 && indicators.bollingerBands.squeeze) {
    signals.push({ type: 'BB_SQUEEZE_OVERBOUGHT', signal: 'SELL', strength: 3 });
  }
  
  // Stochastic Signals
  if (indicators.stochastic.bullishCrossover && indicators.stochastic.oversold) {
    signals.push({ type: 'STOCH_BULLISH_CROSSOVER', signal: 'BUY', strength: 2 });
  }
  if (indicators.stochastic.bearishCrossover && indicators.stochastic.overbought) {
    signals.push({ type: 'STOCH_BEARISH_CROSSOVER', signal: 'SELL', strength: 2 });
  }
  
  // Volume Confirmation
  if (indicators.volumeAnalysis.highVolume) {
    signals.forEach(signal => {
      if (signal.strength < 5) signal.strength += 1;
    });
  }
  
  // Trend Confirmation
  if (indicators.trendAnalysis.trend === 'bullish') {
    signals.filter(s => s.signal === 'BUY').forEach(signal => {
      if (signal.strength < 5) signal.strength += 1;
    });
  } else if (indicators.trendAnalysis.trend === 'bearish') {
    signals.filter(s => s.signal === 'SELL').forEach(signal => {
      if (signal.strength < 5) signal.strength += 1;
    });
  }
  
  // Calculate overall signal
  const buySignals = signals.filter(s => s.signal === 'BUY');
  const sellSignals = signals.filter(s => s.signal === 'SELL');
  
  const buyStrength = buySignals.reduce((sum, s) => sum + s.strength, 0);
  const sellStrength = sellSignals.reduce((sum, s) => sum + s.strength, 0);
  
  if (buyStrength > sellStrength && buyStrength >= 5) {
    overallSignal = 'BUY';
    confidence = Math.min((buyStrength / 15) * 100, 100);
  } else if (sellStrength > buyStrength && sellStrength >= 5) {
    overallSignal = 'SELL';
    confidence = Math.min((sellStrength / 15) * 100, 100);
  } else {
    confidence = 0;
  }
  
  return {
    overall: overallSignal,
    confidence: Math.round(confidence),
    individual: signals,
    buyStrength,
    sellStrength,
    signalCount: signals.length
  };
}

/**
 * Market Structure Analysis
 */
function analyzeMarketStructure(highs, lows, closes) {
  const recentHighs = highs.slice(-10);
  const recentLows = lows.slice(-10);
  const recentCloses = closes.slice(-10);
  
  // Higher highs and higher lows = uptrend
  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;
  
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] > recentHighs[i-1]) higherHighs++;
    else lowerHighs++;
    
    if (recentLows[i] > recentLows[i-1]) higherLows++;
    else lowerLows++;
  }
  
  let structure = 'sideways';
  if (higherHighs > lowerHighs && higherLows > lowerLows) {
    structure = 'uptrend';
  } else if (lowerHighs > higherHighs && lowerLows > higherLows) {
    structure = 'downtrend';
  }
  
  return {
    structure,
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
    strength: Math.max(higherHighs + higherLows, lowerHighs + lowerLows) / (recentHighs.length - 1)
  };
}

/**
 * Trend Analysis
 */
function calculateTrendAnalysis(closes, movingAverages) {
  const currentPrice = closes[closes.length - 1];
  const previousPrice = closes[closes.length - 2];
  
  let trend = 'neutral';
  let strength = 0;
  
  // Price vs moving averages
  const { sma, ema } = movingAverages;
  const maComparisons = [];
  
  Object.entries(sma).forEach(([key, value]) => {
    if (value) {
      maComparisons.push(currentPrice > value ? 1 : -1);
    }
  });
  
  const maScore = maComparisons.reduce((sum, val) => sum + val, 0);
  const maxScore = maComparisons.length;
  
  if (maxScore > 0) {
    if (maScore > 0) {
      trend = 'bullish';
      strength = (maScore / maxScore) * 100;
    } else if (maScore < 0) {
      trend = 'bearish';
      strength = (Math.abs(maScore) / maxScore) * 100;
    }
  }
  
  return {
    trend,
    strength: Math.round(strength),
    shortTerm: currentPrice > previousPrice ? 'bullish' : 'bearish',
    maScore,
    maxScore
  };
}

/**
 * Price Pattern Detection
 */
function detectPricePatterns(opens, highs, lows, closes) {
  const patterns = [];
  const length = closes.length;
  
  if (length < 5) return patterns;
  
  // Doji pattern
  const lastCandle = {
    open: opens[length - 1],
    high: highs[length - 1],
    low: lows[length - 1],
    close: closes[length - 1]
  };
  
  const bodySize = Math.abs(lastCandle.close - lastCandle.open);
  const shadowSize = lastCandle.high - lastCandle.low;
  
  if (bodySize / shadowSize < 0.1) {
    patterns.push({
      name: 'DOJI',
      type: 'reversal',
      strength: 3,
      description: 'Indecision candle, potential reversal'
    });
  }
  
  // Hammer pattern
  if (bodySize / shadowSize < 0.3 && 
      (lastCandle.low < Math.min(lastCandle.open, lastCandle.close)) &&
      (lastCandle.high - Math.max(lastCandle.open, lastCandle.close)) < bodySize) {
    patterns.push({
      name: 'HAMMER',
      type: 'bullish_reversal',
      strength: 4,
      description: 'Bullish reversal pattern'
    });
  }
  
  // Shooting star pattern
  if (bodySize / shadowSize < 0.3 && 
      (lastCandle.high > Math.max(lastCandle.open, lastCandle.close)) &&
      (Math.min(lastCandle.open, lastCandle.close) - lastCandle.low) < bodySize) {
    patterns.push({
      name: 'SHOOTING_STAR',
      type: 'bearish_reversal',
      strength: 4,
      description: 'Bearish reversal pattern'
    });
  }
  
  return patterns;
}

/**
 * Volatility Analysis
 */
function calculateVolatilityRatio(closes) {
  if (closes.length < 20) return 1;
  
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i-1]));
  }
  
  const recentReturns = returns.slice(-10);
  const historicalReturns = returns.slice(-30, -10);
  
  const recentVolatility = Math.sqrt(
    recentReturns.reduce((sum, ret) => sum + ret * ret, 0) / recentReturns.length
  );
  
  const historicalVolatility = Math.sqrt(
    historicalReturns.reduce((sum, ret) => sum + ret * ret, 0) / historicalReturns.length
  );
  
  return recentVolatility / (historicalVolatility || 1);
}

/**
 * RSI Divergence Detection
 */
function detectRSIDivergence(prices, rsiValues) {
  if (prices.length < 10 || rsiValues.length < 10) return null;
  
  const priceHighs = [];
  const priceLows = [];
  const rsiHighs = [];
  const rsiLows = [];
  
  // Find peaks and troughs
  for (let i = 1; i < prices.length - 1; i++) {
    if (prices[i] > prices[i-1] && prices[i] > prices[i+1]) {
      priceHighs.push({index: i, value: prices[i]});
      rsiHighs.push({index: i, value: rsiValues[i]});
    }
    if (prices[i] < prices[i-1] && prices[i] < prices[i+1]) {
      priceLows.push({index: i, value: prices[i]});
      rsiLows.push({index: i, value: rsiValues[i]});
    }
  }
  
  // Check for bearish divergence (price higher highs, RSI lower highs)
  if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
    const lastPriceHigh = priceHighs[priceHighs.length - 1];
    const prevPriceHigh = priceHighs[priceHighs.length - 2];
    const lastRSIHigh = rsiHighs[rsiHighs.length - 1];
    const prevRSIHigh = rsiHighs[rsiHighs.length - 2];
    
    if (lastPriceHigh.value > prevPriceHigh.value && lastRSIHigh.value < prevRSIHigh.value) {
      return {
        type: 'bearish',
        strength: 4,
        description: 'Price making higher highs while RSI making lower highs'
      };
    }
  }
  
  // Check for bullish divergence (price lower lows, RSI higher lows)
  if (priceLows.length >= 2 && rsiLows.length >= 2) {
    const lastPriceLow = priceLows[priceLows.length - 1];
    const prevPriceLow = priceLows[priceLows.length - 2];
    const lastRSILow = rsiLows[rsiLows.length - 1];
    const prevRSILow = rsiLows[rsiLows.length - 2];
    
    if (lastPriceLow.value < prevPriceLow.value && lastRSILow.value > prevRSILow.value) {
      return {
        type: 'bullish',
        strength: 4,
        description: 'Price making lower lows while RSI making higher lows'
      };
    }
  }
  
  return null;
}

/**
 * Position Management
 */
export async function updatePositionsPnL() {
  const currentPrice = botState.currentPrice;
  
  for (let position of botState.positions) {
    const priceDiff = currentPrice - position.entryPrice;
    const pnl = priceDiff * position.size;
    const pnlPercentage = (pnl / (position.entryPrice * position.size)) * 100;
    
    position.currentPrice = currentPrice;
    position.pnl = pnl;
    position.pnlPercentage = pnlPercentage;
    
    // Check stop loss
    if (position.stopLoss && currentPrice <= position.stopLoss) {
      logger.warn(`🛡️ Stop loss triggered for position ${position.id}`);
      await executeSmartTrade('SELL', 100, {
        reason: 'stop_loss',
        positionId: position.id,
        exchangeName: position.exchange
      });
    }
    
    // Check take profit
    if (position.takeProfit && currentPrice >= position.takeProfit) {
      logger.info(`🎯 Take profit triggered for position ${position.id}`);
      await executeSmartTrade('SELL', 100, {
        reason: 'take_profit',
        positionId: position.id,
        exchangeName: position.exchange
      });
    }
    
    // Update trailing stop
    if (position.trailingStop) {
      if (currentPrice > position.trailingStop.highestPrice) {
        position.trailingStop.highestPrice = currentPrice;
        position.trailingStop.triggerPrice = currentPrice * (1 - position.trailingStop.percentage);
      }
      
      if (currentPrice <= position.trailingStop.triggerPrice) {
        logger.info(`📈 Trailing stop triggered for position ${position.id}`);
        await executeSmartTrade('SELL', 100, {
          reason: 'trailing_stop',
          positionId: position.id,
          exchangeName: position.exchange
        });
      }
    }
  }
}

/**
 * Performance Analytics
 */
export function calculatePerformanceMetrics() {
  const trades = botState.tradeHistory.filter(t => t.status === TRADE_STATES.FILLED);
  const completedTrades = trades.filter(t => t.pnl !== undefined);
  
  if (completedTrades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0
    };
  }
  
  const winningTrades = completedTrades.filter(t => t.pnl > 0);
  const losingTrades = completedTrades.filter(t => t.pnl < 0);
  
  const totalPnL = completedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const avgPnL = totalPnL / completedTrades.length;
  const winRate = (winningTrades.length / completedTrades.length) * 100;
  
  const avgWin = winningTrades.length > 0 ? 
    winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? 
    Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;
  
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  // Calculate drawdown
  let peak = CONFIG.initialBalance;
  let maxDrawdown = 0;
  let currentBalance = CONFIG.initialBalance;
  
  for (let trade of completedTrades) {
    currentBalance += trade.pnl;
    if (currentBalance > peak) {
      peak = currentBalance;
    }
    const drawdown = ((peak - currentBalance) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return {
    totalTrades: completedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: Math.round(winRate * 100) / 100,
    totalPnL: Math.round(totalPnL * 100) / 100,
    avgPnL: Math.round(avgPnL * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    currentBalance: Math.round(currentBalance * 100) / 100,
    roi: Math.round(((currentBalance - CONFIG.initialBalance) / CONFIG.initialBalance) * 10000) / 100
  };
}

export {
  TECHNICAL_INDICATORS,
  TRADE_STATES,
  generateTradingSignals,
  analyzeMarketStructure,
  calculateTrendAnalysis,
  detectPricePatterns,
  calculateVolatilityRatio,
  detectRSIDivergence
};