import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

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
  lastUpdate: string | null;
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
    accuracyMetrics: {},
    lastUpdate: null
  });

  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Connect to Socket.IO server
  useEffect(() => {
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket', 'polling']
    });
    
    newSocket.on('connect', () => {
      console.log('✅ Connected to trading bot server');
      setIsConnected(true);
      
      // Subscribe to all updates
      newSocket.emit('subscribe', ['all']);
    });
    
    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from trading bot server');
      setIsConnected(false);
    });
    
    newSocket.on('state', (data) => {
      console.log('📊 Received initial state:', data);
      setState(data);
    });
    
    newSocket.on('update', (update) => {
      console.log('🔄 Received update:', update.type, update.data);
      
      switch (update.type) {
        case 'priceUpdate':
          setState(prev => ({
            ...prev,
            currentPrice: update.data.price,
            change24h: update.data.percentage || 0,
            volume: update.data.volume || 0,
            lastUpdate: update.timestamp
          }));
          break;
          
        case 'signalsUpdate':
          setState(prev => ({
            ...prev,
            signals: update.data
          }));
          break;
          
        case 'predictionsUpdate':
          setState(prev => ({
            ...prev,
            predictions: update.data
          }));
          break;
          
        case 'portfolioUpdate':
          setState(prev => ({
            ...prev,
            positions: update.data.positions || [],
            balance: update.data.portfolioValue || prev.balance
          }));
          break;
          
        case 'tradeExecuted':
          setState(prev => ({
            ...prev,
            tradeHistory: [update.data, ...prev.tradeHistory.slice(0, 99)]
          }));
          break;
          
        case 'botStarted':
        case 'botStopped':
          setState(prev => ({
            ...prev,
            isRunning: update.data.isRunning
          }));
          break;
          
        default:
          console.log('Unknown update type:', update.type);
      }
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      setIsConnected(false);
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.close();
    };
  }, []);

  // Fetch initial dashboard data
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/dashboard');
        if (response.ok) {
          const data = await response.json();
          setState(prev => ({
            ...prev,
            ...data.status,
            positions: data.portfolio?.positions || [],
            balance: data.portfolio?.portfolioValue || prev.balance,
            signals: data.signals || [],
            predictions: data.predictions || {},
            sentimentData: data.sentiment || {},
            exchangeStatus: data.exchanges || {},
            tradeHistory: data.recentTrades || []
          }));
        }
      } catch (error) {
        console.error('❌ Error fetching dashboard data:', error);
      }
    };

    fetchDashboardData();
    
    // Fetch data every 30 seconds as fallback
    const interval = setInterval(fetchDashboardData, 30000);
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
        if (data.success) {
          setState(prev => ({ ...prev, isRunning: data.isRunning }));
        }
        return data;
      } catch (error) {
        console.error('❌ Error toggling bot:', error);
        throw error;
      }
    }, []),

    startBot: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/bot/start', {
          method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
          setState(prev => ({ ...prev, isRunning: data.isRunning }));
        }
        return data;
      } catch (error) {
        console.error('❌ Error starting bot:', error);
        throw error;
      }
    }, []),

    stopBot: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/bot/stop', {
          method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
          setState(prev => ({ ...prev, isRunning: data.isRunning }));
        }
        return data;
      } catch (error) {
        console.error('❌ Error stopping bot:', error);
        throw error;
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
        console.error('❌ Error executing trade:', error);
        throw error;
      }
    }, []),

    trainModel: useCallback(async (symbol?: string, timeframe?: string, modelType?: string) => {
      try {
        const response = await fetch('http://localhost:3001/api/ml/train', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ symbol, timeframe, modelType })
        });
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('❌ Error training model:', error);
        throw error;
      }
    }, []),

    generatePredictions: useCallback(async (symbol?: string, timeframe?: string, modelType?: string) => {
      try {
        const response = await fetch('http://localhost:3001/api/ml/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ symbol, timeframe, modelType })
        });
        const data = await response.json();
        if (data.success && data.prediction) {
          setState(prev => ({
            ...prev,
            predictions: {
              ...prev.predictions,
              [`${symbol || 'BTC/USDT'}_${timeframe || '1h'}`]: data.prediction
            }
          }));
        }
        return data;
      } catch (error) {
        console.error('❌ Error generating predictions:', error);
        throw error;
      }
    }, []),

    generateSignals: useCallback(async (symbols?: string[]) => {
      try {
        const response = await fetch('http://localhost:3001/api/signals/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ symbols })
        });
        const data = await response.json();
        if (data.success) {
          setState(prev => ({ ...prev, signals: data.signals }));
        }
        return data;
      } catch (error) {
        console.error('❌ Error generating signals:', error);
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
        console.error('❌ Error sending telegram test:', error);
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
        console.error('❌ Error updating settings:', error);
        throw error;
      }
    }, []),

    getHistoricalData: useCallback(async (symbol: string, timeframe: string, limit?: number) => {
      try {
        const response = await fetch(
          `http://localhost:3001/api/historical/${symbol}/${timeframe}?limit=${limit || 100}`
        );
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('❌ Error fetching historical data:', error);
        throw error;
      }
    }, []),

    getPositions: useCallback(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/positions');
        const data = await response.json();
        setState(prev => ({ ...prev, positions: data }));
        return data;
      } catch (error) {
        console.error('❌ Error fetching positions:', error);
        throw error;
      }
    }, []),

    getTrades: useCallback(async (limit?: number) => {
      try {
        const response = await fetch(`http://localhost:3001/api/trades?limit=${limit || 50}`);
        const data = await response.json();
        setState(prev => ({ ...prev, tradeHistory: data }));
        return data;
      } catch (error) {
        console.error('❌ Error fetching trades:', error);
        throw error;
      }
    }, []),

    getSignals: useCallback(async (symbol?: string, timeframe?: string) => {
      try {
        const params = new URLSearchParams();
        if (symbol) params.append('symbol', symbol);
        if (timeframe) params.append('timeframe', timeframe);
        
        const response = await fetch(`http://localhost:3001/api/signals?${params}`);
        const data = await response.json();
        setState(prev => ({ ...prev, signals: data }));
        return data;
      } catch (error) {
        console.error('❌ Error fetching signals:', error);
        throw error;
      }
    }, [])
  };

  return {
    state,
    actions,
    isConnected,
    socket
  };
}