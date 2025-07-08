import React from 'react';
import { Brain, TrendingUp, TrendingDown, Target, RefreshCw, Clock } from 'lucide-react';

interface PredictionsPanelProps {
  state: any;
  actions: any;
}

const PredictionsPanel: React.FC<PredictionsPanelProps> = ({ state, actions }) => {
  const getPredictionColor = (direction: string) => {
    return direction === 'BULLISH' ? 'text-green-400' : 'text-red-400';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Prediction Controls */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">AI Predictions</h3>
          <div className="flex space-x-3">
            <button
              onClick={actions.generatePredictions}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Update Predictions</span>
            </button>
            <button
              onClick={() => actions.retrainModels()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Brain className="w-4 h-4" />
              <span>Retrain Models</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-slate-400 text-sm">Active Models</p>
            <p className="text-2xl font-bold text-white">
              {Object.keys(state.predictions || {}).length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-sm">Bullish Predictions</p>
            <p className="text-2xl font-bold text-green-400">
              {Object.values(state.predictions || {}).filter((p: any) => p.direction === 'BULLISH').length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-sm">Bearish Predictions</p>
            <p className="text-2xl font-bold text-red-400">
              {Object.values(state.predictions || {}).filter((p: any) => p.direction === 'BEARISH').length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-sm">Avg Confidence</p>
            <p className="text-2xl font-bold text-white">
              {Object.values(state.predictions || {}).length > 0
                ? `${(Object.values(state.predictions || {}).reduce((sum: number, p: any) => sum + p.confidence, 0) / Object.values(state.predictions || {}).length).toFixed(1)}%`
                : '0%'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Predictions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(state.predictions || {}).map(([timeframe, prediction]: [string, any]) => (
          <div key={timeframe} className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-white">{timeframe}</h4>
              <div className={`flex items-center space-x-1 ${getPredictionColor(prediction.direction)}`}>
                {prediction.direction === 'BULLISH' ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
                <span className="font-medium">{prediction.direction}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Predicted Price</span>
                <span className="text-white font-medium">
                  ${prediction.predictedPrice?.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Current Price</span>
                <span className="text-white font-medium">
                  ${prediction.currentPrice?.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Price Change</span>
                <span className={`font-medium ${getPredictionColor(prediction.direction)}`}>
                  {prediction.priceChangePercent >= 0 ? '+' : ''}{prediction.priceChangePercent?.toFixed(2)}%
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Confidence</span>
                <span className={`font-medium ${getConfidenceColor(prediction.confidence)}`}>
                  {prediction.confidence?.toFixed(1)}%
                </span>
              </div>

              {prediction.model_accuracy && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Model Accuracy</span>
                  <span className="text-white font-medium">
                    {(prediction.model_accuracy * 100).toFixed(1)}%
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-400">Last Updated</span>
                <span className="text-slate-400 text-sm">
                  {new Date(prediction.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Confidence Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Confidence Level</span>
                <span className={getConfidenceColor(prediction.confidence)}>
                  {prediction.confidence?.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    prediction.confidence >= 80 ? 'bg-green-400' :
                    prediction.confidence >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${prediction.confidence}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Model Performance */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Model Performance</h3>
        
        {state.accuracyMetrics && Object.keys(state.accuracyMetrics).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(state.accuracyMetrics).map(([timeframe, metrics]: [string, any]) => (
              <div key={timeframe} className="p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-white">{timeframe}</h4>
                  <span className={`text-sm font-medium ${getConfidenceColor(metrics.accuracy)}`}>
                    {metrics.accuracy?.toFixed(1)}%
                  </span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Loss</span>
                    <span className="text-white">{metrics.loss?.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">MAE</span>
                    <span className="text-white">{metrics.mae?.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Predictions</span>
                    <span className="text-white">{metrics.totalPredictions}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No model performance data available</p>
            <p className="text-sm mt-2">Train models to see accuracy metrics</p>
          </div>
        )}
      </div>

      {/* Training History */}
      {state.trainingHistory && state.trainingHistory.length > 0 && (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Training History</h3>
          
          <div className="space-y-3">
            {state.trainingHistory.slice(0, 10).map((training: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                  <div>
                    <p className="text-white font-medium">{training.timeframe}</p>
                    <p className="text-slate-400 text-sm">
                      {new Date(training.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-white">Loss: {training.loss?.toFixed(4)}</p>
                  <p className="text-slate-400 text-sm">
                    Val Loss: {training.val_loss?.toFixed(4)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!state.predictions || Object.keys(state.predictions).length === 0) && (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="text-center py-8 text-slate-400">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No predictions available</p>
            <p className="text-sm mt-2">Click "Update Predictions" to generate AI predictions</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictionsPanel;