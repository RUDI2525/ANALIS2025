import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Trade = sequelize.define('Trade', {
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
  side: {
    type: DataTypes.ENUM('BUY', 'SELL'),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT'),
    defaultValue: 'MARKET'
  },
  quantity: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  total_value: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  fee: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  profit_loss: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  exchange: {
    type: DataTypes.STRING,
    allowNull: false
  },
  order_id: {
    type: DataTypes.STRING,
    unique: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'FILLED', 'CANCELLED', 'FAILED'),
    defaultValue: 'PENDING'
  },
  strategy: {
    type: DataTypes.STRING
  },
  signal_id: {
    type: DataTypes.STRING
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  indexes: [
    { fields: ['symbol'] },
    { fields: ['created_at'] },
    { fields: ['status'] },
    { fields: ['exchange'] }
  ]
});

export default Trade;