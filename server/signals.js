import { botState, CONFIG } from './index.js';
import { fetchHistoricalData, calculateIndicators } from './trading.js';
import { executeSmartTrade } from './trading.js';
import { sendTelegramNotification } from './utils/telegram.js';
import { logger } from './utils/logger.js';
import { RiskManager } from './utils/risk-manager.js';
import { TradingError, SignalError } from './utils/errors.js';

// Configuration constants
const SIGNAL_CONFIG = {
  TIMEFRAMES: ['15m', '1h', '4h', '1d'],
  MIN_CANDLES: 50,
  WEIGHTS: {
    ML_PREDICTION: 0.35,
    RSI: 0.15,
    MACD: 0.12,
    MOVING_AVERAGES: 0.10,
    BOLLINGER_BANDS: 0.10,
    STOCHASTIC: 0.08,
    VOLUME: 0.05,
    SUPPORT_RESISTANCE: 0.05
  },
  THRESHOLDS: {
    MIN_SIGNAL_STRENGTH: 65,
    STRONG_SIGNAL_THRESHOLD: 75,
    CONSENSUS_THRESHOLD: 2,
    RSI_OVERSOLD: 30,
    RSI_OVERBOUGHT: 70,
    STOCH_OVERSOLD: 20,
    STOCH_OVERBOUGHT: 80,
    VOLUME_SURGE: 1.5
  }
};

/**
 * Enhanced trading signal generator with comprehensive technical analysis
 * @returns {Promise<Array>} Array of generated signals
 */
export async function generateTradingSignals() {
  const startTime = Date.now();
  
  try {
    logger.info('🔄 Starting signal generation process...');
    
    // Validate prerequisites
    if (!validatePrerequisites()) {
      throw new SignalError('Prerequisites validation failed');
    }
    
    const signals = [];
    const { currentPrice, predictions, sentimentData } = botState;
    
    // Get multi-timeframe technical data
    const technicalData = await fetchMultiTimeframeData();
    
    // Generate signals for each timeframe
    for (const timeframe of SIGNAL_CONFIG.TIMEFRAMES) {
      try {
        const signal = await generateTimeframeSignal(
          timeframe,
          technicalData[timeframe],
          predictions[timeframe],
          sentimentData,
          currentPrice
        );
        
        if (signal && signal.strength >= SIGNAL_CONFIG.THRESHOLDS.MIN_SIGNAL_STRENGTH) {
          signals.push(signal);
        }
      } catch (error) {
        logger.error(`❌ Error generating signal for ${timeframe}:`, error);
        continue;
      }
    }
    
    // Apply signal filtering and ranking
    const filteredSignals = await filterAndRankSignals(signals);
    
    // Update bot state
    botState.signals = filteredSignals;
    botState.lastSignalUpdate = new Date().toISOString();
    
    const duration = Date.now() - startTime;
    logger.info(`✅ Generated ${filteredSignals.length} signals in ${duration}ms`);
    
    return filteredSignals;
    
  } catch (error) {
    logger.error('❌ Critical error in signal generation:', error);
    throw new SignalError(`Signal generation failed: ${error.message}`);
  }
}

/**
 * Validate prerequisites for signal generation
 * @returns {boolean} True if all prerequisites are met
 */
function validatePrerequisites() {
  const { currentPrice, predictions, sentimentData } = botState;
  
  if (!currentPrice || currentPrice <= 0) {
    logger.warn('⚠️  Invalid current price for signal generation');
    return false;
  }
  
  if (!predictions || Object.keys(predictions).length === 0) {
    logger.warn('⚠️  No ML predictions available for signal generation');
    return false;
  }
  
  if (!sentimentData) {
    logger.warn('⚠️  No sentiment data available for signal generation');
    return false;
  }
  
  return true;
}

/**
 * Fetch technical data for multiple timeframes
 * @returns {Promise<Object>} Technical data organized by timeframe
 */
async function fetchMultiTimeframeData() {
  const technicalData = {};
  const promises = SIGNAL_CONFIG.TIMEFRAMES.map(async (timeframe) => {
    try {
      const data = await fetchHistoricalData(timeframe, SIGNAL_CONFIG.MIN_CANDLES);
      if (data && data.length >= 20) {
        technicalData[timeframe] = calculateIndicators(data);
      }
    } catch (error) {
      logger.error(`❌ Error fetching ${timeframe} data:`, error);
    }
  });
  
  await Promise.all(promises);
  return technicalData;
}

/**
 * Generate signal for a specific timeframe
 * @param {string} timeframe - Trading timeframe
 * @param {Object} indicators - Technical indicators
 * @param {Object} prediction - ML prediction
 * @param {Object} sentiment - Sentiment data
 * @param {number} currentPrice - Current market price
 * @returns {Promise<Object|null>} Generated signal or null
 */
async function generateTimeframeSignal(timeframe, indicators, prediction, sentiment, currentPrice) {
  if (!indicators || !prediction) return null;
  
  const signalComponents = {
    direction: 'HOLD',
    strength: 50,
    confidence: 0,
    indicators: [],
    reasons: [],
    scores: {}
  };
  
  // 1. ML Prediction Analysis (35% weight)
  const mlScore = analyzeMlPrediction(prediction, signalComponents);
  signalComponents.scores.ml = mlScore;
  
  // 2. RSI Analysis (15% weight)
  const rsiScore = analyzeRSI(indicators.rsi, signalComponents);
  signalComponents.scores.rsi = rsiScore;
  
  // 3. MACD Analysis (12% weight)
  const macdScore = analyzeMacd(indicators.macd, signalComponents);
  signalComponents.scores.macd = macdScore;
  
  // 4. Moving Averages Analysis (10% weight)
  const maScore = analyzeMovingAverages(indicators, currentPrice, signalComponents);
  signalComponents.scores.ma = maScore;
  
  // 5. Bollinger Bands Analysis (10% weight)
  const bbScore = analyzeBollingerBands(indicators.bollingerBands, currentPrice, signalComponents);
  signalComponents.scores.bb = bbScore;
  
  // 6. Stochastic Analysis (8% weight)
  const stochScore = analyzeStochastic(indicators.stochastic, signalComponents);
  signalComponents.scores.stoch = stochScore;
  
  // 7. Volume Analysis (5% weight)
  const volumeScore = analyzeVolume(indicators.volumeRatio, signalComponents);
  signalComponents.scores.volume = volumeScore;
  
  // 8. Support/Resistance Analysis (5% weight)
  const srScore = analyzeSupportResistance(indicators.supportResistance, currentPrice, signalComponents);
  signalComponents.scores.sr = srScore;
  
  // Calculate weighted final strength
  const finalStrength = calculateWeightedStrength(signalComponents.scores);
  
  // Apply sentiment confirmation
  const sentimentAdjustment = applySentimentConfirmation(sentiment, signalComponents.direction);
  
  return {
    id: generateSignalId(timeframe),
    timeframe,
    signal: signalComponents.direction,
    strength: Math.min(95, finalStrength + sentimentAdjustment),
    confidence: signalComponents.confidence,
    indicators: signalComponents.indicators,
    reasons: signalComponents.reasons,
    scores: signalComponents.scores,
    prediction: {
      direction: prediction.direction,
      priceTarget: prediction.priceTarget,
      confidence: prediction.confidence,
      timeHorizon: prediction.timeHorizon
    },
    technicals: {
      rsi: Math.round(indicators.rsi * 100) / 100,
      macd: {
        macd: Math.round(indicators.macd.macd * 100) / 100,
        signal: Math.round(indicators.macd.signal * 100) / 100,
        histogram: Math.round(indicators.macd.histogram * 100) / 100
      },
      movingAverages: {
        sma20: Math.round(indicators.sma20 * 100) / 100,
        sma50: Math.round(indicators.sma50 * 100) / 100,
        ema20: Math.round(indicators.ema20 * 100) / 100
      },
      bollingerBands: indicators.bollingerBands,
      stochastic: indicators.stochastic,
      volumeRatio: Math.round(indicators.volumeRatio * 100) / 100,
      supportResistance: indicators.supportResistance
    },
    metadata: {
      timestamp: new Date().toISOString(),
      version: '2.0',
      market: 'crypto',
      symbol: CONFIG.SYMBOL || 'BTC/USDT'
    }
  };
}

/**
 * Analyze ML prediction and update signal components
 */
function analyzeMlPrediction(prediction, components) {
  const { WEIGHTS } = SIGNAL_CONFIG;
  
  if (prediction.confidence > 60) {
    const score = (prediction.confidence / 100) * WEIGHTS.ML_PREDICTION * 100;
    
    if (prediction.direction === 'BULLISH') {
      components.direction = 'BUY';
      components.indicators.push('ML_BULLISH');
      components.reasons.push(`AI predicts ${prediction.priceChangePercent?.toFixed(2) || 'N/A'}% increase`);
    } else if (prediction.direction === 'BEARISH') {
      components.direction = 'SELL';
      components.indicators.push('ML_BEARISH');
      components.reasons.push(`AI predicts ${prediction.priceChangePercent?.toFixed(2) || 'N/A'}% decrease`);
    }
    
    components.confidence = Math.max(components.confidence, prediction.confidence);
    return score;
  }
  
  return 0;
}

/**
 * Analyze RSI and update signal components
 */
function analyzeRSI(rsi, components) {
  const { WEIGHTS, THRESHOLDS } = SIGNAL_CONFIG;
  
  if (rsi < THRESHOLDS.RSI_OVERSOLD) {
    components.direction = components.direction === 'HOLD' ? 'BUY' : components.direction;
    components.indicators.push('RSI_OVERSOLD');
    components.reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
    return WEIGHTS.RSI * 100;
  } else if (rsi > THRESHOLDS.RSI_OVERBOUGHT) {
    components.direction = components.direction === 'HOLD' ? 'SELL' : components.direction;
    components.indicators.push('RSI_OVERBOUGHT');
    components.reasons.push(`RSI overbought (${rsi.toFixed(1)})`);
    return WEIGHTS.RSI * 100;
  }
  
  return 0;
}

/**
 * Analyze MACD and update signal components
 */
function analyzeMacd(macd, components) {
  const { WEIGHTS } = SIGNAL_CONFIG;
  
  if (macd.histogram > 0 && macd.macd > macd.signal) {
    if (components.direction === 'BUY') {
      components.indicators.push('MACD_BULLISH');
      components.reasons.push('MACD bullish crossover');
      return WEIGHTS.MACD * 100;
    }
  } else if (macd.histogram < 0 && macd.macd < macd.signal) {
    if (components.direction === 'SELL') {
      components.indicators.push('MACD_BEARISH');
      components.reasons.push('MACD bearish crossover');
      return WEIGHTS.MACD * 100;
    }
  }
  
  return 0;
}

/**
 * Analyze moving averages and update signal components
 */
function analyzeMovingAverages(indicators, currentPrice, components) {
  const { WEIGHTS } = SIGNAL_CONFIG;
  
  if (currentPrice > indicators.sma20 && indicators.sma20 > indicators.sma50) {
    if (components.direction === 'BUY') {
      components.indicators.push('MA_BULLISH');
      components.reasons.push('Price above moving averages');
      return WEIGHTS.MOVING_AVERAGES * 100;
    }
  } else if (currentPrice < indicators.sma20 && indicators.sma20 < indicators.sma50) {
    if (components.direction === 'SELL') {
      components.indicators.push('MA_BEARISH');
      components.reasons.push('Price below moving averages');
      return WEIGHTS.MOVING_AVERAGES * 100;
    }
  }
  
  return 0;
}

/**
 * Analyze Bollinger Bands and update signal components
 */
function analyzeBollingerBands(bb, currentPrice, components) {
  const { WEIGHTS } = SIGNAL_CONFIG;
  
  if (currentPrice < bb.lower) {
    if (components.direction === 'BUY') {
      components.indicators.push('BB_OVERSOLD');
      components.reasons.push('Price below Bollinger lower band');
      return WEIGHTS.BOLLINGER_BANDS * 100;
    }
  } else if (currentPrice > bb.upper) {
    if (components.direction === 'SELL') {
      components.indicators.push('BB_OVERBOUGHT');
      components.reasons.push('Price above Bollinger upper band');
      return WEIGHTS.BOLLINGER_BANDS * 100;
    }
  }
  
  return 0;
}

/**
 * Analyze Stochastic and update signal components
 */
function analyzeStochastic(stoch, components) {
  const { WEIGHTS, THRESHOLDS } = SIGNAL_CONFIG;
  
  if (stoch.k < THRESHOLDS.STOCH_OVERSOLD && stoch.d < THRESHOLDS.STOCH_OVERSOLD) {
    if (components.direction === 'BUY') {
      components.indicators.push('STOCH_OVERSOLD');
      components.reasons.push('Stochastic oversold');
      return WEIGHTS.STOCHASTIC * 100;
    }
  } else if (stoch.k > THRESHOLDS.STOCH_OVERBOUGHT && stoch.d > THRESHOLDS.STOCH_OVERBOUGHT) {
    if (components.direction === 'SELL') {
      components.indicators.push('STOCH_OVERBOUGHT');
      components.reasons.push('Stochastic overbought');
      return WEIGHTS.STOCHASTIC * 100;
    }
  }
  
  return 0;
}

/**
 * Analyze volume and update signal components
 */
function analyzeVolume(volumeRatio, components) {
  const { WEIGHTS, THRESHOLDS } = SIGNAL_CONFIG;
  
  if (volumeRatio > THRESHOLDS.VOLUME_SURGE) {
    components.indicators.push('VOLUME_SURGE');
    components.reasons.push(`Volume surge (${volumeRatio.toFixed(1)}x)`);
    return WEIGHTS.VOLUME * 100;
  }
  
  return 0;
}

/**
 * Analyze support/resistance and update signal components
 */
function analyzeSupportResistance(sr, currentPrice, components) {
  const { WEIGHTS } = SIGNAL_CONFIG;
  
  if (currentPrice <= sr.support * 1.02) {
    if (components.direction === 'BUY') {
      components.indicators.push('SUPPORT_LEVEL');
      components.reasons.push('Near support level');
      return WEIGHTS.SUPPORT_RESISTANCE * 100;
    }
  } else if (currentPrice >= sr.resistance * 0.98) {
    if (components.direction === 'SELL') {
      components.indicators.push('RESISTANCE_LEVEL');
      components.reasons.push('Near resistance level');
      return WEIGHTS.SUPPORT_RESISTANCE * 100;
    }
  }
  
  return 0;
}

/**
 * Calculate weighted strength from individual scores
 */
function calculateWeightedStrength(scores) {
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
  return Math.min(95, 50 + totalScore);
}

/**
 * Apply sentiment confirmation to signal
 */
function applySentimentConfirmation(sentiment, direction) {
  if (sentiment.sentiment === 'BULLISH' && direction === 'BUY') {
    return 5;
  } else if (sentiment.sentiment === 'BEARISH' && direction === 'SELL') {
    return 5;
  }
  return 0;
}

/**
 * Generate unique signal ID
 */
function generateSignalId(timeframe) {
  return `signal_${timeframe}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Filter and rank signals based on quality metrics
 */
async function filterAndRankSignals(signals) {
  // Remove weak signals
  const filteredSignals = signals.filter(signal => 
    signal.strength >= SIGNAL_CONFIG.THRESHOLDS.MIN_SIGNAL_STRENGTH &&
    signal.confidence >= 50 &&
    signal.reasons.length >= 2
  );
  
  // Sort by strength and confidence
  return filteredSignals.sort((a, b) => {
    const scoreA = a.strength * 0.7 + a.confidence * 0.3;
    const scoreB = b.strength * 0.7 + b.confidence * 0.3;
    return scoreB - scoreA;
  });
}

/**
 * Advanced signal analysis and execution with enhanced risk management
 */
export async function analyzeAndExecuteSignals() {
  if (!botState.isRunning) {
    logger.info('🔄 Bot is not running, skipping signal execution');
    return;
  }
  
  try {
    const signals = botState.signals;
    const sentiment = botState.sentimentData;
    
    if (!signals || signals.length === 0) {
      logger.info('📊 No signals available for execution');
      return;
    }
    
    // Risk management checks
    const riskAssessment = await RiskManager.assessTradingRisk(signals);
    if (!riskAssessment.canTrade) {
      logger.warn('⚠️  Risk management blocked trading:', riskAssessment.reason);
      return;
    }
    
    // Analyze signal consensus
    const consensus = analyzeSignalConsensus(signals);
    
    // Execute buy signals
    if (consensus.buy.count >= SIGNAL_CONFIG.THRESHOLDS.CONSENSUS_THRESHOLD && 
        consensus.buy.avgStrength > SIGNAL_CONFIG.THRESHOLDS.STRONG_SIGNAL_THRESHOLD) {
      await executeBuySignals(consensus.buy, sentiment);
    }
    
    // Execute sell signals
    if (consensus.sell.count >= SIGNAL_CONFIG.THRESHOLDS.CONSENSUS_THRESHOLD && 
        consensus.sell.avgStrength > SIGNAL_CONFIG.THRESHOLDS.STRONG_SIGNAL_THRESHOLD) {
      await executeSellSignals(consensus.sell, sentiment);
    }
    
  } catch (error) {
    logger.error('❌ Error in signal analysis and execution:', error);
    throw new TradingError(`Signal execution failed: ${error.message}`);
  }
}

/**
 * Analyze signal consensus across timeframes
 */
function analyzeSignalConsensus(signals) {
  const buySignals = signals.filter(s => s.signal === 'BUY' && s.strength > SIGNAL_CONFIG.THRESHOLDS.STRONG_SIGNAL_THRESHOLD);
  const sellSignals = signals.filter(s => s.signal === 'SELL' && s.strength > SIGNAL_CONFIG.THRESHOLDS.STRONG_SIGNAL_THRESHOLD);
  
  return {
    buy: {
      count: buySignals.length,
      avgStrength: buySignals.length > 0 ? buySignals.reduce((sum, s) => sum + s.strength, 0) / buySignals.length : 0,
      avgConfidence: buySignals.length > 0 ? buySignals.reduce((sum, s) => sum + s.confidence, 0) / buySignals.length : 0,
      signals: buySignals
    },
    sell: {
      count: sellSignals.length,
      avgStrength: sellSignals.length > 0 ? sellSignals.reduce((sum, s) => sum + s.strength, 0) / sellSignals.length : 0,
      avgConfidence: sellSignals.length > 0 ? sellSignals.reduce((sum, s) => sum + s.confidence, 0) / sellSignals.length : 0,
      signals: sellSignals
    }
  };
}

/**
 * Execute buy signals with enhanced validation
 */
async function executeBuySignals(buyConsensus, sentiment) {
  const { signals, avgStrength, avgConfidence } = buyConsensus;
  
  // Additional safety checks
  if (sentiment.sentiment === 'BEARISH' && avgStrength < 85) {
    logger.warn('⚠️  Bearish sentiment detected, requiring higher signal strength');
    return;
  }
  
  if (botState.positions.length >= CONFIG.MAX_POSITIONS) {
    logger.warn('⚠️  Maximum positions reached, skipping buy signal');
    return;
  }
  
  const confidence = Math.min(95, avgStrength * 0.7 + avgConfidence * 0.3);
  
  logger.info(`🚀 Executing BUY signal - Consensus: ${signals.length} timeframes, Strength: ${avgStrength.toFixed(1)}%`);
  
  // Send detailed notification
  const message = formatBuySignalMessage(signals, avgStrength, sentiment);
  await sendTelegramNotification(message);
  await executeSmartTrade('SELL', 100, position.exchange);
}

/**
 * Execute position exit for risk management
 */
async function executePositionExit(position, reason) {
  logger.warn(`⚠️ Risk-based exit for position ${position.id}: ${reason}`);
  
  const message = `⚠️ *Risk Management Exit*\n\n` +
    `📍 Position: ${position.symbol}\n` +
    `💰 Entry: ${position.entryPrice.toLocaleString()}\n` +
    `📊 Current: ${position.currentPrice.toLocaleString()}\n` +
    `📉 P&L: ${position.pnl.toFixed(2)} (${position.pnlPercentage.toFixed(2)}%)\n` +
    `⚠️ Reason: ${reason}\n` +
    `⏰ ${new Date().toLocaleTimeString()}`;
  
  await sendTelegramNotification(message);
  await executeSmartTrade('SELL', 100, position.exchange);
}

/**
 * Check if trailing stop should be updated
 */
function shouldUpdateTrailingStop(position, currentPrice) {
  if (!position.trailingStop || !position.trailingStopDistance) return false;
  
  if (position.type === 'BUY') {
    const newStopPrice = currentPrice - position.trailingStopDistance;
    return newStopPrice > position.stopLoss;
  } else {
    const newStopPrice = currentPrice + position.trailingStopDistance;
    return newStopPrice < position.stopLoss;
  }
}

/**
 * Update trailing stop loss
 */
function updateTrailingStop(position, currentPrice) {
  const oldStopLoss = position.stopLoss;
  
  if (position.type === 'BUY') {
    position.stopLoss = currentPrice - position.trailingStopDistance;
  } else {
    position.stopLoss = currentPrice + position.trailingStopDistance;
  }
  
  logger.info(`📈 Trailing stop updated for position ${position.id}: ${oldStopLoss.toFixed(2)} → ${position.stopLoss.toFixed(2)}`);
}

/**
 * Send comprehensive trading signals report
 */
export async function sendSignalReport() {
  try {
    const { signals, predictions, sentimentData, currentPrice, change24h } = botState;
    
    if (!signals || signals.length === 0) {
      logger.info('📊 No signals to report');
      return;
    }
    
    const strongSignals = signals.filter(s => s.strength > SIGNAL_CONFIG.THRESHOLDS.STRONG_SIGNAL_THRESHOLD);
    if (strongSignals.length === 0) {
      logger.info('📊 No strong signals to report');
      return;
    }
    
    const report = generateSignalReport(strongSignals, predictions, sentimentData, currentPrice, change24h);
    await sendTelegramNotification(report);
    
    logger.info(`📊 Signal report sent with ${strongSignals.length} strong signals`);
    
  } catch (error) {
    logger.error('❌ Error sending signal report:', error);
  }
}

/**
 * Generate comprehensive signal report
 */
function generateSignalReport(signals, predictions, sentiment, currentPrice, change24h) {
  // Header section
  let report = `📊 *Trading Signals Report*\n\n`;
  report += `💰 Current Price: ${currentPrice.toLocaleString()}\n`;
  report += `📈 24h Change: ${change24h?.toFixed(2) || 'N/A'}%\n`;
  report += `🎭 Sentiment: ${sentiment.sentiment}`;
  
  if (sentiment.stats) {
    report += ` (${sentiment.stats.bullishPercent}% bullish)\n`;
  } else {
    report += `\n`;
  }
  
  // Market overview
  const marketTrend = determineMarketTrend(signals);
  report += `📊 Market Trend: ${marketTrend}\n\n`;
  
  // Strong signals section
  report += `🔥 *Strong Signals (${signals.length}):*\n`;
  signals.forEach(signal => {
    const emoji = signal.signal === 'BUY' ? '🟢' : '🔴';
    const timeframeEmoji = getTimeframeEmoji(signal.timeframe);
    
    report += `${emoji} ${timeframeEmoji} *${signal.timeframe}* - ${signal.signal}\n`;
    report += `   💪 Strength: ${signal.strength.toFixed(1)}% | 🎯 Confidence: ${signal.confidence.toFixed(1)}%\n`;
    report += `   📋 Top reasons: ${signal.reasons.slice(0, 2).join(', ')}\n`;
  });
  
  // AI predictions section
  report += `\n🤖 *AI Predictions:*\n`;
  Object.entries(predictions).forEach(([timeframe, pred]) => {
    if (pred.confidence > 60) {
      const emoji = pred.direction === 'BULLISH' ? '📈' : '📉';
      const timeframeEmoji = getTimeframeEmoji(timeframe);
      
      report += `${emoji} ${timeframeEmoji} *${timeframe}:* `;
      report += `${pred.priceChangePercent?.toFixed(2) || 'N/A'}% `;
      report += `(${pred.confidence.toFixed(1)}%)\n`;
    }
  });
  
  // Risk assessment
  const riskLevel = calculateOverallRiskLevel(signals);
  report += `\n⚠️ *Risk Level:* ${riskLevel}\n`;
  
  // Positions summary
  if (botState.positions && botState.positions.length > 0) {
    report += `\n💼 *Open Positions:* ${botState.positions.length}\n`;
    const totalPnl = botState.positions.reduce((sum, pos) => sum + pos.pnl, 0);
    report += `📊 Total P&L: ${totalPnl.toFixed(2)}\n`;
  }
  
  // Footer
  report += `\n⏰ Generated: ${new Date().toLocaleTimeString()}\n`;
  report += `🔄 Next update: ${getNextUpdateTime()}`;
  
  return report;
}

/**
 * Determine overall market trend from signals
 */
function determineMarketTrend(signals) {
  const buySignals = signals.filter(s => s.signal === 'BUY');
  const sellSignals = signals.filter(s => s.signal === 'SELL');
  
  if (buySignals.length > sellSignals.length * 1.5) {
    return '📈 BULLISH';
  } else if (sellSignals.length > buySignals.length * 1.5) {
    return '📉 BEARISH';
  } else {
    return '➡️ NEUTRAL';
  }
}

/**
 * Get emoji for timeframe
 */
function getTimeframeEmoji(timeframe) {
  const emojis = {
    '15m': '⚡',
    '1h': '🕐',
    '4h': '🕓',
    '1d': '📅'
  };
  return emojis[timeframe] || '⏰';
}

/**
 * Calculate overall risk level
 */
function calculateOverallRiskLevel(signals) {
  const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
  const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
  
  const riskScore = (avgStrength + avgConfidence) / 2;
  
  if (riskScore >= 85) return '🟢 LOW';
  if (riskScore >= 70) return '🟡 MEDIUM';
  return '🔴 HIGH';
}

/**
 * Get next update time
 */
function getNextUpdateTime() {
  const now = new Date();
  const nextUpdate = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
  return nextUpdate.toLocaleTimeString();
}

/**
 * Advanced signal validation and quality scoring
 */
export async function validateSignalQuality(signal) {
  const qualityScore = {
    total: 0,
    breakdown: {
      strength: 0,
      confidence: 0,
      indicators: 0,
      consistency: 0,
      volume: 0
    }
  };
  
  // Strength scoring (30%)
  if (signal.strength >= 85) qualityScore.breakdown.strength = 30;
  else if (signal.strength >= 75) qualityScore.breakdown.strength = 25;
  else if (signal.strength >= 65) qualityScore.breakdown.strength = 20;
  else qualityScore.breakdown.strength = 10;
  
  // Confidence scoring (25%)
  if (signal.confidence >= 80) qualityScore.breakdown.confidence = 25;
  else if (signal.confidence >= 70) qualityScore.breakdown.confidence = 20;
  else if (signal.confidence >= 60) qualityScore.breakdown.confidence = 15;
  else qualityScore.breakdown.confidence = 10;
  
  // Indicators diversity (20%)
  const uniqueIndicators = new Set(signal.indicators.map(ind => ind.split('_')[0]));
  qualityScore.breakdown.indicators = Math.min(20, uniqueIndicators.size * 4);
  
  // Signal consistency (15%)
  const consistencyScore = calculateSignalConsistency(signal);
  qualityScore.breakdown.consistency = consistencyScore * 0.15;
  
  // Volume confirmation (10%)
  if (signal.technicals.volumeRatio > 1.5) qualityScore.breakdown.volume = 10;
  else if (signal.technicals.volumeRatio > 1.2) qualityScore.breakdown.volume = 7;
  else if (signal.technicals.volumeRatio > 1.0) qualityScore.breakdown.volume = 5;
  else qualityScore.breakdown.volume = 2;
  
  // Calculate total score
  qualityScore.total = Object.values(qualityScore.breakdown).reduce((sum, score) => sum + score, 0);
  
  return {
    score: qualityScore.total,
    grade: getQualityGrade(qualityScore.total),
    breakdown: qualityScore.breakdown,
    isHighQuality: qualityScore.total >= 70
  };
}

/**
 * Calculate signal consistency score
 */
function calculateSignalConsistency(signal) {
  const scores = Object.values(signal.scores);
  if (scores.length === 0) return 0;
  
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
  
  // Lower variance = higher consistency
  return Math.max(0, 100 - Math.sqrt(variance) * 10);
}

/**
 * Get quality grade based on score
 */
function getQualityGrade(score) {
  if (score >= 85) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  return 'D';
}

/**
 * Export signal analytics for external analysis
 */
export async function exportSignalAnalytics() {
  try {
    const analytics = {
      timestamp: new Date().toISOString(),
      signals: botState.signals,
      predictions: botState.predictions,
      sentiment: botState.sentimentData,
      market: {
        price: botState.currentPrice,
        change24h: botState.change24h,
        volume24h: botState.volume24h
      },
      positions: botState.positions,
      performance: await calculateSignalPerformance(),
      metadata: {
        version: '2.0',
        generator: 'enhanced-trading-signals',
        timeframes: SIGNAL_CONFIG.TIMEFRAMES,
        weights: SIGNAL_CONFIG.WEIGHTS
      }
    };
    
    return analytics;
  } catch (error) {
    logger.error('❌ Error exporting signal analytics:', error);
    throw new SignalError(`Analytics export failed: ${error.message}`);
  }
}

/**
 * Calculate historical signal performance
 */
async function calculateSignalPerformance() {
  // This would typically query historical data from database
  // For now, return basic performance metrics
  return {
    totalSignals: botState.signalHistory?.length || 0,
    successRate: 0.65, // 65% success rate (placeholder)
    avgReturn: 2.3, // 2.3% average return (placeholder)
    bestSignal: null,
    worstSignal: null,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Cleanup old signals and optimize memory usage
 */
export async function cleanupSignalHistory() {
  try {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoffTime = Date.now() - maxAge;
    
    // Clean up old signals
    if (botState.signalHistory) {
      const initialCount = botState.signalHistory.length;
      botState.signalHistory = botState.signalHistory.filter(
        signal => new Date(signal.timestamp).getTime() > cutoffTime
      );
      const removedCount = initialCount - botState.signalHistory.length;
      
      if (removedCount > 0) {
        logger.info(`🧹 Cleaned up ${removedCount} old signals`);
      }
    }
    
    // Clean up position history
    if (botState.positions) {
      botState.positions.forEach(position => {
        if (position.pnlHistory && position.pnlHistory.length > 100) {
          position.pnlHistory = position.pnlHistory.slice(-100);
        }
      });
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
  } catch (error) {
    logger.error('❌ Error cleaning up signal history:', error);
  }
}

// Export configuration for external access
export const SIGNAL_CONFIGURATION = SIGNAL_CONFIG;

/**
 * Execute sell signals with enhanced validation
 */
async function executeSellSignals(sellConsensus, sentiment) {
  const { signals, avgStrength, avgConfidence } = sellConsensus;
  
  if (botState.positions.length === 0) {
    logger.warn('⚠️  No positions to sell');
    return;
  }
  
  const confidence = Math.min(95, avgStrength * 0.7 + avgConfidence * 0.3);
  
  logger.info(`📉 Executing SELL signal - Consensus: ${signals.length} timeframes, Strength: ${avgStrength.toFixed(1)}%`);
  
  // Send detailed notification
  const message = formatSellSignalMessage(signals, avgStrength, sentiment);
  await sendTelegramNotification(message);
  
  // Execute trade
  await executeSmartTrade('SELL', confidence);
}

/**
 * Format buy signal notification message
 */
function formatBuySignalMessage(signals, avgStrength, sentiment) {
  const topReasons = [...new Set(signals.flatMap(s => s.reasons))].slice(0, 3);
  
  return `🚀 *Strong BUY Signal*\n\n` +
    `📊 Consensus: ${signals.length} timeframes\n` +
    `💪 Strength: ${avgStrength.toFixed(1)}%\n` +
    `💰 Price: $${botState.currentPrice.toLocaleString()}\n` +
    `🎭 Sentiment: ${sentiment.sentiment}\n` +
    `📈 24h Change: ${botState.change24h?.toFixed(2) || 'N/A'}%\n\n` +
    `🔥 *Top Reasons:*\n${topReasons.map(reason => `• ${reason}`).join('\n')}\n\n` +
    `⏰ ${new Date().toLocaleTimeString()}`;
}

/**
 * Format sell signal notification message
 */
function formatSellSignalMessage(signals, avgStrength, sentiment) {
  const topReasons = [...new Set(signals.flatMap(s => s.reasons))].slice(0, 3);
  
  return `📉 *Strong SELL Signal*\n\n` +
    `📊 Consensus: ${signals.length} timeframes\n` +
    `💪 Strength: ${avgStrength.toFixed(1)}%\n` +
    `💰 Price: $${botState.currentPrice.toLocaleString()}\n` +
    `🎭 Sentiment: ${sentiment.sentiment}\n` +
    `📈 24h Change: ${botState.change24h?.toFixed(2) || 'N/A'}%\n\n` +
    `🔥 *Top Reasons:*\n${topReasons.map(reason => `• ${reason}`).join('\n')}\n\n` +
    `⏰ ${new Date().toLocaleTimeString()}`;
}

/**
 * Enhanced position monitoring with advanced risk management
 */
export async function monitorPositions() {
  if (!botState.positions || botState.positions.length === 0) {
    return;
  }
  
  const currentPrice = botState.currentPrice;
  const monitoringTasks = [];
  
  for (const position of botState.positions) {
    monitoringTasks.push(monitorSinglePosition(position, currentPrice));
  }
  
  await Promise.all(monitoringTasks);
}

/**
 * Monitor individual position with comprehensive risk checks
 */
async function monitorSinglePosition(position, currentPrice) {
  try {
    // Update position metrics
    updatePositionMetrics(position, currentPrice);
    
    // Check for risk-based exit conditions
    const riskCheck = await RiskManager.assessPositionRisk(position);
    
    if (riskCheck.shouldExit) {
      await executePositionExit(position, riskCheck.reason);
      return;
    }
    
    // Check stop loss
    if (position.stopLoss && shouldTriggerStopLoss(position, currentPrice)) {
      await executeStopLoss(position, currentPrice);
      return;
    }
    
    // Check take profit
    if (position.takeProfit && shouldTriggerTakeProfit(position, currentPrice)) {
      await executeTakeProfit(position, currentPrice);
      return;
    }
    
    // Check trailing stop
    if (position.trailingStop && shouldUpdateTrailingStop(position, currentPrice)) {
      updateTrailingStop(position, currentPrice);
    }
    
  } catch (error) {
    logger.error(`❌ Error monitoring position ${position.id}:`, error);
  }
}

/**
 * Update position metrics and PnL
 */
function updatePositionMetrics(position, currentPrice) {
  const priceDiff = currentPrice - position.entryPrice;
  const pnl = priceDiff * position.size;
  const pnlPercentage = (priceDiff / position.entryPrice) * 100;
  
  position.currentPrice = currentPrice;
  position.pnl = position.type === 'BUY' ? pnl : -pnl;
  position.pnlPercentage = position.type === 'BUY' ? pnlPercentage : -pnlPercentage;
  position.lastUpdate = new Date().toISOString();
  
  // Update unrealized P&L tracking
  if (!position.pnlHistory) position.pnlHistory = [];
  position.pnlHistory.push({
    timestamp: Date.now(),
    pnl: position.pnl,
    price: currentPrice
  });
  
  // Keep only last 100 entries
  if (position.pnlHistory.length > 100) {
    position.pnlHistory = position.pnlHistory.slice(-100);
  }
}

/**
 * Check if stop loss should be triggered
 */
function shouldTriggerStopLoss(position, currentPrice) {
  if (!position.stopLoss) return false;
  
  if (position.type === 'BUY') {
    return currentPrice <= position.stopLoss;
  } else {
    return currentPrice >= position.stopLoss;
  }
}

/**
 * Check if take profit should be triggered
 */
function shouldTriggerTakeProfit(position, currentPrice) {
  if (!position.takeProfit) return false;
  
  if (position.type === 'BUY') {
    return currentPrice >= position.takeProfit;
  } else {
    return currentPrice <= position.takeProfit;
  }
}

/**
 * Execute stop loss with detailed logging
 */
async function executeStopLoss(position, currentPrice) {
  logger.warn(`🛑 Stop loss triggered for position ${position.id}`);
  
  const message = `🛑 *Stop Loss Triggered*\n\n` +
    `📍 Position: ${position.symbol}\n` +
    `💰 Entry: $${position.entryPrice.toLocaleString()}\n` +
    `🛑 Stop Loss: $${position.stopLoss.toLocaleString()}\n` +
    `📊 Current: $${currentPrice.toLocaleString()}\n` +
    `📉 Loss: $${Math.abs(position.pnl).toFixed(2)} (${position.pnlPercentage.toFixed(2)}%)\n` +
    `⏰ ${new Date().toLocaleTimeString()}`;
  
  await sendTelegramNotification(message);
  await executeSmartTrade('SELL', 100, position.exchange);
}

/**
 * Execute take profit with detailed logging
 */
async function executeTakeProfit(position, currentPrice) {
  logger.info(`🎯 Take profit triggered for position ${position.id}`);
  
  const message = `🎯 Take Profit Triggered\n\n` +
    `📍 Position: ${position.symbol}\n` +
    `💰 Entry: $${position.entryPrice.toLocaleString()}\n` +
    `🎯 Take Profit: $${position.takeProfit.toLocaleString()}\n` +
    `📊 Current: $${currentPrice.toLocaleString()}\n` +
    `💵 Profit: $${position.pnl.toFixed(2)} (${position.pnlPercentage.toFixed(2)}%)\n` +
    `⏰ ${new Date().toLocaleTimeString()}`;
  
  await sendTelegramNotification(message);
} // <- ADD THIS CLOSING BRACE