import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { botState, CONFIG } from './index.js';
import { fetchHistoricalData, executeLiveTrade, executePaperTrade } from './trading.js';
import { trainMLModel, generatePredictions, evaluatePredictionAccuracy } from './ml.js';
import { generateTradingSignals } from './signals.js';
import { sendTelegramNotification } from './index.js';

const app = express();
app.use(cors());
app.use(express.json());

// Enhanced API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    ...botState,
    config: CONFIG
  });
});

app.get('/api/dashboard', (req, res) => {
  const totalPnL = botState.positions.reduce((sum, pos) => sum + pos.pnl, 0);
  const totalValue = botState.balance + botState.positions.reduce((sum, pos) => sum + (pos.size * pos.currentPrice), 0);
  
  res.json({
    status: {
      isRunning: botState.isRunning,
      currentPrice: botState.currentPrice,
      change24h: botState.change24h,
      volume: botState.volume,
      lastUpdate: botState.lastUpdate
    },
    portfolio: {
      balance: botState.balance,
      totalValue,
      totalPnL,
      positions: botState.positions.length,
      dailyPnL: 0 // Would need to calculate from trade history
    },
    signals: botState.signals.slice(0, 10),
    predictions: botState.predictions,
    sentiment: botState.sentimentData,
    exchanges: botState.exchangeStatus,
    recentTrades: botState.tradeHistory.slice(0, 10)
  });
});

app.get('/api/predictions', (req, res) => {
  res.json(botState.predictions);
});

app.get('/api/sentiment', (req, res) => {
  res.json(botState.sentimentData);
});

app.get('/api/accuracy', (req, res) => {
  res.json(botState.accuracyMetrics);
});

app.get('/api/signals', (req, res) => {
  res.json(botState.signals);
});

app.get('/api/positions', (req, res) => {
  res.json(botState.positions);
});

app.get('/api/trades', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(botState.tradeHistory.slice(0, limit));
});

app.get('/api/exchanges', (req, res) => {
  res.json(botState.exchangeStatus);
});

app.get('/api/notifications', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(botState.notifications.slice(0, limit));
});

app.get('/api/historical/:timeframe', async (req, res) => {
  try {
    const { timeframe } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const data = await fetchHistoricalData(timeframe, limit);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ml/models', (req, res) => {
  const models = Object.keys(botState.mlModels).map(timeframe => ({
    timeframe,
    trained: !!botState.mlModels[timeframe],
    accuracy: botState.accuracyMetrics[timeframe]?.accuracy || 0
  }));
  res.json(models);
});

app.get('/api/ml/training-history', (req, res) => {
  res.json(botState.trainingHistory);
});

// Control endpoints
app.post('/api/bot/toggle', (req, res) => {
  botState.isRunning = !botState.isRunning;
  
  const message = `🤖 Bot ${botState.isRunning ? 'STARTED' : 'STOPPED'}`;
  console.log(message);
  sendTelegramNotification(message);
  
  res.json({ isRunning: botState.isRunning });
});

app.post('/api/bot/start', (req, res) => {
  botState.isRunning = true;
  
  const message = `🚀 Bot STARTED via API`;
  console.log(message);
  sendTelegramNotification(message);
  
  res.json({ isRunning: true });
});

app.post('/api/bot/stop', (req, res) => {
  botState.isRunning = false;
  
  const message = `🛑 Bot STOPPED via API`;
  console.log(message);
  sendTelegramNotification(message);
  
  res.json({ isRunning: false });
});

app.post('/api/trade', async (req, res) => {
  try {
    const { signal, size, exchange } = req.body;
    
    if (!signal || !['BUY', 'SELL'].includes(signal)) {
      return res.status(400).json({ error: 'Invalid signal' });
    }
    
    const tradeSize = size || 0.01;
    const exchangeName = exchange || 'binance';
    
    if (CONFIG.paperTrading) {
      executePaperTrade(signal, tradeSize);
    } else {
      await executeLiveTrade(signal, tradeSize, exchangeName);
    }
    
    res.json({ success: true, message: `${signal} order placed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ml/retrain', async (req, res) => {
  try {
    const { timeframe } = req.body;
    const timeframes = timeframe ? [timeframe] : CONFIG.timeframes;
    
    const results = [];
    for (const tf of timeframes) {
      const model = await trainMLModel(tf);
      results.push({
        timeframe: tf,
        success: !!model,
        message: model ? 'Model trained successfully' : 'Training failed'
      });
    }
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ml/predict', async (req, res) => {
  try {
    const predictions = await generatePredictions();
    res.json({ success: true, predictions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/signals/generate', async (req, res) => {
  try {
    const signals = await generateTradingSignals();
    res.json({ success: true, signals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/telegram/test', async (req, res) => {
  try {
    const { message } = req.body;
    await sendTelegramNotification(message || 'Test message from trading bot API');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { symbol, paperTrading, riskPerTrade, stopLossPct, takeProfitPct } = req.body;
    
    if (symbol) CONFIG.symbol = symbol;
    if (typeof paperTrading === 'boolean') CONFIG.paperTrading = paperTrading;
    if (riskPerTrade) CONFIG.riskPerTrade = parseFloat(riskPerTrade);
    if (stopLossPct) CONFIG.stopLossPct = parseFloat(stopLossPct);
    if (takeProfitPct) CONFIG.takeProfitPct = parseFloat(takeProfitPct);
    
    res.json({ success: true, config: CONFIG });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket setup
export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log('📡 Dashboard connected');
    
    // Send current state
    ws.send(JSON.stringify({
      type: 'state',
      data: botState
    }));
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'subscribe') {
          ws.subscriptions = data.channels || [];
        }
      } catch (error) {
        console.error('❌ WebSocket message error:', error.message);
      }
    });
    
    ws.on('close', () => {
      console.log('📡 Dashboard disconnected');
    });
  });
  
  return wss;
}

// Broadcast updates to all connected clients
export function broadcastUpdate(wss, type = 'update', data = null) {
  const message = JSON.stringify({
    type,
    data: data || botState,
    timestamp: new Date().toISOString()
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

export default app;