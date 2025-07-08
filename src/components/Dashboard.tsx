import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Target, Brain, Zap, AlertCircle } from 'lucide-react';

interface DashboardProps {
  state: any;
  actions: any;
}

const Dashboard: React.FC<DashboardProps> = ({ state, actions }) => {
  const totalPnL = state.positions?.reduce((sum: number, pos: any) => sum + pos.pnl, 0) || 0;
  const totalValue = state.balance + state.positions?.reduce((sum: number, pos: any) => sum + (pos.size * pos.currentPrice), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Current Price</p>
              <p className="text-2xl font-bold text-white">${state.currentPrice?.toLocaleString() || '0'}</p>
            </div>
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            {state.change24h >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-400 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400 mr-1" />
            )}
            <span className={`text-sm ${state.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {state.change24h?.toFixed(2)}% (24h)
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Portfolio Value</p>
              <p className="text-2xl font-bold text-white">${totalValue.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-green-500/20 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            <span className={`text-sm ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)} P&L
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Active Positions</p>
              <p className="text-2xl font-bold text-white">{state.positions?.length || 0}</p>
            </div>
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Target className="w-6 h-6 text-purple-400" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            <span className="text-sm text-slate-400">
              {state.positions?.filter((p: any) => p.pnl > 0).length || 0} profitable
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">AI Signals</p>
              <p className="text-2xl font-bold text-white">{state.signals?.length || 0}</p>
            </div>
            <div className="p-3 bg-yellow-500/20 rounded-lg">
              <Zap className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            <span className="text-sm text-slate-400">
              {state.signals?.filter((s: any) => s.strength > 70).length || 0} strong
            </span>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Bot Control</h3>
        <div className="flex items-center space-x-4">
          <button
            onClick={actions.toggleBot}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              state.isRunning
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {state.isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>
          
          <button
            onClick={actions.generateSignals}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            Generate Signals
          </button>
          
          <button
            onClick={actions.generatePredictions}
            className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
          >
            Update Predictions
          </button>
          
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${state.isRunning ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-slate-400">
              {state.isRunning ? 'Bot is running' : 'Bot is stopped'}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Trades */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Trades</h3>
          <div className="space-y-3">
            {state.tradeHistory?.slice(0, 5).map((trade: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${trade.type === 'BUY' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div>
                    <p className="text-white font-medium">{trade.type} {trade.symbol}</p>
                    <p className="text-slate-400 text-sm">{trade.size} @ ${trade.price?.toFixed(2)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white">${trade.cost?.toFixed(2)}</p>
                  <p className="text-slate-400 text-sm">{trade.exchange}</p>
                </div>
              </div>
            )) || (
              <div className="text-center py-8 text-slate-400">
                No recent trades
              </div>
            )}
          </div>
        </div>

        {/* Active Positions */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Active Positions</h3>
          <div className="space-y-3">
            {state.positions?.slice(0, 5).map((position: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${position.pnl >= 0 ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div>
                    <p className="text-white font-medium">{position.symbol}</p>
                    <p className="text-slate-400 text-sm">{position.size} @ ${position.entryPrice?.toFixed(2)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {position.pnl >= 0 ? '+' : ''}${position.pnl?.toFixed(2)}
                  </p>
                  <p className={`text-sm ${position.pnlPercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {position.pnlPercentage >= 0 ? '+' : ''}{position.pnlPercentage?.toFixed(2)}%
                  </p>
                </div>
              </div>
            )) || (
              <div className="text-center py-8 text-slate-400">
                No active positions
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exchange Status */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Exchange Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(state.exchangeStatus || {}).map(([name, status]: [string, any]) => (
            <div key={name} className="flex items-center space-x-3 p-3 bg-slate-700/50 rounded-lg">
              <div className={`w-3 h-3 rounded-full ${status.status === 'connected' ? 'bg-green-400' : 'bg-red-400'}`} />
              <div>
                <p className="text-white font-medium capitalize">{name}</p>
                <p className="text-slate-400 text-sm">{status.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;