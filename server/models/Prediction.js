import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Prediction = sequelize.define('Prediction', {
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
  model_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  current_price: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  predicted_price: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  price_change: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  price_change_percent: {
    type: DataTypes.DECIMAL(8, 4),
    allowNull: false
  },
  direction: {
    type: DataTypes.ENUM('BULLISH', 'BEARISH', 'NEUTRAL'),
    allowNull: false
  },
  confidence: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  signal_strength: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  actual_price: {
    type: DataTypes.DECIMAL(20, 8)
  },
  accuracy: {
    type: DataTypes.DECIMAL(5, 2)
  },
  prediction_horizon: {
    type: DataTypes.INTEGER, // minutes
    defaultValue: 60
  },
  features_used: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  model_metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  indexes: [
    { fields: ['symbol'] },
    { fields: ['timeframe'] },
    { fields: ['model_name'] },
    { fields: ['created_at'] }
  ]
});

export default Prediction;