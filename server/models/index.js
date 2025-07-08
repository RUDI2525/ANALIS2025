import sequelize from '../config/database.js';
import Trade from './Trade.js';
import Position from './Position.js';
import MarketData from './MarketData.js';
import Signal from './Signal.js';
import Prediction from './Prediction.js';

// Define associations
Trade.belongsTo(Position, { foreignKey: 'position_id', as: 'position' });
Position.hasMany(Trade, { foreignKey: 'position_id', as: 'trades' });

Signal.hasMany(Trade, { foreignKey: 'signal_id', as: 'trades' });
Trade.belongsTo(Signal, { foreignKey: 'signal_id', as: 'signal' });

export {
  sequelize,
  Trade,
  Position,
  MarketData,
  Signal,
  Prediction
};

export default {
  sequelize,
  Trade,
  Position,
  MarketData,
  Signal,
  Prediction
};