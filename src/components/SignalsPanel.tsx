import React from 'react';
import { Zap, TrendingUp, TrendingDown, Activity, Clock, Target } from 'lucide-react';

interface SignalsPanelProps {
  state: any;
  actions: any;
}

const SignalsPanel: React.FC<SignalsPanelProps> = ({ state, actions }) => {
  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY': return 'text-green-400 bg-green-500/20';
      case 'SELL': return 'text-red-400 bg-red-500/20';
      default: return 'text-yellow-400 bg-yellow-500/20';
    }
  };

  const getStrengthColor = (strength: number) => {
    if (strength >= 80) return 'text-green-400';
    if (strength >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Signal Generation Controls */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Trading Signals</h3>
          <button
            onClick={actions.generateSignals}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <Zap className="w-4 h-4" />
            <span>Generate Signals</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-slate-400 text-sm">Total Signals</p>
            <p className="text-2xl font-bold text-white">{state.signals?.length || 0}</p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-sm">Strong Signals</p>
            <p className="text-2xl font-bold text-green-400">
              {state.signals?.filter((s: any) => s.strength > 70).length || 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-sm">Last Update</p>
            <p className="text-sm text-slate-400">
              {state.signals?.length > 0 
                ? new Date(state.signals[0].timestamp).toLocaleTimeString()
                : 'Never'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Active Signals */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Active Signals</h3>
        
        {state.signals?.length > 0 ? (
          <div className="space-y-4">
            {state.signals.map((signal: any, index: number) => (
              <div key={index} className="p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getSignalColor(signal.signal)}`}>
                      {signal.signal}
                    </div>
                    <span className="text-white font-medium">{signal.timeframe}</span>
                    <span className={`text-sm font-medium ${getStrengthColor(signal.strength)}`}>
                      {signal.strength?.toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2 text-slate-400 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(signal.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Signal Indicators */}
                <div className="mb-3">
                  <p className="text-slate-400 text-sm mb-2">Active Indicators:</p>
                  <div className="flex flex-wrap gap-2">
                    {signal.indicators?.map((indicator: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                        {indicator}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Signal Reasons */}
                {signal.reasons && (
                  <div className="mb-3">
                    <p className="text-slate-400 text-sm mb-2">Reasons:</p>
                    <ul className="text-sm text-slate-300 space-y-1">
                      {signal.reasons.map((reason: string, idx: number) => (
                        <li key={idx} className="flex items-center space-x-2">
                          <div className="w-1 h-1 bg-blue-400 rounded-full" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Technical Data */}
                {signal.technicals && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-400">RSI</p>
                      <p className="text-white">{signal.technicals.rsi?.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">SMA20</p>
                      <p className="text-white">${signal.technicals.sma20?.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Volume Ratio</p>
                      <p className="text-white">{signal.technicals.volumeRatio?.toFixed(2)}x</p>
                    </div>
                    <div>
                      <p className="text-slate-400">MACD</p>
                      <p className="text-white">{signal.technicals.macd?.macd?.toFixed(4)}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No signals generated yet</p>
            <p className="text-sm mt-2">Click "Generate Signals" to analyze current market conditions</p>
          </div>
        )}
      </div>

      {/* Signal Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <h4 className="text-lg font-semibold text-white mb-4">Signal Distribution</h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-slate-300">Buy Signals</span>
              </div>
              <span className="text-green-400 font-medium">
                {state.signals?.filter((s: any) => s.signal === 'BUY').length || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-slate-300">Sell Signals</span>
              </div>
              <span className="text-red-400 font-medium">
                {state.signals?.filter((s: any) => s.signal === 'SELL').length || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-yellow-400" />
                <span className="text-slate-300">Hold Signals</span>
              </div>
              <span className="text-yellow-400 font-medium">
                {state.signals?.filter((s: any) => s.signal === 'HOLD').length || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <h4 className="text-lg font-semibold text-white mb-4">Signal Strength</h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Very Strong (80%+)</span>
              <span className="text-green-400 font-medium">
                {state.signals?.filter((s: any) => s.strength >= 80).length || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Strong (60-79%)</span>
              <span className="text-yellow-400 font-medium">
                {state.signals?.filter((s: any) => s.strength >= 60 && s.strength < 80).length || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Weak (&lt;60%)</span>
              <span className="text-red-400 font-medium">
                {state.signals?.filter((s: any) => s.strength < 60).length || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalsPanel;