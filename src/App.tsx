import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, DollarSign, Bot, Settings, AlertCircle, Zap, Target, Brain, MessageCircle } from 'lucide-react';
import Dashboard from './components/Dashboard';
import TradingPanel from './components/TradingPanel.tsx';
import SignalsPanel from './components/SignalsPanel';
import PredictionsPanel from './components/PredictionsPanel';
import SettingsPanel from './components/SettingsPanel';
import { useTradingBot } from './hooks/useTradingBot';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { state, actions, isConnected } = useTradingBot();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'trading', label: 'Trading', icon: TrendingUp },
    { id: 'signals', label: 'Signals', icon: Zap },
    { id: 'predictions', label: 'AI Predictions', icon: Brain },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard state={state} actions={actions} />;
      case 'trading':
        return <TradingPanel state={state} actions={actions} />;
      case 'signals':
        return <SignalsPanel state={state} actions={actions} />;
      case 'predictions':
        return <PredictionsPanel state={state} actions={actions} />;
      case 'settings':
        return <SettingsPanel state={state} actions={actions} />;
      default:
        return <Dashboard state={state} actions={actions} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Bot className="w-8 h-8 text-blue-400" />
                <h1 className="text-xl font-bold text-white">AI Trading Bot</h1>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-semibold">
                  ${state.balance?.toLocaleString() || '0'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                {state.change24h >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-sm ${state.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {state.change24h?.toFixed(2)}%
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${state.isRunning ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className={`text-sm ${state.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                  {state.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-400 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;