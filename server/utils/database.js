const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { logger } = require('./logger');

/**
 * Database Management System for Trading Bot
 * Features: SQLite integration, connection pooling, migrations, trading-specific tables
 */
class Database {
    constructor(options = {}) {
        this.dbPath = options.dbPath || process.env.DB_PATH || './data/trading.db';
        this.enableWAL = options.enableWAL !== false;
        this.busyTimeout = options.busyTimeout || 30000;
        this.db = null;
        this.isConnected = false;
        
        // Initialize logger
        this.logger = logger.child({ module: 'Database' });
        
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }
    
    /**
     * Connect to database
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    this.logger.error('Database connection failed', err);
                    reject(err);
                } else {
                    this.logger.info('Database connected successfully', { path: this.dbPath });
                    this.isConnected = true;
                    this.configure().then(resolve).catch(reject);
                }
            });
        });
    }
    
    /**
     * Configure database settings
     */
    async configure() {
        try {
            // Set busy timeout
            await this.run(`PRAGMA busy_timeout = ${this.busyTimeout}`);
            
            // Enable WAL mode for better concurrency
            if (this.enableWAL) {
                await this.run('PRAGMA journal_mode = WAL');
            }
            
            // Enable foreign keys
            await this.run('PRAGMA foreign_keys = ON');
            
            // Set synchronous mode
            await this.run('PRAGMA synchronous = NORMAL');
            
            this.logger.info('Database configured successfully');
        } catch (error) {
            this.logger.error('Database configuration failed', error);
            throw error;
        }
    }
    
    /**
     * Initialize database tables
     */
    async initialize() {
        try {
            await this.createTables();
            await this.runMigrations();
            this.logger.info('Database initialized successfully');
        } catch (error) {
            this.logger.error('Database initialization failed', error);
            throw error;
        }
    }
    
    /**
     * Create database tables
     */
    async createTables() {
        const tables = [
            // Trades table
            `CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                type TEXT NOT NULL,
                quantity REAL NOT NULL,
                price REAL NOT NULL,
                value REAL NOT NULL,
                commission REAL DEFAULT 0,
                profit REAL DEFAULT 0,
                strategy TEXT,
                signal_id TEXT,
                order_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Orders table
            `CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT UNIQUE NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                type TEXT NOT NULL,
                quantity REAL NOT NULL,
                price REAL,
                stop_price REAL,
                time_in_force TEXT DEFAULT 'GTC',
                status TEXT NOT NULL,
                filled_quantity REAL DEFAULT 0,
                avg_price REAL DEFAULT 0,
                commission REAL DEFAULT 0,
                strategy TEXT,
                signal_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Portfolio table
            `CREATE TABLE IF NOT EXISTS portfolio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                quantity REAL NOT NULL,
                avg_price REAL NOT NULL,
                current_price REAL,
                unrealized_pnl REAL DEFAULT 0,
                realized_pnl REAL DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(symbol)
            )`,
            
            // Performance metrics table
            `CREATE TABLE IF NOT EXISTS performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                total_trades INTEGER DEFAULT 0,
                winning_trades INTEGER DEFAULT 0,
                losing_trades INTEGER DEFAULT 0,
                total_profit REAL DEFAULT 0,
                total_commission REAL DEFAULT 0,
                max_drawdown REAL DEFAULT 0,
                portfolio_value REAL DEFAULT 0,
                win_rate REAL DEFAULT 0,
                profit_factor REAL DEFAULT 0,
                sharpe_ratio REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date)
            )`,
            
            // Signals table
            `CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signal_id TEXT UNIQUE NOT NULL,
                symbol TEXT NOT NULL,
                action TEXT NOT NULL,
                price REAL NOT NULL,
                confidence REAL DEFAULT 0,
                strategy TEXT NOT NULL,
                indicators TEXT,
                status TEXT DEFAULT 'pending',
                executed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Balance history table
            `CREATE TABLE IF NOT EXISTS balance_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                balance REAL NOT NULL,
                available_balance REAL NOT NULL,
                locked_balance REAL DEFAULT 0,
                equity REAL NOT NULL,
                margin_used REAL DEFAULT 0,
                margin_available REAL DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Strategy parameters table
            `CREATE TABLE IF NOT EXISTS strategy_params (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_name TEXT NOT NULL,
                parameter_name TEXT NOT NULL,
                parameter_value TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(strategy_name, parameter_name)
            )`,
            
            // Error logs table
            `CREATE TABLE IF NOT EXISTS error_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_type TEXT NOT NULL,
                error_message TEXT NOT NULL,
                stack_trace TEXT,
                context TEXT,
                resolved BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];
        
        for (const table of tables) {
            await this.run(table);
        }
        
        // Create indexes
        await this.createIndexes();
    }
    
    /**
     * Create database indexes
     */
    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)',
            'CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy)',
            'CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol)',
            'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
            'CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol)',
            'CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status)',
            'CREATE INDEX IF NOT EXISTS idx_performance_date ON performance(date)',
            'CREATE INDEX IF NOT EXISTS idx_balance_history_timestamp ON balance_history(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at)'
        ];
        
        for (const index of indexes) {
            await this.run(index);
        }
    }
    
    /**
     * Run database migrations
     */
    async runMigrations() {
        // Check if migrations table exists
        const migrationTable = `CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT UNIQUE NOT NULL,
            description TEXT,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;
        
        await this.run(migrationTable);
        
        // Define migrations
        const migrations = [
            {
                version: '1.0.0',
                description: 'Initial database schema',
                sql: 'SELECT 1' // Already created in createTables
            },
            {
                version: '1.1.0',
                description: 'Add profit column to trades if not exists',
                sql: 'ALTER TABLE trades ADD COLUMN profit REAL DEFAULT 0'
            }
        ];
        
        // Execute migrations
        for (const migration of migrations) {
            try {
                const exists = await this.get(
                    'SELECT version FROM migrations WHERE version = ?',
                    [migration.version]
                );
                
                if (!exists) {
                    await this.run(migration.sql);
                    await this.run(
                        'INSERT INTO migrations (version, description) VALUES (?, ?)',
                        [migration.version, migration.description]
                    );
                    this.logger.info(`Migration ${migration.version} executed: ${migration.description}`);
                }
            } catch (error) {
                // Migration might already exist or be unnecessary
                this.logger.debug(`Migration ${migration.version} skipped or failed:`, error.message);
            }
        }
    }
    
    /**
     * Execute SQL query
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }
    
    /**
     * Get single row
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    
    /**
     * Get all rows
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    
    /**
     * Execute transaction
     */
    async transaction(callback) {
        await this.run('BEGIN TRANSACTION');
        try {
            const result = await callback();
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }
    
    /**
     * Trading-specific methods
     */
    
    /**
     * Insert trade record
     */
    async insertTrade(trade) {
        const sql = `INSERT INTO trades (
            symbol, side, type, quantity, price, value, commission, profit,
            strategy, signal_id, order_id, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            trade.symbol,
            trade.side,
            trade.type,
            trade.quantity,
            trade.price,
            trade.value,
            trade.commission || 0,
            trade.profit || 0,
            trade.strategy,
            trade.signal_id,
            trade.order_id,
            trade.timestamp || new Date().toISOString()
        ];
        
        return this.run(sql, params);
    }
    
    /**
     * Insert or update order
     */
    async upsertOrder(order) {
        const sql = `INSERT OR REPLACE INTO orders (
            order_id, symbol, side, type, quantity, price, stop_price,
            time_in_force, status, filled_quantity, avg_price, commission,
            strategy, signal_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            order.order_id,
            order.symbol,
            order.side,
            order.type,
            order.quantity,
            order.price,
            order.stop_price,
            order.time_in_force || 'GTC',
            order.status,
            order.filled_quantity || 0,
            order.avg_price || 0,
            order.commission || 0,
            order.strategy,
            order.signal_id,
            new Date().toISOString()
        ];
        
        return this.run(sql, params);
    }
    
    /**
     * Update portfolio position
     */
    async updatePortfolio(symbol, quantity, avgPrice, currentPrice = null) {
        const sql = `INSERT OR REPLACE INTO portfolio (
            symbol, quantity, avg_price, current_price, last_updated
        ) VALUES (?, ?, ?, ?, ?)`;
        
        const params = [
            symbol,
            quantity,
            avgPrice,
            currentPrice,
            new Date().toISOString()
        ];
        
        return this.run(sql, params);
    }
    
    /**
     * Insert signal
     */
    async insertSignal(signal) {
        const sql = `INSERT INTO signals (
            signal_id, symbol, action, price, confidence, strategy, indicators, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            signal.signal_id,
            signal.symbol,
            signal.action,
            signal.price,
            signal.confidence || 0,
            signal.strategy,
            JSON.stringify(signal.indicators || {}),
            signal.status || 'pending'
        ];
        
        return this.run(sql, params);
    }
    
    /**
     * Update signal status
     */
    async updateSignalStatus(signalId, status, executedAt = null) {
        const sql = `UPDATE signals SET status = ?, executed_at = ?, updated_at = ? WHERE signal_id = ?`;
        const params = [status, executedAt, new Date().toISOString(), signalId];
        return this.run(sql, params);
    }
    
    /**
     * Insert performance data
     */
    async insertPerformance(performance) {
        const sql = `INSERT OR REPLACE INTO performance (
            date, total_trades, winning_trades, losing_trades, total_profit,
            total_commission, max_drawdown, portfolio_value, win_rate,
            profit_factor, sharpe_ratio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            performance.date,
            performance.total_trades || 0,
            performance.winning_trades || 0,
            performance.losing_trades || 0,
            performance.total_profit || 0,
            performance.total_commission || 0,
            performance.max_drawdown || 0,
            performance.portfolio_value || 0,
            performance.win_rate || 0,
            performance.profit_factor || 0,
            performance.sharpe_ratio || 0
        ];
        
        return this.run(sql, params);
    }
    
    /**
     * Insert balance history
     */
    async insertBalanceHistory(balance) {
        const sql = `INSERT INTO balance_history (
            balance, available_balance, locked_balance, equity, margin_used, margin_available
        ) VALUES (?, ?, ?, ?, ?, ?)`;
        
        const params = [
            balance.balance,
            balance.available_balance,
            balance.locked_balance || 0,
            balance.equity,
            balance.margin_used || 0,
            balance.margin_available || 0
        ];
        
        return this.run(sql, params);
    }
    
    /**
     * Get trading statistics
     */
    async getTradingStats(days = 30) {
        const sql = `
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as winning_trades,
                SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) as losing_trades,
                SUM(profit) as total_profit,
                SUM(commission) as total_commission,
                AVG(profit) as avg_profit,
                MAX(profit) as max_profit,
                MIN(profit) as min_profit
            FROM trades 
            WHERE timestamp >= datetime('now', '-' || ? || ' days')
        `;
        
        return this.get(sql, [days]);
    }
    
    /**
     * Get portfolio summary
     */
    async getPortfolioSummary() {
        const sql = `
            SELECT 
                symbol,
                quantity,
                avg_price,
                current_price,
                (quantity * current_price) as market_value,
                (quantity * (current_price - avg_price)) as unrealized_pnl
            FROM portfolio 
            WHERE quantity != 0
        `;
        
        return this.all(sql);
    }
    
    /**
     * Get recent trades
     */
    async getRecentTrades(limit = 100) {
        const sql = `
            SELECT * FROM trades 
            ORDER BY timestamp DESC 
            LIMIT ?
        `;
        
        return this.all(sql, [limit]);
    }
    
    /**
     * Get active orders
     */
    async getActiveOrders() {
        const sql = `
            SELECT * FROM orders 
            WHERE status IN ('pending', 'partially_filled', 'new') 
            ORDER BY created_at DESC
        `;
        
        return this.all(sql);
    }
    
    /**
     * Get performance history
     */
    async getPerformanceHistory(days = 30) {
        const sql = `
            SELECT * FROM performance 
            WHERE date >= date('now', '-' || ? || ' days')
            ORDER BY date ASC
        `;
        
        return this.all(sql, [days]);
    }
    
    /**
     * Insert error log
     */
    async insertErrorLog(errorType, message, stackTrace = null, context = null) {
        const sql = `INSERT INTO error_logs (error_type, error_message, stack_trace, context) VALUES (?, ?, ?, ?)`;
        const params = [errorType, message, stackTrace, JSON.stringify(context)];
        return this.run(sql, params);
    }
    
    /**
     * Cleanup old data
     */
    async cleanup(options = {}) {
        const daysToKeep = options.daysToKeep || 90;
        const tables = ['trades', 'orders', 'balance_history', 'error_logs'];
        
        let deletedRows = 0;
        
        for (const table of tables) {
            const sql = `DELETE FROM ${table} WHERE created_at < datetime('now', '-' || ? || ' days')`;
            const result = await this.run(sql, [daysToKeep]);
            deletedRows += result.changes;
        }
        
        // Vacuum database to reclaim space
        await this.run('VACUUM');
        
        this.logger.info(`Database cleanup completed: ${deletedRows} rows deleted`);
        return deletedRows;
    }
    
    /**
     * Get database statistics
     */
    async getStats() {
        const tables = ['trades', 'orders', 'portfolio', 'signals', 'performance', 'balance_history', 'error_logs'];
        const stats = {};
        
        for (const table of tables) {
            const result = await this.get(`SELECT COUNT(*) as count FROM ${table}`);
            stats[table] = result.count;
        }
        
        // Database size
        const size = await this.get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
        stats.database_size = size.size;
        
        return stats;
    }
    
    /**
     * Close database connection
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        this.logger.error('Error closing database', err);
                        reject(err);
                    } else {
                        this.logger.info('Database connection closed');
                        this.isConnected = false;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
    
    /**
     * Check if database is connected
     */
    isHealthy() {
        return this.isConnected && this.db;
    }
}

// Create default database instance
const defaultDatabase = new Database({
    dbPath: process.env.DB_PATH || './data/trading.db',
    enableWAL: process.env.DB_WAL !== 'false'
});

module.exports = {
    Database,
    database: defaultDatabase
};