import { EventEmitter } from 'events';
import { Signal } from '../models/index.js';
import { v4 as uuidv4 } from 'uuid';

class SignalService extends EventEmitter {
  constructor(marketDataService, mlService) {
    super();
    this.marketDataService = marketDataService;
    this.mlService = mlService;
    this.activeSignals = new Map();
    this.signalHistory = [];
    this.isRunning = false;
    
    // Signal generation configuration
    this.config = {
      minConfidence: 60,
      minStrength: 65,
      timeframes: ['15m', '1h', '4h', '1d'],
      indicators: {
        rsi: { weight: 0.15, oversold: 30, overbought: 70 },
        macd: { weight: 0.12 },
        bb: { weight: 0.10 },
        sma: { weight: 0.10 },
        volume: { weight: 0.08 },
        ml: { weight: 0.35 }
      }
    };
  }

  async initialize() {
    try {
      console.log('🔄 Initializing Signal Service...');
      
      // Load active signals from database
      await this.loadActiveSignals();
      
      // Setup signal generation intervals
      this.setupSignalGeneration();
      
      console.log('✅ Signal Service initialized successfully');
    } catch (error) {
      console.error('❌ Signal Service initialization failed:', error);
      throw error;
    }
  }

  async loadActiveSignals() {
    try {
      const activeSignals = await Signal.findAll({
        where: { status: 'ACTIVE' }
      });

      for (const signal of activeSignals) {
        this.activeSignals.set(signal.id, {
          id: signal.id,
          symbol: signal.symbol,
          timeframe: signal.timeframe,
          signalType: signal.signal_type,
          strength: parseFloat(signal.strength),
          confidence: parseFloat(signal.confidence),
          price: parseFloat(signal.price),
          indicators: signal.indicators || [],
          reasons: signal.reasons || [],
          technicalData: signal.technical_data || {},
          createdAt: signal.created_at,
          metadata: signal.metadata || {}
        });
      }

      console.log(`✅ Loaded ${activeSignals.length} active signals`);
    } catch (error) {
      console.error('❌ Error loading active signals:', error);
    }
  }

  setupSignalGeneration() {
    // Generate signals every 5 minutes
    setInterval(async () => {
      if (this.isRunning) {
        await this.generateSignals();
      }
    }, 5 * 60 * 1000);

    // Clean up expired signals every hour
    setInterval(async () => {
      await this.cleanupExpiredSignals();
    }, 60 * 60 * 1000);
  }

  async generateSignals(symbols = ['BTC/USDT', 'ETH/USDT']) {
    try {
      console.log('🔄 Generating trading signals...');
      
      const newSignals = [];
      
      for (const symbol of symbols) {
        for (const timeframe of this.config.timeframes) {
          try {
            const signal = await this.generateSignalForSymbol(symbol, timeframe);
            if (signal && signal.strength >= this.config.minStrength) {
              newSignals.push(signal);
            }
          } catch (error) {
            console.error(`❌ Error generating signal for ${symbol} ${timeframe}:`, error);
          }
        }
      }

      // Store new signals
      for (const signal of newSignals) {
        await this.storeSignal(signal);
      }

      console.log(`✅ Generated ${newSignals.length} new signals`);
      
      if (newSignals.length > 0) {
        this.emit('signalsGenerated', newSignals);
      }

      return newSignals;
    } catch (error) {
      console.error('❌ Error in signal generation:', error);
      return [];
    }
  }

  async generateSignalForSymbol(symbol, timeframe) {
    try {
      // Get market data
      const marketData = await this.marketDataService.getHistoricalData(symbol, timeframe, 100);
      if (marketData.length < 50) {
        return null;
      }

      // Calculate technical indicators
      const technicalAnalysis = this.calculateTechnicalIndicators(marketData);
      
      // Get ML prediction
      let mlPrediction = null;
      try {
        mlPrediction = await this.mlService.generatePrediction(symbol, timeframe);
      } catch (error) {
        console.warn(`⚠️ ML prediction failed for ${symbol} ${timeframe}:`, error.message);
      }

      // Generate signal based on analysis
      const signal = this.analyzeAndGenerateSignal(
        symbol,
        timeframe,
        marketData,
        technicalAnalysis,
        mlPrediction
      );

      return signal;
    } catch (error) {
      console.error(`❌ Error generating signal for ${symbol} ${timeframe}:`, error);
      return null;
    }
  }

  calculateTechnicalIndicators(data) {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    return {
      rsi: this.calculateRSI(closes, 14),
      macd: this.calculateMACD(closes),
      bollingerBands: this.calculateBollingerBands(closes, 20, 2),
      sma20: this.calculateSMA(closes, 20),
      sma50: this.calculateSMA(closes, 50),
      ema12: this.calculateEMA(closes, 12),
      ema26: this.calculateEMA(closes, 26),
      stochastic: this.calculateStochastic(highs, lows, closes, 14),
      volumeRatio: this.calculateVolumeRatio(volumes),
      atr: this.calculateATR(highs, lows, closes, 14),
      currentPrice: closes[closes.length - 1],
      priceChange: closes[closes.length - 1] - closes[closes.length - 2],
      priceChangePercent: ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
    };
  }

  analyzeAndGenerateSignal(symbol, timeframe, marketData, technical, mlPrediction) {
    const signals = [];
    const reasons = [];
    const indicators = [];
    let totalScore = 0;
    let maxScore = 0;

    // RSI Analysis
    const rsiScore = this.analyzeRSI(technical.rsi, signals, reasons, indicators);
    totalScore += rsiScore * this.config.indicators.rsi.weight;
    maxScore += this.config.indicators.rsi.weight;

    // MACD Analysis
    const macdScore = this.analyzeMACD(technical.macd, signals, reasons, indicators);
    totalScore += macdScore * this.config.indicators.macd.weight;
    maxScore += this.config.indicators.macd.weight;

    // Bollinger Bands Analysis
    const bbScore = this.analyzeBollingerBands(technical.bollingerBands, technical.currentPrice, signals, reasons, indicators);
    totalScore += bbScore * this.config.indicators.bb.weight;
    maxScore += this.config.indicators.bb.weight;

    // Moving Averages Analysis
    const smaScore = this.analyzeMovingAverages(technical, signals, reasons, indicators);
    totalScore += smaScore * this.config.indicators.sma.weight;
    maxScore += this.config.indicators.sma.weight;

    // Volume Analysis
    const volumeScore = this.analyzeVolume(technical.volumeRatio, signals, reasons, indicators);
    totalScore += volumeScore * this.config.indicators.volume.weight;
    maxScore += this.config.indicators.volume.weight;

    // ML Prediction Analysis
    const mlScore = this.analyzeMLPrediction(mlPrediction, signals, reasons, indicators);
    totalScore += mlScore * this.config.indicators.ml.weight;
    maxScore += this.config.indicators.ml.weight;

    // Determine final signal
    const strength = (totalScore / maxScore) * 100;
    const signalType = this.determineSignalType(signals);
    const confidence = this.calculateConfidence(strength, indicators.length, mlPrediction);

    if (strength < this.config.minStrength || confidence < this.config.minConfidence) {
      return null;
    }

    return {
      id: uuidv4(),
      symbol,
      timeframe,
      signalType,
      strength,
      confidence,
      price: technical.currentPrice,
      indicators,
      reasons,
      technicalData: {
        rsi: technical.rsi[technical.rsi.length - 1],
        macd: {
          macd: technical.macd.macd[technical.macd.macd.length - 1],
          signal: technical.macd.signal[technical.macd.signal.length - 1],
          histogram: technical.macd.histogram[technical.macd.histogram.length - 1]
        },
        bollingerBands: {
          upper: technical.bollingerBands.upper[technical.bollingerBands.upper.length - 1],
          middle: technical.bollingerBands.middle[technical.bollingerBands.middle.length - 1],
          lower: technical.bollingerBands.lower[technical.bollingerBands.lower.length - 1]
        },
        sma20: technical.sma20[technical.sma20.length - 1],
        sma50: technical.sma50[technical.sma50.length - 1],
        volumeRatio: technical.volumeRatio,
        atr: technical.atr
      },
      mlPrediction: mlPrediction ? {
        direction: mlPrediction.direction,
        confidence: mlPrediction.confidence,
        predictedPrice: mlPrediction.predictedPrice,
        priceChangePercent: mlPrediction.priceChangePercent
      } : null,
      createdAt: new Date(),
      metadata: {
        dataPoints: marketData.length,
        totalScore,
        maxScore,
        version: '2.0'
      }
    };
  }

  analyzeRSI(rsi, signals, reasons, indicators) {
    const currentRSI = rsi[rsi.length - 1];
    const prevRSI = rsi[rsi.length - 2];
    
    if (currentRSI < this.config.indicators.rsi.oversold) {
      signals.push('BUY');
      reasons.push(`RSI oversold (${currentRSI.toFixed(1)})`);
      indicators.push('RSI_OVERSOLD');
      return 1;
    } else if (currentRSI > this.config.indicators.rsi.overbought) {
      signals.push('SELL');
      reasons.push(`RSI overbought (${currentRSI.toFixed(1)})`);
      indicators.push('RSI_OVERBOUGHT');
      return 1;
    } else if (currentRSI > prevRSI && currentRSI > 50) {
      signals.push('BUY');
      reasons.push('RSI trending up');
      indicators.push('RSI_BULLISH');
      return 0.5;
    } else if (currentRSI < prevRSI && currentRSI < 50) {
      signals.push('SELL');
      reasons.push('RSI trending down');
      indicators.push('RSI_BEARISH');
      return 0.5;
    }
    
    return 0;
  }

  analyzeMACD(macd, signals, reasons, indicators) {
    const currentMACD = macd.macd[macd.macd.length - 1];
    const currentSignal = macd.signal[macd.signal.length - 1];
    const currentHistogram = macd.histogram[macd.histogram.length - 1];
    const prevHistogram = macd.histogram[macd.histogram.length - 2];
    
    // MACD crossover
    if (currentHistogram > 0 && prevHistogram <= 0) {
      signals.push('BUY');
      reasons.push('MACD bullish crossover');
      indicators.push('MACD_BULLISH_CROSSOVER');
      return 1;
    } else if (currentHistogram < 0 && prevHistogram >= 0) {
      signals.push('SELL');
      reasons.push('MACD bearish crossover');
      indicators.push('MACD_BEARISH_CROSSOVER');
      return 1;
    } else if (currentMACD > currentSignal && currentHistogram > prevHistogram) {
      signals.push('BUY');
      reasons.push('MACD strengthening bullish');
      indicators.push('MACD_BULLISH');
      return 0.6;
    } else if (currentMACD < currentSignal && currentHistogram < prevHistogram) {
      signals.push('SELL');
      reasons.push('MACD strengthening bearish');
      indicators.push('MACD_BEARISH');
      return 0.6;
    }
    
    return 0;
  }

  analyzeBollingerBands(bb, currentPrice, signals, reasons, indicators) {
    const upper = bb.upper[bb.upper.length - 1];
    const middle = bb.middle[bb.middle.length - 1];
    const lower = bb.lower[bb.lower.length - 1];
    
    const position = (currentPrice - lower) / (upper - lower);
    
    if (currentPrice <= lower) {
      signals.push('BUY');
      reasons.push('Price at Bollinger lower band');
      indicators.push('BB_OVERSOLD');
      return 1;
    } else if (currentPrice >= upper) {
      signals.push('SELL');
      reasons.push('Price at Bollinger upper band');
      indicators.push('BB_OVERBOUGHT');
      return 1;
    } else if (position < 0.2) {
      signals.push('BUY');
      reasons.push('Price near Bollinger lower band');
      indicators.push('BB_NEAR_LOWER');
      return 0.5;
    } else if (position > 0.8) {
      signals.push('SELL');
      reasons.push('Price near Bollinger upper band');
      indicators.push('BB_NEAR_UPPER');
      return 0.5;
    }
    
    return 0;
  }

  analyzeMovingAverages(technical, signals, reasons, indicators) {
    const { currentPrice, sma20, sma50, ema12, ema26 } = technical;
    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];
    const currentEMA12 = ema12[ema12.length - 1];
    const currentEMA26 = ema26[ema26.length - 1];
    
    let score = 0;
    
    // Price vs SMAs
    if (currentPrice > currentSMA20 && currentSMA20 > currentSMA50) {
      signals.push('BUY');
      reasons.push('Price above moving averages');
      indicators.push('MA_BULLISH');
      score += 0.6;
    } else if (currentPrice < currentSMA20 && currentSMA20 < currentSMA50) {
      signals.push('SELL');
      reasons.push('Price below moving averages');
      indicators.push('MA_BEARISH');
      score += 0.6;
    }
    
    // EMA crossover
    if (currentEMA12 > currentEMA26) {
      const prevEMA12 = ema12[ema12.length - 2];
      const prevEMA26 = ema26[ema26.length - 2];
      
      if (prevEMA12 <= prevEMA26) {
        signals.push('BUY');
        reasons.push('EMA bullish crossover');
        indicators.push('EMA_BULLISH_CROSSOVER');
        score += 0.4;
      }
    } else if (currentEMA12 < currentEMA26) {
      const prevEMA12 = ema12[ema12.length - 2];
      const prevEMA26 = ema26[ema26.length - 2];
      
      if (prevEMA12 >= prevEMA26) {
        signals.push('SELL');
        reasons.push('EMA bearish crossover');
        indicators.push('EMA_BEARISH_CROSSOVER');
        score += 0.4;
      }
    }
    
    return score;
  }

  analyzeVolume(volumeRatio, signals, reasons, indicators) {
    if (volumeRatio > 1.5) {
      reasons.push(`High volume (${volumeRatio.toFixed(1)}x)`);
      indicators.push('HIGH_VOLUME');
      return 0.5; // Volume confirms other signals
    } else if (volumeRatio < 0.5) {
      reasons.push('Low volume');
      indicators.push('LOW_VOLUME');
      return -0.2; // Low volume weakens signals
    }
    
    return 0;
  }

  analyzeMLPrediction(mlPrediction, signals, reasons, indicators) {
    if (!mlPrediction || mlPrediction.confidence < 60) {
      return 0;
    }
    
    const confidenceScore = mlPrediction.confidence / 100;
    
    if (mlPrediction.direction === 'BULLISH') {
      signals.push('BUY');
      reasons.push(`AI predicts ${mlPrediction.priceChangePercent.toFixed(2)}% increase`);
      indicators.push('ML_BULLISH');
      return confidenceScore;
    } else if (mlPrediction.direction === 'BEARISH') {
      signals.push('SELL');
      reasons.push(`AI predicts ${mlPrediction.priceChangePercent.toFixed(2)}% decrease`);
      indicators.push('ML_BEARISH');
      return confidenceScore;
    }
    
    return 0;
  }

  determineSignalType(signals) {
    const buyCount = signals.filter(s => s === 'BUY').length;
    const sellCount = signals.filter(s => s === 'SELL').length;
    
    if (buyCount > sellCount) return 'BUY';
    if (sellCount > buyCount) return 'SELL';
    return 'HOLD';
  }

  calculateConfidence(strength, indicatorCount, mlPrediction) {
    let confidence = strength;
    
    // Boost confidence with more indicators
    confidence += Math.min(20, indicatorCount * 2);
    
    // Boost confidence with ML prediction
    if (mlPrediction && mlPrediction.confidence > 70) {
      confidence += 10;
    }
    
    return Math.min(95, confidence);
  }

  async storeSignal(signal) {
    try {
      // Store in database
      await Signal.create({
        id: signal.id,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        signal_type: signal.signalType,
        strength: signal.strength,
        confidence: signal.confidence,
        price: signal.price,
        indicators: signal.indicators,
        reasons: signal.reasons,
        technical_data: signal.technicalData,
        status: 'ACTIVE',
        metadata: signal.metadata
      });

      // Store in memory
      this.activeSignals.set(signal.id, signal);
      
      // Add to history
      this.signalHistory.unshift(signal);
      if (this.signalHistory.length > 1000) {
        this.signalHistory = this.signalHistory.slice(0, 1000);
      }

      console.log(`✅ Signal stored: ${signal.symbol} ${signal.timeframe} ${signal.signalType} (${signal.strength.toFixed(1)}%)`);
    } catch (error) {
      console.error('❌ Error storing signal:', error);
    }
  }

  async cleanupExpiredSignals() {
    try {
      const expiredTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      // Update expired signals in database
      await Signal.update(
        { status: 'EXPIRED' },
        {
          where: {
            status: 'ACTIVE',
            created_at: { [Op.lt]: expiredTime }
          }
        }
      );

      // Remove from memory
      for (const [id, signal] of this.activeSignals.entries()) {
        if (new Date(signal.createdAt) < expiredTime) {
          this.activeSignals.delete(id);
        }
      }

      console.log('✅ Expired signals cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up expired signals:', error);
    }
  }

  async getActiveSignals(symbol = null, timeframe = null) {
    let signals = Array.from(this.activeSignals.values());
    
    if (symbol) {
      signals = signals.filter(s => s.symbol === symbol);
    }
    
    if (timeframe) {
      signals = signals.filter(s => s.timeframe === timeframe);
    }
    
    return signals.sort((a, b) => b.strength - a.strength);
  }

  async getSignalHistory(limit = 100) {
    return this.signalHistory.slice(0, limit);
  }

  // Technical indicator calculations (same as in MLService)
  calculateRSI(prices, period = 14) {
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    const rsi = [];
    for (let i = period - 1; i < gains.length; i++) {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
    
    return rsi;
  }

  calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const emaFast = this.calculateEMA(prices, fastPeriod);
    const emaSlow = this.calculateEMA(prices, slowPeriod);
    
    const macdLine = [];
    const startIndex = Math.max(fastPeriod, slowPeriod) - 1;
    
    for (let i = startIndex; i < prices.length; i++) {
      macdLine.push(emaFast[i - startIndex] - emaSlow[i - startIndex]);
    }
    
    const signalLine = this.calculateEMA(macdLine, signalPeriod);
    const histogram = macdLine.map((val, i) => val - (signalLine[i] || 0));
    
    return { macd: macdLine, signal: signalLine, histogram };
  }

  calculateEMA(prices, period) {
    const multiplier = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    }
    
    return ema;
  }

  calculateSMA(prices, period) {
    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
      sma.push(sum / period);
    }
    return sma;
  }

  calculateBollingerBands(prices, period = 20, multiplier = 2) {
    const sma = this.calculateSMA(prices, period);
    const upper = [];
    const lower = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = sma[i - period + 1];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      
      upper.push(mean + (stdDev * multiplier));
      lower.push(mean - (stdDev * multiplier));
    }
    
    return { upper, lower, middle: sma };
  }

  calculateStochastic(highs, lows, closes, period = 14) {
    const k = [];
    
    for (let i = period - 1; i < closes.length; i++) {
      const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
      const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
      
      const kValue = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
      k.push(kValue);
    }
    
    return { k, d: this.calculateSMA(k, 3) };
  }

  calculateVolumeRatio(volumes) {
    if (volumes.length < 20) return 1;
    
    const recentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b) / 20;
    
    return recentVolume / avgVolume;
  }

  calculateATR(highs, lows, closes, period = 14) {
    const trueRanges = [];
    
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    
    if (trueRanges.length < period) return 0;
    
    return trueRanges.slice(-period).reduce((a, b) => a + b) / period;
  }

  startSignalGeneration() {
    this.isRunning = true;
    console.log('🚀 Signal generation started');
    this.emit('signalGenerationStarted');
  }

  stopSignalGeneration() {
    this.isRunning = false;
    console.log('🛑 Signal generation stopped');
    this.emit('signalGenerationStopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      activeSignals: this.activeSignals.size,
      signalHistory: this.signalHistory.length,
      config: this.config
    };
  }

  async cleanup() {
    console.log('🔄 Cleaning up Signal Service...');
    
    this.stopSignalGeneration();
    this.activeSignals.clear();
    this.signalHistory = [];
    
    console.log('✅ Signal Service cleanup completed');
  }
}

export default SignalService;