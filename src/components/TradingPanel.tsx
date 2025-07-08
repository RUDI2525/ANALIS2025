import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, Play, Square } from 'lucide-react';

interface TradingPanelProps {
  state: any;
  actions: any;
}

const TradingPanel: React.FC<TradingPanelProps> = ({ state, actions }) => {
  const [tradeSize, setTradeSize] = React.useState(0.01);
  const [selectedExchange, setSelectedExchange] = React.useState('binance');

  const handleTrade = async (signal: 'BUY' | 'SELL') => {
    try {
      await actions.executeTrade(signal, tradeSize, selectedExchange);
    } catch (error) {
      console.error('Trade execution error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trading Controls */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Manual Trading</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Trade Size</label>
            <input
              type="number"
              step="0.001"
              value={tradeSize}
              onChange={(e) => setTradeSize(parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Exchange</label>
            <select
              value={selectedExchange}
              onChange={(e) => setSelectedExchange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="binance">Binance</option>
              <option value="kraken">Kraken</option>
              <option value="tokocrypto">Tokocrypto</option>
              <option value="indodax">Indodax</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Current Price</label>
            <div className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white">
              ${state.currentPrice?.toLocaleString() || '0'}
            </div>
          </div>
        </div>
        
        <div className="flex space-x-4">
          <button
            onClick={() => handleTrade('BUY')}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
          >
            <TrendingUp className="w-5 h-5" />
            <span>BUY</span>
          </button>
          
          <button
            onClick={() => handleTrade('SELL')}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
          >
            <TrendingDown className="w-5 h-5" />
            <span>SELL</span>
          </button>
        </div>
      </div>

      {/* Position Management */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Position Management</h3>
        
        {state.positions?.length > 0 ? (
          <div className="space-y-3">
            {state.positions.map((position: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className={`w-3 h-3 rounded-full ${position.pnl >= 0 ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div>
                    <p className="text-white font-medium">{position.symbol}</p>
                    <p className="text-slate-400 text-sm">
                      {position.type} • {position.size} @ ${position.entryPrice?.toFixed(2)}
                    </p>
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
                
                <button
                  onClick={() => handleTrade('SELL')}
                  className="ml-4 px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
                >
                  Close
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No open positions</p>
          </div>
        )}
      </div>

      {/* Trading Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total P&L</p>
              <p className="text-2xl font-bold text-white">
                ${state.positions?.reduce((sum: number, pos: any) => sum + pos.pnl, 0).toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <DollarSign className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Win Rate</p>
              <p className="text-2xl font-bold text-white">
                {state.positions?.length > 0 
                  ? `${((state.positions.filter((p: any) => p.pnl > 0).length / state.positions.length) * 100).toFixed(1)}%`
                  : '0%'
                }
              </p>
            </div>
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Target className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Active Trades</p>
              <p className="text-2xl font-bold text-white">{state.positions?.length || 0}</p>
            </div>
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Play className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingPanel;