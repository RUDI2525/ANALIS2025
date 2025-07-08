import { useState, useEffect, useCallback } from 'react';

interface TradingBotState {
  isRunning: boolean;
  currentPrice: number;
  change24h: number;
  volume: number;
  balance: number;
  positions: any[];
  signals: any[];
  predictions: any;
  sentimentData: any;
  exchangeStatus: any;
  notifications: any[];
  tradeHistory: any[];
  accuracyMetrics: any;
}

export function useTradingBot() {
  const [state, setState] = useState<TradingBotState>({
    isRunning: false,
    currentPrice: 0,
    change24h: 0,
    volume: 0,
    balance: 10000,
    positions: [],
    signals: [],
    predictions: {},
    sentimentData: {},
    exchangeStatus: {},
    notifications: [],
    tradeHistory: [],
    accuracyMetrics: {}
  });

  const [isConnected, setIsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    const connectWebSocket = () => {
      const websocket = new WebSocket('ws://localhost:3001');
      
      websocket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'state' || data.type === 'update') {
            setState(data.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
      
      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
      
      setWs(websocket);
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/dashboard');
        const data = await response.json();
        setState(prevState => ({
          ...prevState,
          ...data.status,
          ...data.portfolio,
          signals: data.signals || [],
          predictions: data.predictions || {},
          sentiment: data.sentiment || {},
          exchanges: data.exchanges || {},
          recentTrades: data.recentTrades || []
        }));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Actions
  const actions = {
    toggleBot: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/bot/toggle', {
          method: 'POST'
        });
        const data = await response.json();
        setState(prev => ({ ...prev, isRunning: data.isRunning }));
      } catch (error) {
        console.error('Error toggling bot:', error);
      }
    }, []),

    startBot: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/bot/start', {
          method: 'POST'
        });
        const data = await response.json();
        setState(prev => ({ ...prev, isRunning: data.isRunning }));
      } catch (error) {
        console.error('Error starting bot:', error);
      }
    }, []),

    stopBot: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/bot/stop', {
          method: 'POST'
        });
        const data = await response.json();
        setState(prev => ({ ...prev, isRunning: data.isRunning }));
      } catch (error) {
        console.error('Error stopping bot:', error);
      }
    }, []),

    executeTrade: useCallback(async (signal: string, size?: number, exchange?: string) => {
      try {
        const response = await fetch('http://localhost:3001/api/trade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ signal, size, exchange })
        });
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error executing trade:', error);
        throw error;
      }
    }, []),

    retrainModels: useCallback(async (timeframe?: string) => {
      try {
        const response = await fetch('http://localhost:3001/api/ml/retrain', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ timeframe })
        });
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error retraining models:', error);
        throw error;
      }
    }, []),

    generatePredictions: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/ml/predict', {
          method: 'POST'
        });
        const data = await response.json();
        setState(prev => ({ ...prev, predictions: data.predictions }));
        return data;
      } catch (error) {
        console.error('Error generating predictions:', error);
        throw error;
      }
    }, []),

    generateSignals: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/signals/generate', {
          method: 'POST'
        });
        const data = await response.json();
        setState(prev => ({ ...prev, signals: data.signals }));
        return data;
      } catch (error) {
        console.error('Error generating signals:', error);
        throw error;
      }
    }, []),

    sendTelegramTest: useCallback(async (message: string) => {
      try {
        const response = await fetch('http://localhost:3001/api/telegram/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        });
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error sending telegram test:', error);
        throw error;
      }
    }, []),

    updateSettings: useCallback(async (settings: any) => {
      try {
        const response = await fetch('http://localhost:3001/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(settings)
        });
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error updating settings:', error);
        throw error;
      }
    }, [])
  };

  return {
    state,
    actions,
    isConnected
  };
}