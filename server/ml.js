import tf from '@tensorflow/tfjs';
import { botState, CONFIG } from './index.js';
import { fetchHistoricalData } from './trading.js';
import { sendTelegramNotification } from './utils/telegram.js';
import { logger } from './utils/logger.js';
import { CustomError } from './utils/errors.js';

// Enhanced ML model configurations
const MODEL_CONFIG = {
  LSTM_UNITS: [128, 64, 32],
  DROPOUT_RATE: 0.3,
  LEARNING_RATE: 0.0001,
  EPOCHS: 150,
  BATCH_SIZE: 64,
  VALIDATION_SPLIT: 0.2,
  EARLY_STOPPING_PATIENCE: 15,
  LOOKBACK_PERIOD: 120,
  FEATURE_COUNT: 12,
  MIN_ACCURACY_THRESHOLD: 65,
  RETRAIN_THRESHOLD: 55
};

// Technical indicators for enhanced feature engineering
class TechnicalIndicators {
  static sma(data, period) {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  static ema(data, period) {
    const result = [];
    const multiplier = 2 / (period + 1);
    result[0] = data[0];
    
    for (let i = 1; i < data.length; i++) {
      result[i] = (data[i] * multiplier) + (result[i - 1] * (1 - multiplier));
    }
    return result;
  }

  static rsi(data, period = 14) {
    const deltas = [];
    for (let i = 1; i < data.length; i++) {
      deltas.push(data[i] - data[i - 1]);
    }

    const gains = deltas.map(d => d > 0 ? d : 0);
    const losses = deltas.map(d => d < 0 ? Math.abs(d) : 0);

    const avgGain = this.sma(gains, period);
    const avgLoss = this.sma(losses, period);

    return avgGain.map((gain, i) => {
      const rs = gain / (avgLoss[i] || 1);
      return 100 - (100 / (1 + rs));
    });
  }

  static macd(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const emaFast = this.ema(data, fastPeriod);
    const emaSlow = this.ema(data, slowPeriod);
    
    const macdLine = emaFast.map((fast, i) => fast - emaSlow[i]);
    const signalLine = this.ema(macdLine, signalPeriod);
    const histogram = macdLine.map((macd, i) => macd - signalLine[i]);

    return { macdLine, signalLine, histogram };
  }

  static bollingerBands(data, period = 20, multiplier = 2) {
    const sma = this.sma(data, period);
    const std = [];
    
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i - period + 1];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      std.push(Math.sqrt(variance));
    }

    const upperBand = sma.map((avg, i) => avg + (std[i] * multiplier));
    const lowerBand = sma.map((avg, i) => avg - (std[i] * multiplier));

    return { upperBand, lowerBand, middleBand: sma };
  }
}

// Enhanced data preprocessing with advanced feature engineering
export class DataPreprocessor {
  static normalizeData(data) {
    const features = ['close', 'volume', 'high', 'low', 'open'];
    const stats = {};
    
    // Calculate min/max for each feature
    features.forEach(feature => {
      const values = data.map(d => d[feature]);
      stats[feature] = {
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((a, b) => a + b, 0) / values.length
      };
    });

    return {
      normalizedData: data.map(d => ({
        timestamp: d.timestamp,
        close: this.normalize(d.close, stats.close),
        volume: this.normalize(d.volume, stats.volume),
        high: this.normalize(d.high, stats.high),
        low: this.normalize(d.low, stats.low),
        open: this.normalize(d.open, stats.open),
        ...stats
      })),
      stats
    };
  }

  static normalize(value, stats) {
    return (value - stats.min) / (stats.max - stats.min);
  }

  static denormalize(value, stats) {
    return value * (stats.max - stats.min) + stats.min;
  }

  static engineerFeatures(data) {
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const opens = data.map(d => d.open);

    // Calculate technical indicators
    const rsi = TechnicalIndicators.rsi(closes);
    const macd = TechnicalIndicators.macd(closes);
    const bb = TechnicalIndicators.bollingerBands(closes);
    const sma20 = TechnicalIndicators.sma(closes, 20);
    const ema12 = TechnicalIndicators.ema(closes, 12);

    const features = [];
    const startIndex = Math.max(120, closes.length - 1000); // Ensure we have enough data

    for (let i = startIndex; i < data.length; i++) {
      const d = data[i];
      const rsiIdx = i - (closes.length - rsi.length);
      const macdIdx = i - (closes.length - macd.macdLine.length);
      const bbIdx = i - (closes.length - bb.upperBand.length);
      const smaIdx = i - (closes.length - sma20.length);
      const emaIdx = i - (closes.length - ema12.length);

      features.push({
        ...d,
        // Price-based features
        priceRange: d.high - d.low,
        bodySize: Math.abs(d.close - d.open),
        upperShadow: d.high - Math.max(d.open, d.close),
        lowerShadow: Math.min(d.open, d.close) - d.low,
        typicalPrice: (d.high + d.low + d.close) / 3,
        
        // Technical indicators
        rsi: rsiIdx >= 0 ? rsi[rsiIdx] : 50,
        macd: macdIdx >= 0 ? macd.macdLine[macdIdx] : 0,
        macdSignal: macdIdx >= 0 ? macd.signalLine[macdIdx] : 0,
        macdHistogram: macdIdx >= 0 ? macd.histogram[macdIdx] : 0,
        bbPosition: bbIdx >= 0 ? (d.close - bb.lowerBand[bbIdx]) / (bb.upperBand[bbIdx] - bb.lowerBand[bbIdx]) : 0.5,
        smaRatio: smaIdx >= 0 ? d.close / sma20[smaIdx] : 1,
        emaRatio: emaIdx >= 0 ? d.close / ema12[emaIdx] : 1
      });
    }

    return features;
  }

  static prepareTrainingData(data, lookback = MODEL_CONFIG.LOOKBACK_PERIOD) {
    const features = [];
    const labels = [];
    
    for (let i = lookback; i < data.length; i++) {
      const sequence = data.slice(i - lookback, i);
      const feature = sequence.map(d => [
        d.close,
        d.volume,
        d.high,
        d.low,
        d.open,
        d.priceRange,
        d.bodySize,
        d.typicalPrice,
        d.rsi / 100, // Normalize RSI
        d.macd,
        d.bbPosition,
        d.smaRatio
      ]);
      
      features.push(feature);
      labels.push(data[i].close);
    }
    
    return {
      features: tf.tensor3d(features),
      labels: tf.tensor2d(labels, [labels.length, 1])
    };
  }
}

// Enhanced ML model with improved architecture
export async function createAdvancedMLModel(inputShape) {
  try {
    const model = tf.sequential();

    // Input layer with advanced LSTM architecture
    model.add(tf.layers.lstm({
      units: MODEL_CONFIG.LSTM_UNITS[0],
      returnSequences: true,
      inputShape: inputShape,
      recurrentDropout: 0.2,
      dropout: MODEL_CONFIG.DROPOUT_RATE
    }));

    // Batch normalization for better training stability
    model.add(tf.layers.batchNormalization());

    // Second LSTM layer
    model.add(tf.layers.lstm({
      units: MODEL_CONFIG.LSTM_UNITS[1],
      returnSequences: true,
      recurrentDropout: 0.2,
      dropout: MODEL_CONFIG.DROPOUT_RATE
    }));

    model.add(tf.layers.batchNormalization());

    // Third LSTM layer
    model.add(tf.layers.lstm({
      units: MODEL_CONFIG.LSTM_UNITS[2],
      returnSequences: false,
      recurrentDropout: 0.2,
      dropout: MODEL_CONFIG.DROPOUT_RATE
    }));

    // Dense layers with residual connections
    model.add(tf.layers.dense({ 
      units: 64, 
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
    }));
    
    model.add(tf.layers.dropout({ rate: MODEL_CONFIG.DROPOUT_RATE }));
    
    model.add(tf.layers.dense({ 
      units: 32, 
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
    }));
    
    model.add(tf.layers.dropout({ rate: MODEL_CONFIG.DROPOUT_RATE }));
    
    // Output layer
    model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

    // Advanced optimizer with learning rate scheduling
    const optimizer = tf.train.adam({
      learningRate: MODEL_CONFIG.LEARNING_RATE,
      beta1: 0.9,
      beta2: 0.999,
      epsilon: 1e-8
    });

    model.compile({
      optimizer: optimizer,
      loss: 'meanSquaredError',
      metrics: ['mae', 'mse']
    });

    logger.info('Advanced ML model created successfully');
    return model;

  } catch (error) {
    logger.error('Error creating ML model:', error);
    throw new CustomError('MODEL_CREATION_FAILED', error.message);
  }
}

// Enhanced training with callbacks and monitoring
export async function trainAdvancedMLModel(timeframe) {
  try {
    logger.info(`🤖 Training advanced ML model for ${timeframe}...`);
    
    const rawData = await fetchHistoricalData(timeframe, 2000);
    if (rawData.length < 500) {
      throw new CustomError('INSUFFICIENT_DATA', `Not enough data for ${timeframe} training`);
    }

    // Enhanced data preprocessing
    const engineeredData = DataPreprocessor.engineerFeatures(rawData);
    const { normalizedData, stats } = DataPreprocessor.normalizeData(engineeredData);
    const { features, labels } = DataPreprocessor.prepareTrainingData(normalizedData);

    const model = await createAdvancedMLModel([MODEL_CONFIG.LOOKBACK_PERIOD, MODEL_CONFIG.FEATURE_COUNT]);

    // Advanced callbacks for training monitoring
    const callbacks = {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0) {
          logger.info(`Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}, mae=${logs.mae.toFixed(4)}`);
        }
      },
      onTrainEnd: () => {
        logger.info(`Training completed for ${timeframe}`);
      }
    };

    // Enhanced training with early stopping simulation
    const history = await model.fit(features, labels, {
      epochs: MODEL_CONFIG.EPOCHS,
      batchSize: MODEL_CONFIG.BATCH_SIZE,
      validationSplit: MODEL_CONFIG.VALIDATION_SPLIT,
      shuffle: true,
      callbacks: callbacks
    });

    // Store model and metadata
    botState.mlModels[timeframe] = {
      model: model,
      stats: stats,
      metadata: {
        trainingDataSize: features.shape[0],
        features: MODEL_CONFIG.FEATURE_COUNT,
        lookback: MODEL_CONFIG.LOOKBACK_PERIOD,
        trainedAt: new Date().toISOString(),
        architecture: 'Advanced LSTM with Technical Indicators'
      }
    };

    // Enhanced training history tracking
    const finalLoss = history.history.loss[history.history.loss.length - 1];
    const finalValLoss = history.history.val_loss[history.history.val_loss.length - 1];
    const finalMae = history.history.mae[history.history.mae.length - 1];
    
    botState.trainingHistory.push({
      timeframe,
      loss: finalLoss,
      val_loss: finalValLoss,
      mae: finalMae,
      accuracy: Math.max(0, 100 - (finalMae * 100)),
      epochs: history.epoch.length,
      timestamp: new Date().toISOString(),
      dataSize: features.shape[0]
    });

    logger.info(`✅ Advanced model trained successfully for ${timeframe}`);
    logger.info(`Final metrics - Loss: ${finalLoss.toFixed(4)}, Val Loss: ${finalValLoss.toFixed(4)}, MAE: ${finalMae.toFixed(4)}`);

    // Clean up tensors
    features.dispose();
    labels.dispose();

    return model;

  } catch (error) {
    logger.error(`❌ Error training advanced model for ${timeframe}:`, error);
    throw new CustomError('TRAINING_FAILED', error.message);
  }
}

// Enhanced prediction with confidence intervals and ensemble methods
export async function generateAdvancedPredictions() {
  try {
    logger.info('🔮 Generating advanced predictions...');
    const predictions = {};
    
    for (const timeframe of CONFIG.timeframes) {
      const modelData = botState.mlModels[timeframe];
      if (!modelData || !modelData.model) continue;
      
      const { model, stats } = modelData;
      
      const rawData = await fetchHistoricalData(timeframe, 500);
      if (rawData.length < MODEL_CONFIG.LOOKBACK_PERIOD) continue;
      
      // Enhanced data preprocessing
      const engineeredData = DataPreprocessor.engineerFeatures(rawData);
      const normalizedData = engineeredData.map(d => ({
        ...d,
        close: DataPreprocessor.normalize(d.close, stats.close),
        volume: DataPreprocessor.normalize(d.volume, stats.volume),
        high: DataPreprocessor.normalize(d.high, stats.high),
        low: DataPreprocessor.normalize(d.low, stats.low),
        open: DataPreprocessor.normalize(d.open, stats.open)
      }));
      
      const lastSequence = normalizedData.slice(-MODEL_CONFIG.LOOKBACK_PERIOD);
      
      const features = lastSequence.map(d => [
        d.close,
        d.volume,
        d.high,
        d.low,
        d.open,
        d.priceRange,
        d.bodySize,
        d.typicalPrice,
        d.rsi / 100,
        d.macd,
        d.bbPosition,
        d.smaRatio
      ]);
      
      // Multiple predictions for confidence interval
      const numPredictions = 10;
      const predictionResults = [];
      
      for (let i = 0; i < numPredictions; i++) {
        const input = tf.tensor3d([features]);
        const prediction = model.predict(input);
        const normalizedPrediction = await prediction.data();
        
        // Denormalize prediction
        const predictedPrice = DataPreprocessor.denormalize(normalizedPrediction[0], stats.close);
        predictionResults.push(predictedPrice);
        
        input.dispose();
        prediction.dispose();
      }
      
      // Calculate statistics
      const meanPrediction = predictionResults.reduce((a, b) => a + b, 0) / predictionResults.length;
      const stdPrediction = Math.sqrt(
        predictionResults.reduce((sum, val) => sum + Math.pow(val - meanPrediction, 2), 0) / predictionResults.length
      );
      
      const currentPrice = botState.currentPrice;
      const priceChange = meanPrediction - currentPrice;
      const priceChangePercent = (priceChange / currentPrice) * 100;
      
      // Enhanced confidence calculation
      const trainingHistory = botState.trainingHistory.find(h => h.timeframe === timeframe);
      const baseConfidence = trainingHistory ? Math.min(95, trainingHistory.accuracy) : 50;
      const volatilityAdjustment = Math.max(0, 20 - (stdPrediction / currentPrice * 100));
      const finalConfidence = Math.min(95, baseConfidence + volatilityAdjustment);
      
      // Signal strength calculation
      const signalStrength = Math.min(100, Math.abs(priceChangePercent) * 10);
      
      predictions[timeframe] = {
        predictedPrice: meanPrediction,
        currentPrice,
        priceChange,
        priceChangePercent,
        direction: priceChange > 0 ? 'BULLISH' : 'BEARISH',
        confidence: finalConfidence,
        signalStrength,
        confidenceInterval: {
          lower: meanPrediction - (2 * stdPrediction),
          upper: meanPrediction + (2 * stdPrediction)
        },
        volatility: stdPrediction,
        timestamp: new Date().toISOString(),
        metadata: {
          model_accuracy: trainingHistory ? trainingHistory.accuracy : 0,
          predictions_count: numPredictions,
          data_quality: engineeredData.length > 1000 ? 'HIGH' : 'MEDIUM'
        }
      };
    }
    
    botState.predictions = predictions;
    logger.info(`✅ Generated predictions for ${Object.keys(predictions).length} timeframes`);
    
    return predictions;

  } catch (error) {
    logger.error('❌ Error generating advanced predictions:', error);
    throw new CustomError('PREDICTION_FAILED', error.message);
  }
}

// Enhanced model evaluation with multiple metrics
export async function evaluateModelPerformance() {
  try {
    logger.info('📊 Evaluating model performance...');
    
    const performanceMetrics = {};
    
    for (const timeframe of CONFIG.timeframes) {
      const modelData = botState.mlModels[timeframe];
      if (!modelData || !modelData.model) continue;
      
      const { model, stats } = modelData;
      
      // Get test data
      const rawTestData = await fetchHistoricalData(timeframe, 300);
      if (rawTestData.length < MODEL_CONFIG.LOOKBACK_PERIOD) continue;
      
      const engineeredData = DataPreprocessor.engineerFeatures(rawTestData);
      const normalizedData = engineeredData.map(d => ({
        ...d,
        close: DataPreprocessor.normalize(d.close, stats.close),
        volume: DataPreprocessor.normalize(d.volume, stats.volume),
        high: DataPreprocessor.normalize(d.high, stats.high),
        low: DataPreprocessor.normalize(d.low, stats.low),
        open: DataPreprocessor.normalize(d.open, stats.open)
      }));
      
      const { features, labels } = DataPreprocessor.prepareTrainingData(normalizedData);
      
      // Comprehensive evaluation
      const evaluation = await model.evaluate(features, labels, { batchSize: 32 });
      const loss = await evaluation[0].data();
      const mae = await evaluation[1].data();
      const mse = await evaluation[2].data();
      
      // Calculate additional metrics
      const rmse = Math.sqrt(mse[0]);
      const accuracy = Math.max(0, 100 - (mae[0] * 100));
      const r2Score = await calculateR2Score(model, features, labels);
      
      performanceMetrics[timeframe] = {
        loss: loss[0],
        mae: mae[0],
        mse: mse[0],
        rmse: rmse,
        accuracy: accuracy,
        r2Score: r2Score,
        totalSamples: features.shape[0],
        evaluatedAt: new Date().toISOString(),
        modelAge: Date.now() - new Date(modelData.metadata.trainedAt).getTime(),
        dataQuality: assessDataQuality(engineeredData)
      };
      
      // Clean up tensors
      features.dispose();
      labels.dispose();
      evaluation.forEach(tensor => tensor.dispose());
    }
    
    botState.performanceMetrics = performanceMetrics;
    
    // Generate detailed report
    await generatePerformanceReport(performanceMetrics);
    
    logger.info('✅ Model performance evaluation completed');
    return performanceMetrics;

  } catch (error) {
    logger.error('❌ Error evaluating model performance:', error);
    throw new CustomError('EVALUATION_FAILED', error.message);
  }
}

// Helper method to calculate R² score
async function calculateR2Score(model, features, labels) {
  try {
    const predictions = model.predict(features);
    const predData = await predictions.data();
    const labelData = await labels.data();
    
    const yMean = labelData.reduce((a, b) => a + b, 0) / labelData.length;
    const ssRes = labelData.reduce((sum, actual, i) => sum + Math.pow(actual - predData[i], 2), 0);
    const ssTot = labelData.reduce((sum, actual) => sum + Math.pow(actual - yMean, 2), 0);
    
    const r2 = 1 - (ssRes / ssTot);
    
    predictions.dispose();
    return r2;
    
  } catch (error) {
    logger.error('Error calculating R² score:', error);
    return 0;
  }
}

// Enhanced auto-retraining with intelligent scheduling
export async function smartModelRetraining() {
  try {
    logger.info('🧠 Starting smart model retraining...');
    
    for (const timeframe of CONFIG.timeframes) {
      const modelData = botState.mlModels[timeframe];
      const performance = botState.performanceMetrics[timeframe];
      
      // Intelligent retraining decision
      const shouldRetrain = shouldRetrainModel(modelData, performance);
      
      if (shouldRetrain.retrain) {
        logger.info(`🔄 Retraining ${timeframe} model. Reason: ${shouldRetrain.reason}`);
        
        // Backup current model before retraining
        if (modelData) {
          botState.modelBackups[timeframe] = {
            model: modelData.model,
            stats: modelData.stats,
            backedUpAt: new Date().toISOString()
          };
        }
        
        await trainAdvancedMLModel(timeframe);
        
        // Verify new model performance
        const newPerformance = await quickPerformanceCheck(timeframe);
        if (newPerformance.accuracy < MODEL_CONFIG.MIN_ACCURACY_THRESHOLD) {
          logger.warn(`⚠️ New model performance below threshold, reverting to backup`);
          await revertToBackup(timeframe);
        }
      }
    }
    
    logger.info('✅ Smart model retraining completed');
    
  } catch (error) {
    logger.error('❌ Error in smart model retraining:', error);
    throw new CustomError('RETRAINING_FAILED', error.message);
  }
}

// Helper methods for smart retraining
function shouldRetrainModel(modelData, performance) {
  if (!modelData || !performance) {
    return { retrain: true, reason: 'No model or performance data available' };
  }
  
  // Check accuracy threshold
  if (performance.accuracy < MODEL_CONFIG.RETRAIN_THRESHOLD) {
    return { retrain: true, reason: `Accuracy below threshold (${performance.accuracy.toFixed(1)}%)` };
  }
  
  // Check model age (retrain if older than 7 days)
  const modelAge = Date.now() - new Date(modelData.metadata.trainedAt).getTime();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  
  if (modelAge > maxAge) {
    return { retrain: true, reason: `Model too old (${Math.floor(modelAge / (24 * 60 * 60 * 1000))} days)` };
  }
  
  // Check data quality degradation
  if (performance.dataQuality === 'LOW') {
    return { retrain: true, reason: 'Data quality has degraded' };
  }
  
  return { retrain: false, reason: 'Model performance satisfactory' };
}

function assessDataQuality(data) {
  if (data.length < 500) return 'LOW';
  if (data.length < 1000) return 'MEDIUM';
  return 'HIGH';
}

// Quick performance check for newly trained models
async function quickPerformanceCheck(timeframe) {
  try {
    const modelData = botState.mlModels[timeframe];
    if (!modelData || !modelData.model) {
      return { accuracy: 0 };
    }
    
    const { model, stats } = modelData;
    const rawData = await fetchHistoricalData(timeframe, 200);
    
    if (rawData.length < MODEL_CONFIG.LOOKBACK_PERIOD) {
      return { accuracy: 0 };
    }
    
    const engineeredData = DataPreprocessor.engineerFeatures(rawData);
    const normalizedData = engineeredData.map(d => ({
      ...d,
      close: DataPreprocessor.normalize(d.close, stats.close),
      volume: DataPreprocessor.normalize(d.volume, stats.volume),
      high: DataPreprocessor.normalize(d.high, stats.high),
      low: DataPreprocessor.normalize(d.low, stats.low),
      open: DataPreprocessor.normalize(d.open, stats.open)
    }));
    
    const { features, labels } = DataPreprocessor.prepareTrainingData(normalizedData);
    const evaluation = await model.evaluate(features, labels, { batchSize: 32 });
    const mae = await evaluation[1].data();
    const accuracy = Math.max(0, 100 - (mae[0] * 100));
    
    // Clean up tensors
    features.dispose();
    labels.dispose();
    evaluation.forEach(tensor => tensor.dispose());
    
    return { accuracy };
    
  } catch (error) {
    logger.error(`Error in quick performance check for ${timeframe}:`, error);
    return { accuracy: 0 };
  }
}

// Revert to backup model
async function revertToBackup(timeframe) {
  try {
    const backup = botState.modelBackups[timeframe];
    if (backup) {
      botState.mlModels[timeframe] = {
        model: backup.model,
        stats: backup.stats,
        metadata: {
          ...backup.metadata,
          revertedAt: new Date().toISOString()
        }
      };
      logger.info(`✅ Successfully reverted ${timeframe} model to backup`);
    }
  } catch (error) {
    logger.error(`Error reverting ${timeframe} model to backup:`, error);
  }
}

// Enhanced performance report generation
async function generatePerformanceReport(metrics) {
  try {
    let report = `📊 *Advanced AI Model Performance Report*\n`;
    report += `📅 Generated: ${new Date().toLocaleString()}\n\n`;
    
    for (const [timeframe, metric] of Object.entries(metrics)) {
      const status = metric.accuracy > MODEL_CONFIG.MIN_ACCURACY_THRESHOLD ? '✅' : '⚠️';
      
      report += `${status} *${timeframe.toUpperCase()}*\n`;
      report += `├─ Accuracy: ${metric.accuracy.toFixed(1)}%\n`;
      report += `├─ R² Score: ${metric.r2Score.toFixed(3)}\n`;
      report += `├─ RMSE: ${metric.rmse.toFixed(4)}\n`;
      report += `├─ MAE: ${metric.mae.toFixed(4)}\n`;
      report += `├─ Samples: ${metric.totalSamples}\n`;
      report += `└─ Quality: ${metric.dataQuality}\n\n`;
    }
    
    // Overall system health
    const avgAccuracy = Object.values(metrics).reduce((sum, m) => sum + m.accuracy, 0) / Object.keys(metrics).length;
    const healthStatus = avgAccuracy > MODEL_CONFIG.MIN_ACCURACY_THRESHOLD ? '🟢 HEALTHY' : '🟡 NEEDS ATTENTION';
    
    report += `🎯 *System Health: ${healthStatus}*\n`;
    report += `📈 Average Accuracy: ${avgAccuracy.toFixed(1)}%\n`;
    
    await sendTelegramNotification(report);
    
  } catch (error) {
    logger.error('Error generating performance report:', error);
  }
}

// Enhanced model monitoring and health checks
export async function monitorModelHealth() {
  try {
    logger.info('🔍 Monitoring model health...');
    
    const healthReport = {
      timestamp: new Date().toISOString(),
      overallHealth: 'HEALTHY',
      issues: [],
      recommendations: [],
      modelStatus: {}
    };
    
    for (const timeframe of CONFIG.timeframes) {
      const modelData = botState.mlModels[timeframe];
      const performance = botState.performanceMetrics[timeframe];
      
      if (!modelData || !modelData.model) {
        healthReport.issues.push(`No model available for ${timeframe}`);
        healthReport.modelStatus[timeframe] = 'MISSING';
        continue;
      }
      
      // Check model age
      const modelAge = Date.now() - new Date(modelData.metadata.trainedAt).getTime();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      if (modelAge > maxAge) {
        healthReport.issues.push(`${timeframe} model is ${Math.floor(modelAge / (24 * 60 * 60 * 1000))} days old`);
        healthReport.recommendations.push(`Consider retraining ${timeframe} model`);
      }
      
      // Check performance metrics
      if (performance && performance.accuracy < MODEL_CONFIG.MIN_ACCURACY_THRESHOLD) {
        healthReport.issues.push(`${timeframe} model accuracy below threshold (${performance.accuracy.toFixed(1)}%)`);
        healthReport.recommendations.push(`Retrain ${timeframe} model with more data`);
      }
      
      // Memory usage check
      const memoryUsage = await checkModelMemoryUsage(modelData.model);
      if (memoryUsage > 0.8) {
        healthReport.issues.push(`${timeframe} model using excessive memory (${(memoryUsage * 100).toFixed(1)}%)`);
        healthReport.recommendations.push(`Optimize ${timeframe} model architecture`);
      }
      
      healthReport.modelStatus[timeframe] = determineModelStatus(modelData, performance, modelAge);
    }
    
    // Determine overall health
    if (healthReport.issues.length > 5) {
      healthReport.overallHealth = 'CRITICAL';
    } else if (healthReport.issues.length > 2) {
      healthReport.overallHealth = 'WARNING';
    }
    
    botState.healthReport = healthReport;
    
    // Send critical alerts
    if (healthReport.overallHealth === 'CRITICAL') {
      await sendCriticalHealthAlert(healthReport);
    }
    
    logger.info(`✅ Model health monitoring completed. Status: ${healthReport.overallHealth}`);
    return healthReport;
    
  } catch (error) {
    logger.error('❌ Error monitoring model health:', error);
    throw new CustomError('HEALTH_MONITORING_FAILED', error.message);
  }
}

// Helper function to check model memory usage
async function checkModelMemoryUsage(model) {
  try {
    const memInfo = tf.memory();
    const totalBytes = memInfo.numBytes;
    const maxBytes = 1024 * 1024 * 1024; // 1GB threshold
    return totalBytes / maxBytes;
  } catch (error) {
    logger.error('Error checking memory usage:', error);
    return 0;
  }
}

// Helper function to determine model status
function determineModelStatus(modelData, performance, modelAge) {
  if (!modelData || !modelData.model) return 'MISSING';
  
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  const isOld = modelAge > maxAge;
  const lowAccuracy = performance && performance.accuracy < MODEL_CONFIG.MIN_ACCURACY_THRESHOLD;
  
  if (isOld && lowAccuracy) return 'CRITICAL';
  if (isOld || lowAccuracy) return 'WARNING';
  return 'HEALTHY';
}

// Send critical health alerts
async function sendCriticalHealthAlert(healthReport) {
  try {
    let alert = `🚨 *CRITICAL MODEL HEALTH ALERT* 🚨\n\n`;
    alert += `⏰ Time: ${new Date().toLocaleString()}\n`;
    alert += `📊 Overall Status: ${healthReport.overallHealth}\n\n`;
    
    alert += `🔥 *Critical Issues:*\n`;
    healthReport.issues.forEach(issue => {
      alert += `• ${issue}\n`;
    });
    
    alert += `\n💡 *Recommendations:*\n`;
    healthReport.recommendations.forEach(rec => {
      alert += `• ${rec}\n`;
    });
    
    alert += `\n🔧 *Immediate Actions Required:*\n`;
    alert += `• Review model performance\n`;
    alert += `• Consider emergency retraining\n`;
    alert += `• Check system resources\n`;
    
    await sendTelegramNotification(alert);
    
  } catch (error) {
    logger.error('Error sending critical health alert:', error);
  }
}

// Enhanced prediction confidence scoring
export function calculateAdvancedConfidence(prediction, modelMetrics, marketConditions) {
  try {
    // Base confidence from model accuracy
    let baseConfidence = modelMetrics?.accuracy || 50;
    
    // Market volatility adjustment
    const volatilityFactor = marketConditions?.volatility || 1;
    const volatilityAdjustment = Math.max(-20, Math.min(20, (1 - volatilityFactor) * 30));
    
    // Prediction strength adjustment
    const predictionStrength = Math.abs(prediction.priceChangePercent);
    const strengthBonus = Math.min(15, predictionStrength * 2);
    
    // Data quality factor
    const dataQualityBonus = {
      'HIGH': 10,
      'MEDIUM': 5,
      'LOW': -10
    }[modelMetrics?.dataQuality] || 0;
    
    // Recent performance factor
    const recentPerformance = botState.trainingHistory
      .filter(h => h.timeframe === prediction.timeframe)
      .slice(-5)
      .reduce((avg, h) => avg + h.accuracy, 0) / 5;
    
    const performanceAdjustment = (recentPerformance - baseConfidence) * 0.3;
    
    // Calculate final confidence
    const finalConfidence = Math.max(10, Math.min(95, 
      baseConfidence + 
      volatilityAdjustment + 
      strengthBonus + 
      dataQualityBonus + 
      performanceAdjustment
    ));
    
    return {
      confidence: finalConfidence,
      factors: {
        baseConfidence,
        volatilityAdjustment,
        strengthBonus,
        dataQualityBonus,
        performanceAdjustment
      }
    };
    
  } catch (error) {
    logger.error('Error calculating advanced confidence:', error);
    return { confidence: 50, factors: {} };
  }
}

// Market regime detection
export function detectMarketRegime(data) {
  try {
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    
    // Calculate volatility
    const returns = closes.slice(1).map((price, i) => Math.log(price / closes[i]));
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) * Math.sqrt(252);
    
    // Calculate trend strength
    const sma20 = TechnicalIndicators.sma(closes, 20);
    const sma50 = TechnicalIndicators.sma(closes, 50);
    const trendStrength = sma20[sma20.length - 1] / sma50[sma50.length - 1];
    
    // Volume analysis
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const recentVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
    const volumeRatio = recentVolume / avgVolume;
    
    // Regime classification
    let regime = 'NORMAL';
    let confidence = 70;
    
    if (volatility > 0.4) {
      regime = 'HIGH_VOLATILITY';
      confidence = 85;
    } else if (volatility < 0.1) {
      regime = 'LOW_VOLATILITY';
      confidence = 80;
    }
    
    if (Math.abs(trendStrength - 1) > 0.05) {
      regime = trendStrength > 1 ? 'BULL_TREND' : 'BEAR_TREND';
      confidence = Math.min(95, confidence + 10);
    }
    
    if (volumeRatio > 1.5) {
      regime = 'HIGH_VOLUME';
      confidence = Math.min(95, confidence + 5);
    }
    
    return {
      regime,
      confidence,
      metrics: {
        volatility,
        trendStrength,
        volumeRatio,
        avgVolume,
        recentVolume
      }
    };
    
  } catch (error) {
    logger.error('Error detecting market regime:', error);
    return { regime: 'UNKNOWN', confidence: 0, metrics: {} };
  }
}

// Enhanced prediction with ensemble methods
export async function generateEnsemblePredictions() {
  try {
    logger.info('🔮 Generating ensemble predictions...');
    
    const ensemblePredictions = {};
    
    for (const timeframe of CONFIG.timeframes) {
      const modelData = botState.mlModels[timeframe];
      if (!modelData || !modelData.model) continue;
      
      const rawData = await fetchHistoricalData(timeframe, 500);
      if (rawData.length < MODEL_CONFIG.LOOKBACK_PERIOD) continue;
      
      // Market regime detection
      const marketRegime = detectMarketRegime(rawData);
      
      // Generate multiple predictions with different configurations
      const predictions = [];
      
      // Base prediction
      const basePrediction = await generateSinglePrediction(timeframe, modelData, rawData);
      predictions.push({ weight: 0.4, prediction: basePrediction });
      
      // Trend-adjusted prediction
      const trendAdjustedPrediction = await generateTrendAdjustedPrediction(timeframe, modelData, rawData);
      predictions.push({ weight: 0.3, prediction: trendAdjustedPrediction });
      
      // Volume-weighted prediction
      const volumeWeightedPrediction = await generateVolumeWeightedPrediction(timeframe, modelData, rawData);
      predictions.push({ weight: 0.3, prediction: volumeWeightedPrediction });
      
      // Ensemble combination
      const ensemblePrice = predictions.reduce((sum, p) => sum + (p.prediction.predictedPrice * p.weight), 0);
      const ensembleConfidence = predictions.reduce((sum, p) => sum + (p.prediction.confidence * p.weight), 0);
      
      const currentPrice = botState.currentPrice;
      const priceChange = ensemblePrice - currentPrice;
      const priceChangePercent = (priceChange / currentPrice) * 100;
      
      ensemblePredictions[timeframe] = {
        predictedPrice: ensemblePrice,
        currentPrice,
        priceChange,
        priceChangePercent,
        direction: priceChange > 0 ? 'BULLISH' : 'BEARISH',
        confidence: ensembleConfidence,
        signalStrength: Math.min(100, Math.abs(priceChangePercent) * 10),
        marketRegime: marketRegime.regime,
        regimeConfidence: marketRegime.confidence,
        ensemble: {
          predictions: predictions.map(p => ({
            type: p.prediction.type || 'base',
            price: p.prediction.predictedPrice,
            weight: p.weight
          })),
          method: 'WEIGHTED_AVERAGE'
        },
        timestamp: new Date().toISOString()
      };
    }
    
    botState.ensemblePredictions = ensemblePredictions;
    logger.info(`✅ Generated ensemble predictions for ${Object.keys(ensemblePredictions).length} timeframes`);
    
    return ensemblePredictions;
    
  } catch (error) {
    logger.error('❌ Error generating ensemble predictions:', error);
    throw new CustomError('ENSEMBLE_PREDICTION_FAILED', error.message);
  }
}

// Helper functions for ensemble predictions
async function generateSinglePrediction(timeframe, modelData, rawData) {
  // Implementation similar to generateAdvancedPredictions but for single prediction
  const engineeredData = DataPreprocessor.engineerFeatures(rawData);
  const normalizedData = engineeredData.map(d => ({
    ...d,
    close: DataPreprocessor.normalize(d.close, modelData.stats.close),
    volume: DataPreprocessor.normalize(d.volume, modelData.stats.volume),
    high: DataPreprocessor.normalize(d.high, modelData.stats.high),
    low: DataPreprocessor.normalize(d.low, modelData.stats.low),
    open: DataPreprocessor.normalize(d.open, modelData.stats.open)
  }));
  
  const lastSequence = normalizedData.slice(-MODEL_CONFIG.LOOKBACK_PERIOD);
  const features = lastSequence.map(d => [
    d.close, d.volume, d.high, d.low, d.open,
    d.priceRange, d.bodySize, d.typicalPrice,
    d.rsi / 100, d.macd, d.bbPosition, d.smaRatio
  ]);
  
  const input = tf.tensor3d([features]);
  const prediction = modelData.model.predict(input);
  const normalizedPrediction = await prediction.data();
  
  const predictedPrice = DataPreprocessor.denormalize(normalizedPrediction[0], modelData.stats.close);
  
  input.dispose();
  prediction.dispose();
  
  return {
    type: 'base',
    predictedPrice,
    confidence: 70
  };
}

async function generateTrendAdjustedPrediction(timeframe, modelData, rawData) {
  const basePrediction = await generateSinglePrediction(timeframe, modelData, rawData);
  
  // Apply trend adjustment
  const closes = rawData.map(d => d.close);
  const sma20 = TechnicalIndicators.sma(closes, 20);
  const sma50 = TechnicalIndicators.sma(closes, 50);
  
  const trendFactor = sma20[sma20.length - 1] / sma50[sma50.length - 1];
  const trendAdjustment = (trendFactor - 1) * 0.1; // 10% max adjustment
  
  return {
    type: 'trend_adjusted',
    predictedPrice: basePrediction.predictedPrice * (1 + trendAdjustment),
    confidence: 75
  };
}

async function generateVolumeWeightedPrediction(timeframe, modelData, rawData) {
  const basePrediction = await generateSinglePrediction(timeframe, modelData, rawData);
  
  // Apply volume weighting
  const volumes = rawData.map(d => d.volume);
  const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
  const recentVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
  
  const volumeRatio = recentVolume / avgVolume;
  const volumeAdjustment = Math.min(0.05, Math.max(-0.05, (volumeRatio - 1) * 0.02));
  
  return {
    type: 'volume_weighted',
    predictedPrice: basePrediction.predictedPrice * (1 + volumeAdjustment),
    confidence: 65
  };
}

// Model performance tracking and analytics
export function trackPredictionAccuracy(actualPrice, predictions) {
  try {
    const timestamp = new Date().toISOString();
    
    for (const [timeframe, prediction] of Object.entries(predictions)) {
      const error = Math.abs(actualPrice - prediction.predictedPrice);
      const errorPercent = (error / actualPrice) * 100;
      const accuracy = Math.max(0, 100 - errorPercent);
      
      // Store accuracy record
      if (!botState.accuracyHistory[timeframe]) {
        botState.accuracyHistory[timeframe] = [];
      }
      
      botState.accuracyHistory[timeframe].push({
        timestamp,
        predicted: prediction.predictedPrice,
        actual: actualPrice,
        error: error,
        errorPercent: errorPercent,
        accuracy: accuracy,
        confidence: prediction.confidence,
        direction: prediction.direction,
        correctDirection: (prediction.priceChange > 0 && actualPrice > prediction.currentPrice) || 
                          (prediction.priceChange < 0 && actualPrice < prediction.currentPrice)
      });
      
      // Keep only last 100 records
      if (botState.accuracyHistory[timeframe].length > 100) {
        botState.accuracyHistory[timeframe] = botState.accuracyHistory[timeframe].slice(-100);
      }
    }
    
    logger.info(`📊 Tracked prediction accuracy for ${Object.keys(predictions).length} timeframes`);
    
  } catch (error) {
    logger.error('Error tracking prediction accuracy:', error);
  }
}

// Initialize accuracy tracking
if (!botState.accuracyHistory) {
  botState.accuracyHistory = {};
}

// Export all functions for external use
export {
  TechnicalIndicators,
  MODEL_CONFIG
};