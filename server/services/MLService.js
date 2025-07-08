import * as tf from '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';
import { Prediction } from '../models/index.js';

class MLService extends EventEmitter {
  constructor(marketDataService) {
    super();
    this.marketDataService = marketDataService;
    this.models = new Map();
    this.isTraining = new Map();
    this.trainingHistory = [];
    this.predictionCache = new Map();
    this.featureExtractors = new Map();
  }

  async initialize() {
    try {
      console.log('🔄 Initializing ML Service...');
      
      // Initialize TensorFlow backend
      await tf.ready();
      console.log('✅ TensorFlow backend ready');
      
      // Initialize feature extractors
      this.initializeFeatureExtractors();
      
      console.log('✅ ML Service initialized successfully');
    } catch (error) {
      console.error('❌ ML Service initialization failed:', error);
      throw error;
    }
  }

  initializeFeatureExtractors() {
    // Technical indicators feature extractor
    this.featureExtractors.set('technical', {
      extract: (data) => this.extractTechnicalFeatures(data),
      featureCount: 15
    });

    // Price action feature extractor
    this.featureExtractors.set('priceAction', {
      extract: (data) => this.extractPriceActionFeatures(data),
      featureCount: 8
    });

    // Volume feature extractor
    this.featureExtractors.set('volume', {
      extract: (data) => this.extractVolumeFeatures(data),
      featureCount: 5
    });
  }

  extractTechnicalFeatures(data) {
    if (data.length < 50) return null;

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    // RSI
    const rsi = this.calculateRSI(closes, 14);
    
    // MACD
    const macd = this.calculateMACD(closes);
    
    // Bollinger Bands
    const bb = this.calculateBollingerBands(closes, 20, 2);
    
    // Moving Averages
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    
    // Stochastic
    const stoch = this.calculateStochastic(highs, lows, closes, 14);
    
    // Volume indicators
    const volumeSMA = this.calculateSMA(volumes, 20);
    const volumeRatio = volumes[volumes.length - 1] / volumeSMA[volumeSMA.length - 1];

    const currentPrice = closes[closes.length - 1];
    
    return [
      rsi[rsi.length - 1] / 100, // Normalize RSI
      macd.macd[macd.macd.length - 1],
      macd.signal[macd.signal.length - 1],
      macd.histogram[macd.histogram.length - 1],
      (currentPrice - bb.lower[bb.lower.length - 1]) / (bb.upper[bb.upper.length - 1] - bb.lower[bb.lower.length - 1]), // BB position
      currentPrice / sma20[sma20.length - 1], // Price vs SMA20
      currentPrice / sma50[sma50.length - 1], // Price vs SMA50
      currentPrice / ema12[ema12.length - 1], // Price vs EMA12
      currentPrice / ema26[ema26.length - 1], // Price vs EMA26
      sma20[sma20.length - 1] / sma50[sma50.length - 1], // SMA20 vs SMA50
      stoch.k[stoch.k.length - 1] / 100, // Normalize Stochastic K
      stoch.d[stoch.d.length - 1] / 100, // Normalize Stochastic D
      Math.min(volumeRatio, 5) / 5, // Normalize volume ratio (cap at 5x)
      this.calculateVolatility(closes.slice(-20)) * 100, // 20-period volatility
      this.calculateMomentum(closes, 10) // 10-period momentum
    ];
  }

  extractPriceActionFeatures(data) {
    if (data.length < 20) return null;

    const recent = data.slice(-20);
    const closes = recent.map(d => d.close);
    const highs = recent.map(d => d.high);
    const lows = recent.map(d => d.low);
    const opens = recent.map(d => d.open);

    return [
      this.calculateTrend(closes, 10), // 10-period trend
      this.calculateSupport(lows), // Support level strength
      this.calculateResistance(highs), // Resistance level strength
      this.calculateCandlePattern(opens, highs, lows, closes), // Candlestick pattern
      this.calculateGapAnalysis(opens, closes), // Gap analysis
      this.calculateBreakoutPotential(highs, lows), // Breakout potential
      this.calculateMeanReversion(closes), // Mean reversion indicator
      this.calculateTrendStrength(closes) // Trend strength
    ];
  }

  extractVolumeFeatures(data) {
    if (data.length < 20) return null;

    const volumes = data.map(d => d.volume);
    const closes = data.map(d => d.close);

    return [
      this.calculateVolumeProfile(volumes), // Volume profile
      this.calculateVolumeWeightedPrice(volumes, closes), // VWAP
      this.calculateOnBalanceVolume(volumes, closes), // OBV
      this.calculateVolumeOscillator(volumes), // Volume oscillator
      this.calculateAccumulationDistribution(data) // A/D Line
    ];
  }

  async trainModel(symbol, timeframe, modelType = 'lstm') {
    const modelKey = `${symbol}_${timeframe}_${modelType}`;
    
    if (this.isTraining.get(modelKey)) {
      console.warn(`⚠️ Model ${modelKey} is already training`);
      return null;
    }

    try {
      console.log(`🔄 Training model ${modelKey}...`);
      this.isTraining.set(modelKey, true);

      // Get training data
      const data = await this.marketDataService.getHistoricalData(symbol, timeframe, 2000);
      if (data.length < 500) {
        throw new Error(`Insufficient data for training: ${data.length} candles`);
      }

      // Prepare features and labels
      const { features, labels, scaler } = await this.prepareTrainingData(data);
      
      // Create model
      const model = this.createModel(modelType, features.shape);
      
      // Train model
      const history = await this.trainModelWithData(model, features, labels);
      
      // Store model and metadata
      this.models.set(modelKey, {
        model,
        scaler,
        modelType,
        symbol,
        timeframe,
        trainedAt: new Date(),
        trainingHistory: history,
        inputShape: features.shape,
        accuracy: this.calculateAccuracy(history)
      });

      // Store training history
      this.trainingHistory.push({
        modelKey,
        symbol,
        timeframe,
        modelType,
        accuracy: this.calculateAccuracy(history),
        loss: history.history.loss[history.history.loss.length - 1],
        valLoss: history.history.val_loss[history.history.val_loss.length - 1],
        epochs: history.epoch.length,
        trainedAt: new Date(),
        dataSize: features.shape[0]
      });

      console.log(`✅ Model ${modelKey} trained successfully`);
      this.emit('modelTrained', { modelKey, symbol, timeframe, modelType });

      return this.models.get(modelKey);
    } catch (error) {
      console.error(`❌ Error training model ${modelKey}:`, error);
      throw error;
    } finally {
      this.isTraining.set(modelKey, false);
    }
  }

  async prepareTrainingData(data) {
    const lookback = 60; // 60 periods lookback
    const features = [];
    const labels = [];

    // Extract all features for each data point
    for (let i = lookback; i < data.length; i++) {
      const sequence = data.slice(i - lookback, i);
      
      // Extract features for each time step in the sequence
      const sequenceFeatures = [];
      for (let j = 20; j < sequence.length; j++) { // Start from 20 to have enough data for indicators
        const windowData = sequence.slice(0, j + 1);
        
        const techFeatures = this.featureExtractors.get('technical').extract(windowData);
        const priceFeatures = this.featureExtractors.get('priceAction').extract(windowData);
        const volumeFeatures = this.featureExtractors.get('volume').extract(windowData);
        
        if (techFeatures && priceFeatures && volumeFeatures) {
          sequenceFeatures.push([...techFeatures, ...priceFeatures, ...volumeFeatures]);
        }
      }
      
      if (sequenceFeatures.length === lookback - 20) {
        features.push(sequenceFeatures);
        labels.push(data[i].close);
      }
    }

    // Convert to tensors
    const featureTensor = tf.tensor3d(features);
    const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

    // Normalize features
    const { normalizedFeatures, scaler } = this.normalizeFeatures(featureTensor);

    return {
      features: normalizedFeatures,
      labels: labelTensor,
      scaler
    };
  }

  createModel(modelType, inputShape) {
    const model = tf.sequential();

    switch (modelType) {
      case 'lstm':
        // LSTM layers
        model.add(tf.layers.lstm({
          units: 128,
          returnSequences: true,
          inputShape: [inputShape[1], inputShape[2]],
          dropout: 0.2,
          recurrentDropout: 0.2
        }));

        model.add(tf.layers.lstm({
          units: 64,
          returnSequences: true,
          dropout: 0.2,
          recurrentDropout: 0.2
        }));

        model.add(tf.layers.lstm({
          units: 32,
          returnSequences: false,
          dropout: 0.2,
          recurrentDropout: 0.2
        }));

        // Dense layers
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 1, activation: 'linear' }));
        break;

      case 'gru':
        // GRU layers
        model.add(tf.layers.gru({
          units: 128,
          returnSequences: true,
          inputShape: [inputShape[1], inputShape[2]],
          dropout: 0.2,
          recurrentDropout: 0.2
        }));

        model.add(tf.layers.gru({
          units: 64,
          returnSequences: false,
          dropout: 0.2,
          recurrentDropout: 0.2
        }));

        model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 1, activation: 'linear' }));
        break;

      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }

    // Compile model
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    return model;
  }

  async trainModelWithData(model, features, labels) {
    const callbacks = {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0) {
          console.log(`Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}`);
        }
      }
    };

    return await model.fit(features, labels, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      shuffle: true,
      callbacks
    });
  }

  normalizeFeatures(features) {
    // Simple min-max normalization
    const min = features.min(0, true);
    const max = features.max(0, true);
    const range = max.sub(min);
    
    const normalizedFeatures = features.sub(min).div(range.add(1e-8));
    
    return {
      normalizedFeatures,
      scaler: { min, max, range }
    };
  }

  async generatePrediction(symbol, timeframe, modelType = 'lstm') {
    const modelKey = `${symbol}_${timeframe}_${modelType}`;
    const modelData = this.models.get(modelKey);

    if (!modelData) {
      throw new Error(`Model ${modelKey} not found. Please train the model first.`);
    }

    try {
      // Get recent data
      const data = await this.marketDataService.getHistoricalData(symbol, timeframe, 100);
      if (data.length < 60) {
        throw new Error('Insufficient data for prediction');
      }

      // Prepare input features
      const inputFeatures = this.prepareInputFeatures(data, modelData.scaler);
      
      // Make prediction
      const prediction = modelData.model.predict(inputFeatures);
      const predictedPrice = await prediction.data();

      // Calculate additional metrics
      const currentPrice = data[data.length - 1].close;
      const priceChange = predictedPrice[0] - currentPrice;
      const priceChangePercent = (priceChange / currentPrice) * 100;
      const direction = priceChange > 0 ? 'BULLISH' : 'BEARISH';
      
      // Calculate confidence based on model accuracy and prediction strength
      const confidence = this.calculatePredictionConfidence(
        modelData.accuracy,
        Math.abs(priceChangePercent),
        data
      );

      const predictionResult = {
        symbol,
        timeframe,
        modelName: modelKey,
        currentPrice,
        predictedPrice: predictedPrice[0],
        priceChange,
        priceChangePercent,
        direction,
        confidence,
        signalStrength: Math.min(100, Math.abs(priceChangePercent) * 10),
        timestamp: new Date(),
        predictionHorizon: this.getPredictionHorizon(timeframe),
        featuresUsed: this.getFeatureNames(),
        modelMetadata: {
          accuracy: modelData.accuracy,
          trainedAt: modelData.trainedAt,
          modelType: modelData.modelType
        }
      };

      // Store prediction in database
      await Prediction.create(predictionResult);

      // Cache prediction
      this.predictionCache.set(modelKey, predictionResult);

      // Clean up tensors
      prediction.dispose();
      inputFeatures.dispose();

      return predictionResult;
    } catch (error) {
      console.error(`❌ Error generating prediction for ${modelKey}:`, error);
      throw error;
    }
  }

  prepareInputFeatures(data, scaler) {
    const lookback = 60;
    const sequence = data.slice(-lookback);
    
    const sequenceFeatures = [];
    for (let i = 20; i < sequence.length; i++) {
      const windowData = sequence.slice(0, i + 1);
      
      const techFeatures = this.featureExtractors.get('technical').extract(windowData);
      const priceFeatures = this.featureExtractors.get('priceAction').extract(windowData);
      const volumeFeatures = this.featureExtractors.get('volume').extract(windowData);
      
      if (techFeatures && priceFeatures && volumeFeatures) {
        sequenceFeatures.push([...techFeatures, ...priceFeatures, ...volumeFeatures]);
      }
    }

    const inputTensor = tf.tensor3d([sequenceFeatures]);
    
    // Apply normalization
    const normalizedInput = inputTensor.sub(scaler.min).div(scaler.range.add(1e-8));
    
    inputTensor.dispose();
    
    return normalizedInput;
  }

  calculatePredictionConfidence(modelAccuracy, predictionStrength, data) {
    // Base confidence from model accuracy
    let confidence = modelAccuracy;
    
    // Adjust based on prediction strength
    const strengthBonus = Math.min(20, predictionStrength * 2);
    confidence += strengthBonus;
    
    // Adjust based on market volatility
    const volatility = this.calculateVolatility(data.slice(-20).map(d => d.close));
    const volatilityPenalty = Math.min(15, volatility * 100);
    confidence -= volatilityPenalty;
    
    return Math.max(10, Math.min(95, confidence));
  }

  getPredictionHorizon(timeframe) {
    const horizons = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '1h': 60,
      '4h': 240,
      '1d': 1440
    };
    
    return horizons[timeframe] || 60;
  }

  getFeatureNames() {
    return [
      'RSI', 'MACD', 'MACD_Signal', 'MACD_Histogram', 'BB_Position',
      'Price_SMA20', 'Price_SMA50', 'Price_EMA12', 'Price_EMA26', 'SMA_Ratio',
      'Stoch_K', 'Stoch_D', 'Volume_Ratio', 'Volatility', 'Momentum',
      'Trend', 'Support', 'Resistance', 'Candle_Pattern', 'Gap_Analysis',
      'Breakout_Potential', 'Mean_Reversion', 'Trend_Strength',
      'Volume_Profile', 'VWAP', 'OBV', 'Volume_Oscillator', 'A/D_Line'
    ];
  }

  // Technical indicator calculations
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
    const d = [];
    
    for (let i = period - 1; i < closes.length; i++) {
      const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
      const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
      
      const kValue = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
      k.push(kValue);
    }
    
    // Calculate %D as 3-period SMA of %K
    for (let i = 2; i < k.length; i++) {
      const dValue = (k[i] + k[i - 1] + k[i - 2]) / 3;
      d.push(dValue);
    }
    
    return { k, d };
  }

  calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  calculateMomentum(prices, period) {
    if (prices.length < period + 1) return 0;
    return (prices[prices.length - 1] - prices[prices.length - 1 - period]) / prices[prices.length - 1 - period];
  }

  // Placeholder implementations for price action features
  calculateTrend(prices, period) {
    if (prices.length < period) return 0;
    const start = prices[prices.length - period];
    const end = prices[prices.length - 1];
    return (end - start) / start;
  }

  calculateSupport(lows) {
    return Math.min(...lows.slice(-10));
  }

  calculateResistance(highs) {
    return Math.max(...highs.slice(-10));
  }

  calculateCandlePattern(opens, highs, lows, closes) {
    // Simplified candlestick pattern recognition
    const last = closes.length - 1;
    const bodySize = Math.abs(closes[last] - opens[last]);
    const shadowSize = highs[last] - lows[last];
    return bodySize / shadowSize;
  }

  calculateGapAnalysis(opens, closes) {
    if (opens.length < 2) return 0;
    const gap = opens[opens.length - 1] - closes[closes.length - 2];
    return gap / closes[closes.length - 2];
  }

  calculateBreakoutPotential(highs, lows) {
    const recentHigh = Math.max(...highs.slice(-5));
    const recentLow = Math.min(...lows.slice(-5));
    const range = recentHigh - recentLow;
    return range / recentHigh;
  }

  calculateMeanReversion(prices) {
    const sma = this.calculateSMA(prices, 20);
    const currentPrice = prices[prices.length - 1];
    const meanPrice = sma[sma.length - 1];
    return (currentPrice - meanPrice) / meanPrice;
  }

  calculateTrendStrength(prices) {
    const trend = this.calculateTrend(prices, 10);
    return Math.abs(trend);
  }

  // Placeholder implementations for volume features
  calculateVolumeProfile(volumes) {
    const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
    return volumes[volumes.length - 1] / avgVolume;
  }

  calculateVolumeWeightedPrice(volumes, prices) {
    let totalVolume = 0;
    let totalValue = 0;
    
    for (let i = 0; i < volumes.length; i++) {
      totalVolume += volumes[i];
      totalValue += volumes[i] * prices[i];
    }
    
    return totalValue / totalVolume;
  }

  calculateOnBalanceVolume(volumes, prices) {
    let obv = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) {
        obv += volumes[i];
      } else if (prices[i] < prices[i - 1]) {
        obv -= volumes[i];
      }
    }
    return obv;
  }

  calculateVolumeOscillator(volumes) {
    const shortMA = this.calculateSMA(volumes, 5);
    const longMA = this.calculateSMA(volumes, 20);
    if (shortMA.length === 0 || longMA.length === 0) return 0;
    return (shortMA[shortMA.length - 1] - longMA[longMA.length - 1]) / longMA[longMA.length - 1];
  }

  calculateAccumulationDistribution(data) {
    let ad = 0;
    for (const candle of data) {
      const clv = ((candle.close - candle.low) - (candle.high - candle.close)) / (candle.high - candle.low);
      ad += clv * candle.volume;
    }
    return ad;
  }

  calculateAccuracy(history) {
    const finalLoss = history.history.loss[history.history.loss.length - 1];
    return Math.max(0, 100 - (finalLoss * 100));
  }

  getModelStatus() {
    const status = {};
    
    for (const [key, model] of this.models.entries()) {
      status[key] = {
        symbol: model.symbol,
        timeframe: model.timeframe,
        modelType: model.modelType,
        accuracy: model.accuracy,
        trainedAt: model.trainedAt,
        isTraining: this.isTraining.get(key) || false
      };
    }
    
    return status;
  }

  async cleanup() {
    console.log('🔄 Cleaning up ML Service...');
    
    // Dispose all models
    for (const [key, modelData] of this.models.entries()) {
      if (modelData.model) {
        modelData.model.dispose();
      }
    }
    
    this.models.clear();
    this.predictionCache.clear();
    this.isTraining.clear();
    
    console.log('✅ ML Service cleanup completed');
  }
}

export default MLService;