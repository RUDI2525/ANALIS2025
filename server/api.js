import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { botState, CONFIG, sendTelegramNotification } from './index.js';

const app = express();
app.use(cors());
app.use(express.json());

// Mock functions for missing imports
const fetchHistoricalData = async (timeframe, limit) => {
  // Mock historical data
  const data = [];
  const now = Date.now();
  for (let i = limit; i > 0; i--) {
    const timestamp = now - (i * 60000); // 1 minute intervals
    const basePrice = 45000;
    const volatility = 0.02;
    const change = (Math.random() - 0.5) * 2 * volatility;
    const price = basePrice * (1 + change);
    
    data.push({
      timestamp,
      open: price * (1 + (Math.random() - 0.5) * 0.001),
      high: price * (1 + Math.random() * 0.002),
      low: price * (1 - Math.random() * 0.002),
      close: price,
      volume: Math.random() * 1000000
    });
  }
  return data;
};

const executeLiveTrade = async (signal, size, exchange) => {
  console.log(`Mock live trade: ${signal} ${size} on ${exchange}`);
  return { success: true, message: `${signal} order placed` };
};

const executePaperTrade = (signal, size) => {
  console.log(`Mock paper trade: ${signal} ${size}`);
  
  const trade = {
    id: `trade_${Date.now()}`,
    symbol: CONFIG.symbol,
    side: signal,
    size: size,
    price: botState.currentPrice,
    timestamp: new Date().toISOString(),
    type: 'paper'
  };
  
  botState.tradeHistory.unshift(trade);
  return trade;
};

const trainMLModel = async (timeframe) => {
  console.log(`Mock ML training for ${timeframe}`);
  return { success: true, timeframe };
};

const generatePredictions = async () => {
  console.log('Mock prediction generation');
  const predictions = {};
  
  CONFIG.timeframes.forEach(timeframe => {
    const change = (Math.random() - 0.5) * 10; // -5% to +5%
    predictions[timeframe] = {
      predictedPrice: botState.currentPrice * (1 + change / 100),
      currentPrice: botState.currentPrice,
      priceChange: botState.currentPrice * (change / 100),
      priceChangePercent: change,
      direction: change > 0 ? 'BULLISH' : 'BEARISH',
      confidence: 50 + Math.random() * 40, // 50-90%
      timestamp: new Date().toISOString()
    };
  });
  
  botState.predictions = predictions;
  return predictions;
};

const evaluatePredictionAccuracy = async () => {
  console.log('Mock accuracy evaluation');
  const accuracy = {};
  
  CONFIG.timeframes.forEach(timeframe => {
    accuracy[timeframe] = {
      accuracy: 60 + Math.random() * 30, // 60-90%
      totalPredictions: Math.floor(Math.random() * 100) + 50,
      correctPredictions: Math.floor(Math.random() * 80) + 40
    };
  });
  
  botState.accuracyMetrics = accuracy;
  return accuracy;
};

const generateTradingSignals = async () => {
  console.log('Mock signal generation');
  const signals = [];
  
  CONFIG.timeframes.forEach(timeframe => {
    const signal = Math.random() > 0.5 ? 'BUY' : 'SELL';
    const strength = 50 + Math.random() * 45; // 50-95%
    
    signals.push({
      id: `signal_${timeframe}_${Date.now()}`,
      timeframe,
      signal,
      strength,
      confidence: 50 + Math.random() * 40,
      timestamp: new Date().toISOString(),
      reasons: [`Mock reason for ${signal} signal`]
    });
  });
  
  botState.signals = signals;
  return signals;
};

// Enhanced API endpoints
app.get('/status', (req, res) => {
  res.json({
    ...botState,
    config: CONFIG
  });
});

app.get('/dashboard', (req, res) => {
  const totalPnL = botState.positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
  const totalValue = botState.balance + botState.positions.reduce((sum, pos) => sum + (pos.size * pos.currentPrice || 0), 0);
  
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

app.get('/predictions', (req, res) => {
  res.json(botState.predictions);
});

app.get('/sentiment', (req, res) => {
  res.json(botState.sentimentData);
});

app.get('/accuracy', (req, res) => {
  res.json(botState.accuracyMetrics);
});

app.get('/signals', (req, res) => {
  res.json(botState.signals);
});

app.get('/positions', (req, res) => {
  res.json(botState.positions);
});

app.get('/trades', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(botState.tradeHistory.slice(0, limit));
});

app.get('/exchanges', (req, res) => {
  res.json(botState.exchangeStatus);
});

app.get('/notifications', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(botState.notifications.slice(0, limit));
});

app.get('/historical/:timeframe', async (req, res) => {
  try {
    const { timeframe } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const data = await fetchHistoricalData(timeframe, limit);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/ml/models', (req, res) => {
  const models = Object.keys(botState.mlModels).map(timeframe => ({
    timeframe,
    trained: !!botState.mlModels[timeframe],
    accuracy: botState.accuracyMetrics[timeframe]?.accuracy || 0
  }));
  res.json(models);
});

app.get('/ml/training-history', (req, res) => {
  res.json(botState.trainingHistory);
});

// Control endpoints
app.post('/bot/toggle', (req, res) => {
  botState.isRunning = !botState.isRunning;
  
  const message = `🤖 Bot ${botState.isRunning ? 'STARTED' : 'STOPPED'}`;
  console.log(message);
  sendTelegramNotification(message);
  
  res.json({ isRunning: botState.isRunning });
});

app.post('/bot/start', (req, res) => {
  botState.isRunning = true;
  
  const message = `🚀 Bot STARTED via API`;
  console.log(message);
  sendTelegramNotification(message);
  
  res.json({ isRunning: true });
});

app.post('/bot/stop', (req, res) => {
  botState.isRunning = false;
  
  const message = `🛑 Bot STOPPED via API`;
  console.log(message);
  sendTelegramNotification(message);
  
  res.json({ isRunning: false });
});

app.post('/trade', async (req, res) => {
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

app.post('/ml/retrain', async (req, res) => {
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

app.post('/ml/predict', async (req, res) => {
  try {
    const predictions = await generatePredictions();
    res.json({ success: true, predictions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/signals/generate', async (req, res) => {
  try {
    const signals = await generateTradingSignals();
    res.json({ success: true, signals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/telegram/test', async (req, res) => {
  try {
    const { message } = req.body;
    await sendTelegramNotification(message || 'Test message from trading bot API');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/settings', (req, res) => {
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
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
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
      try {
        client.send(message);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
      }
    }
  });
}

export default app;