import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Position = sequelize.define('Position', {
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
    type: DataTypes.ENUM('LONG', 'SHORT'),
    allowNull: false
  },
  size: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  entry_price: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  current_price: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  unrealized_pnl: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  realized_pnl: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  stop_loss: {
    type: DataTypes.DECIMAL(20, 8)
  },
  take_profit: {
    type: DataTypes.DECIMAL(20, 8)
  },
  exchange: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'CLOSED', 'LIQUIDATED'),
    defaultValue: 'OPEN'
  },
  opened_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  closed_at: {
    type: DataTypes.DATE
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  indexes: [
    { fields: ['symbol'] },
    { fields: ['status'] },
    { fields: ['exchange'] },
    { fields: ['opened_at'] }
  ]
});

export default Position;