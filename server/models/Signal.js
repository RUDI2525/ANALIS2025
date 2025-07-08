import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Signal = sequelize.define('Signal', {
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
    allowNull: false
  },
  signal_type: {
    type: DataTypes.ENUM('BUY', 'SELL', 'HOLD'),
    allowNull: false
  },
  strength: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  confidence: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  price: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  indicators: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  reasons: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  technical_data: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'EXECUTED', 'EXPIRED', 'CANCELLED'),
    defaultValue: 'ACTIVE'
  },
  executed_at: {
    type: DataTypes.DATE
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  indexes: [
    { fields: ['symbol'] },
    { fields: ['signal_type'] },
    { fields: ['status'] },
    { fields: ['created_at'] }
  ]
});

export default Signal;