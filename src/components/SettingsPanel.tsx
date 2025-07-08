import React, { useState } from 'react';
import { Settings, Save, TestTube, Shield, Database, Bell } from 'lucide-react';

interface SettingsPanelProps {
  state: any;
  actions: any;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ state, actions }) => {
  const [settings, setSettings] = useState({
    symbol: 'BTC/USDT',
    paperTrading: true,
    riskPerTrade: 0.02,
    stopLossPct: 0.03,
    takeProfitPct: 0.05
  });

  const [testMessage, setTestMessage] = useState('Test message from trading bot dashboard');

  const handleSettingsChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    try {
      await actions.updateSettings(settings);
      alert('Settings saved successfully!');
    } catch (error) {
      alert('Error saving settings: ' + error);
    }
  };

  const handleTelegramTest = async () => {
    try {
      await actions.sendTelegramTest(testMessage);
      alert('Telegram test message sent!');
    } catch (error) {
      alert('Error sending telegram message: ' + error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trading Settings */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center space-x-3 mb-6">
          <Settings className="w-6 h-6 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Trading Settings</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Trading Symbol</label>
            <input
              type="text"
              value={settings.symbol}
              onChange={(e) => handleSettingsChange('symbol', e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Trading Mode</label>
            <select
              value={settings.paperTrading ? 'paper' : 'live'}
              onChange={(e) => handleSettingsChange('paperTrading', e.target.value === 'paper')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="paper">Paper Trading</option>
              <option value="live">Live Trading</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Risk Per Trade (%)</label>
            <input
              type="number"
              step="0.001"
              value={settings.riskPerTrade}
              onChange={(e) => handleSettingsChange('riskPerTrade', parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Stop Loss (%)</label>
            <input
              type="number"
              step="0.001"
              value={settings.stopLossPct}
              onChange={(e) => handleSettingsChange('stopLossPct', parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Take Profit (%)</label>
            <input
              type="number"
              step="0.001"
              value={settings.takeProfitPct}
              onChange={(e) => handleSettingsChange('takeProfitPct', parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSaveSettings}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Exchange Status */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center space-x-3 mb-6">
          <Database className="w-6 h-6 text-green-400" />
          <h3 className="text-lg font-semibold text-white">Exchange Status</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(state.exchangeStatus || {}).map(([name, status]: [string, any]) => (
            <div key={name} className="p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-white capitalize">{name}</h4>
                <div className={`w-3 h-3 rounded-full ${status.status === 'connected' ? 'bg-green-400' : 'bg-red-400'}`} />
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status</span>
                  <span className={status.status === 'connected' ? 'text-green-400' : 'text-red-400'}>
                    {status.status}
                  </span>
                </div>
                
                {status.markets && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Markets</span>
                    <span className="text-white">{status.markets}</span>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Check</span>
                  <span className="text-slate-400">
                    {new Date(status.lastCheck).toLocaleTimeString()}
                  </span>
                </div>
                
                {status.error && (
                  <div className="mt-2">
                    <span className="text-red-400 text-xs">{status.error}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center space-x-3 mb-6">
          <Bell className="w-6 h-6 text-yellow-400" />
          <h3 className="text-lg font-semibold text-white">Notification Settings</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Test Message</label>
            <div className="flex space-x-3">
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter test message..."
              />
              <button
                onClick={handleTelegramTest}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <TestTube className="w-4 h-4" />
                <span>Send Test</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Trade Notifications</span>
              <input type="checkbox" defaultChecked className="rounded" />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Signal Alerts</span>
              <input type="checkbox" defaultChecked className="rounded" />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Error Notifications</span>
              <input type="checkbox" defaultChecked className="rounded" />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Daily Reports</span>
              <input type="checkbox" defaultChecked className="rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center space-x-3 mb-6">
          <Shield className="w-6 h-6 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Security Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="w-5 h-5 text-yellow-400" />
              <span className="text-yellow-400 font-medium">Security Notice</span>
            </div>
            <p className="text-slate-300 text-sm">
              API keys are stored securely. Never share your private keys or API secrets.
              Always use paper trading mode when testing new strategies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Two-Factor Auth</span>
              <span className="text-green-400 text-sm">Enabled</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">API Rate Limiting</span>
              <span className="text-green-400 text-sm">Active</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Encrypted Storage</span>
              <span className="text-green-400 text-sm">Enabled</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <span className="text-white">Session Timeout</span>
              <span className="text-white text-sm">24 hours</span>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">System Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-slate-400 text-sm">Bot Version</p>
            <p className="text-white font-medium">v2.0.0</p>
          </div>
          
          <div className="text-center">
            <p className="text-slate-400 text-sm">Uptime</p>
            <p className="text-white font-medium">
              {state.lastUpdate ? 
                Math.floor((Date.now() - new Date(state.lastUpdate).getTime()) / 1000 / 60) + 'm' 
                : 'N/A'
              }
            </p>
          </div>
          
          <div className="text-center">
            <p className="text-slate-400 text-sm">Last Update</p>
            <p className="text-white font-medium">
              {state.lastUpdate ? 
                new Date(state.lastUpdate).toLocaleTimeString() 
                : 'Never'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;