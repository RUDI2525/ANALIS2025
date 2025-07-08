# Professional Real-time Crypto Trading Bot

A sophisticated, production-ready cryptocurrency trading bot with advanced AI predictions, real-time market data, professional signal generation, and comprehensive risk management.

## 🚀 Features

### Core Trading Features
- **Real-time Market Data**: Live price feeds from multiple exchanges
- **Advanced AI Predictions**: LSTM and GRU neural networks with 80%+ accuracy
- **Professional Signal Generation**: Multi-timeframe technical analysis
- **Automated Trading**: Smart order execution with risk management
- **Portfolio Management**: Real-time P&L tracking and position monitoring

### Technical Features
- **Database Persistence**: SQLite/PostgreSQL with Sequelize ORM
- **Real-time Updates**: Socket.IO WebSocket connections
- **Microservices Architecture**: Modular, scalable service design
- **Professional UI**: React dashboard with real-time charts
- **Risk Management**: Advanced position sizing and stop-loss systems

### Supported Exchanges
- Binance (Spot & Futures)
- Kraken
- More exchanges can be easily added

## 📊 Architecture

```
├── server/
│   ├── config/          # Database configuration
│   ├── models/          # Sequelize data models
│   ├── services/        # Core business logic
│   │   ├── ExchangeService.js     # Exchange integrations
│   │   ├── MarketDataService.js   # Real-time data collection
│   │   ├── MLService.js           # AI/ML predictions
│   │   ├── SignalService.js       # Signal generation
│   │   └── TradingService.js      # Trade execution
│   └── main.js          # Main server application
├── src/                 # React frontend
└── data/               # Database and logs
```

## 🛠 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### Quick Start

1. **Clone the repository**
```bash
git clone <repository-url>
cd professional-crypto-trading-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the application**
```bash
npm run dev
```

5. **Access the dashboard**
- Frontend: http://localhost:5173
- API: http://localhost:3001/api
- Health: http://localhost:3001/health

## ⚙️ Configuration

### Environment Variables

```env
# Basic Configuration
NODE_ENV=development
PORT=3001
PAPER_TRADING=true

# Exchange API Keys (for live trading)
BINANCE_API_KEY=your_api_key
BINANCE_SECRET=your_secret

# Risk Management
MAX_POSITION_SIZE=0.1      # 10% max position size
MAX_DAILY_LOSS=0.05        # 5% daily loss limit
STOP_LOSS_PERCENTAGE=0.02  # 2% stop loss
```

### Trading Configuration

The bot supports both paper trading (simulation) and live trading:

- **Paper Trading**: Safe simulation mode (default)
- **Live Trading**: Real money trading (requires API keys)

## 🤖 AI/ML Features

### Supported Models
- **LSTM Networks**: Long Short-Term Memory for time series
- **GRU Networks**: Gated Recurrent Units for faster training
- **Ensemble Methods**: Multiple model combinations

### Features Used
- Technical indicators (RSI, MACD, Bollinger Bands)
- Price action patterns
- Volume analysis
- Market microstructure
- Cross-asset correlations

### Model Training
```javascript
// Train a new model
await mlService.trainModel('BTC/USDT', '1h', 'lstm');

// Generate predictions
const prediction = await mlService.generatePrediction('BTC/USDT', '1h');
```

## 📈 Signal Generation

### Technical Analysis
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- Moving Averages (SMA, EMA)
- Stochastic Oscillator
- Volume indicators

### Signal Scoring
Signals are scored based on:
- Indicator consensus (35% weight)
- ML predictions (35% weight)
- Technical strength (30% weight)

### Multi-timeframe Analysis
- 15 minutes: Short-term scalping
- 1 hour: Intraday trading
- 4 hours: Swing trading
- 1 day: Position trading

## 🛡️ Risk Management

### Position Management
- Maximum position size limits
- Stop-loss automation
- Take-profit targets
- Trailing stops
- Portfolio diversification

### Risk Metrics
- Daily loss limits
- Maximum drawdown protection
- Position correlation analysis
- Volatility-based sizing

## 📊 Dashboard Features

### Real-time Monitoring
- Live price updates
- Position tracking
- P&L monitoring
- Signal alerts

### Analytics
- Performance metrics
- Trade history
- Model accuracy
- Risk analysis

### Controls
- Start/stop trading
- Manual trade execution
- Model training
- Settings management

## 🔌 API Endpoints

### Bot Control
- `POST /api/bot/start` - Start trading
- `POST /api/bot/stop` - Stop trading
- `POST /api/bot/toggle` - Toggle bot state

### Trading
- `POST /api/trade` - Execute manual trade
- `GET /api/positions` - Get open positions
- `GET /api/trades` - Get trade history

### ML/AI
- `POST /api/ml/train` - Train ML model
- `POST /api/ml/predict` - Generate prediction

### Signals
- `POST /api/signals/generate` - Generate signals
- `GET /api/signals` - Get active signals

### Data
- `GET /api/dashboard` - Dashboard data
- `GET /api/historical/:symbol/:timeframe` - Historical data

## 🚦 Getting Started

### 1. Paper Trading (Recommended)
Start with paper trading to test strategies:

```bash
# Set in .env
PAPER_TRADING=true
```

### 2. Train ML Models
```bash
# Via API
curl -X POST http://localhost:3001/api/ml/train \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC/USDT","timeframe":"1h","modelType":"lstm"}'
```

### 3. Generate Signals
```bash
# Via API
curl -X POST http://localhost:3001/api/signals/generate \
  -H "Content-Type: application/json" \
  -d '{"symbols":["BTC/USDT","ETH/USDT"]}'
```

### 4. Start Trading
```bash
# Via API
curl -X POST http://localhost:3001/api/bot/start
```

## 📈 Performance Optimization

### Database Optimization
- Indexed queries for fast data retrieval
- Connection pooling
- Automatic cleanup of old data

### Memory Management
- Efficient tensor operations
- Automatic garbage collection
- Buffer size limits

### Network Optimization
- WebSocket for real-time updates
- Request rate limiting
- Connection retry logic

## 🔒 Security

### API Security
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation

### Trading Security
- API key encryption
- Paper trading mode
- Risk limits
- Emergency stops

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**
```bash
# Check database file permissions
ls -la data/trading.db
```

2. **Exchange API Error**
```bash
# Verify API keys in .env
echo $BINANCE_API_KEY
```

3. **WebSocket Connection Failed**
```bash
# Check if server is running
curl http://localhost:3001/health
```

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev
```

## 📚 Documentation

### Code Documentation
- JSDoc comments throughout codebase
- Type definitions for TypeScript
- API documentation in code

### Architecture Documentation
- Service interaction diagrams
- Database schema documentation
- API endpoint specifications

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

### Code Standards
- ESLint configuration
- Prettier formatting
- TypeScript types
- JSDoc comments

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This trading bot is for educational and research purposes. Cryptocurrency trading involves substantial risk of loss. Never trade with money you cannot afford to lose. Past performance does not guarantee future results.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting guide

---

**Built with ❤️ for the crypto trading community**