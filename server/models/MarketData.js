import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MarketData = sequelize.define('MarketData', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  symbol: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  timeframe: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    index: true
  },
  open: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  high: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  low: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  close: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  volume: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  exchange: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  indexes: [
    { fields: ['symbol', 'timeframe', 'timestamp'], unique: true },
    { fields: ['timestamp'] },
    { fields: ['exchange'] }
  ]
});

export default MarketData;