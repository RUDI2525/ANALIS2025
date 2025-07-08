const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

/**
 * Professional Logging System
 * Features: Multiple log levels, file rotation, formatting, performance tracking
 */
class Logger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || 'info';
        this.logDir = options.logDir || './logs';
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.maxFiles = options.maxFiles || 5;
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile !== false;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };
        
        this.colors = {
            error: '\x1b[31m',  // Red
            warn: '\x1b[33m',   // Yellow
            info: '\x1b[36m',   // Cyan
            debug: '\x1b[32m',  // Green
            trace: '\x1b[35m',  // Magenta
            reset: '\x1b[0m'
        };
        
        this.initializeLogDir();
    }
    
    /**
     * Initialize log directory
     */
    initializeLogDir() {
        if (this.enableFile && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    /**
     * Check if log level should be output
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }
    
    /**
     * Format log message
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const pid = process.pid;
        
        let logObj = {
            timestamp,
            level: level.toUpperCase(),
            pid,
            message
        };
        
        // Add metadata if provided
        if (Object.keys(meta).length > 0) {
            logObj.meta = meta;
        }
        
        // Add stack trace for errors
        if (level === 'error' && meta.error instanceof Error) {
            logObj.stack = meta.error.stack;
        }
        
        return logObj;
    }
    
    /**
     * Format for console output
     */
    formatConsole(logObj) {
        const color = this.colors[logObj.level.toLowerCase()] || '';
        const reset = this.colors.reset;
        
        let output = `${color}[${logObj.timestamp}] ${logObj.level}:${reset} ${logObj.message}`;
        
        if (logObj.meta && Object.keys(logObj.meta).length > 0) {
            output += `\n${color}Meta:${reset} ${JSON.stringify(logObj.meta, null, 2)}`;
        }
        
        if (logObj.stack) {
            output += `\n${color}Stack:${reset} ${logObj.stack}`;
        }
        
        return output;
    }
    
    /**
     * Write to file
     */
    async writeToFile(logObj) {
        if (!this.enableFile) return;
        
        const filename = `trading-${new Date().toISOString().split('T')[0]}.log`;
        const filepath = path.join(this.logDir, filename);
        
        const logLine = JSON.stringify(logObj) + '\n';
        
        try {
            // Check file size and rotate if necessary
            await this.rotateLogFile(filepath);
            
            // Append to file
            await promisify(fs.appendFile)(filepath, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    
    /**
     * Rotate log file if it exceeds max size
     */
    async rotateLogFile(filepath) {
        try {
            const stats = await promisify(fs.stat)(filepath);
            
            if (stats.size > this.maxFileSize) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedPath = filepath.replace('.log', `-${timestamp}.log`);
                
                await promisify(fs.rename)(filepath, rotatedPath);
                
                // Clean up old log files
                await this.cleanupOldLogs();
            }
        } catch (error) {
            // File doesn't exist yet, which is fine
            if (error.code !== 'ENOENT') {
                console.error('Error rotating log file:', error);
            }
        }
    }
    
    /**
     * Clean up old log files
     */
    async cleanupOldLogs() {
        try {
            const files = await promisify(fs.readdir)(this.logDir);
            const logFiles = files
                .filter(file => file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.logDir, file),
                    stat: fs.statSync(path.join(this.logDir, file))
                }))
                .sort((a, b) => b.stat.mtime - a.stat.mtime);
            
            // Remove oldest files if exceeding max files
            if (logFiles.length > this.maxFiles) {
                const filesToDelete = logFiles.slice(this.maxFiles);
                for (const file of filesToDelete) {
                    await promisify(fs.unlink)(file.path);
                }
            }
        } catch (error) {
            console.error('Error cleaning up old logs:', error);
        }
    }
    
    /**
     * Core logging method
     */
    async log(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;
        
        const logObj = this.formatMessage(level, message, meta);
        
        // Console output
        if (this.enableConsole) {
            console.log(this.formatConsole(logObj));
        }
        
        // File output
        await this.writeToFile(logObj);
    }
    
    /**
     * Error logging
     */
    async error(message, error = null, meta = {}) {
        const logMeta = { ...meta };
        if (error) {
            logMeta.error = error;
        }
        await this.log('error', message, logMeta);
    }
    
    /**
     * Warning logging
     */
    async warn(message, meta = {}) {
        await this.log('warn', message, meta);
    }
    
    /**
     * Info logging
     */
    async info(message, meta = {}) {
        await this.log('info', message, meta);
    }
    
    /**
     * Debug logging
     */
    async debug(message, meta = {}) {
        await this.log('debug', message, meta);
    }
    
    /**
     * Trace logging
     */
    async trace(message, meta = {}) {
        await this.log('trace', message, meta);
    }
    
    /**
     * Trading-specific logging methods
     */
    async trade(action, symbol, data = {}) {
        await this.info(`TRADE: ${action} ${symbol}`, {
            action,
            symbol,
            ...data,
            timestamp: new Date().toISOString()
        });
    }
    
    async order(orderId, status, data = {}) {
        await this.info(`ORDER: ${orderId} - ${status}`, {
            orderId,
            status,
            ...data,
            timestamp: new Date().toISOString()
        });
    }
    
    async performance(metric, value, meta = {}) {
        await this.info(`PERFORMANCE: ${metric} = ${value}`, {
            metric,
            value,
            ...meta,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Performance timing
     */
    startTimer(label) {
        const start = process.hrtime.bigint();
        return {
            end: () => {
                const duration = process.hrtime.bigint() - start;
                const ms = Number(duration) / 1000000;
                this.performance(`Timer: ${label}`, `${ms.toFixed(2)}ms`);
                return ms;
            }
        };
    }
    
    /**
     * Memory usage logging
     */
    async logMemoryUsage() {
        const usage = process.memoryUsage();
        await this.debug('Memory Usage', {
            rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(usage.external / 1024 / 1024)}MB`
        });
    }
    
    /**
     * Create child logger with context
     */
    child(context = {}) {
        return new ChildLogger(this, context);
    }
}

/**
 * Child logger with persistent context
 */
class ChildLogger {
    constructor(parent, context) {
        this.parent = parent;
        this.context = context;
    }
    
    async log(level, message, meta = {}) {
        const combinedMeta = { ...this.context, ...meta };
        await this.parent.log(level, message, combinedMeta);
    }
    
    async error(message, error = null, meta = {}) {
        const combinedMeta = { ...this.context, ...meta };
        await this.parent.error(message, error, combinedMeta);
    }
    
    async warn(message, meta = {}) {
        const combinedMeta = { ...this.context, ...meta };
        await this.parent.warn(message, combinedMeta);
    }
    
    async info(message, meta = {}) {
        const combinedMeta = { ...this.context, ...meta };
        await this.parent.info(message, combinedMeta);
    }
    
    async debug(message, meta = {}) {
        const combinedMeta = { ...this.context, ...meta };
        await this.parent.debug(message, combinedMeta);
    }
    
    async trace(message, meta = {}) {
        const combinedMeta = { ...this.context, ...meta };
        await this.parent.trace(message, combinedMeta);
    }
    
    async trade(action, symbol, data = {}) {
        const combinedData = { ...this.context, ...data };
        await this.parent.trade(action, symbol, combinedData);
    }
    
    async order(orderId, status, data = {}) {
        const combinedData = { ...this.context, ...data };
        await this.parent.order(orderId, status, combinedData);
    }
    
    async performance(metric, value, meta = {}) {
        const combinedMeta = { ...this.context, ...meta };
        await this.parent.performance(metric, value, combinedMeta);
    }
    
    startTimer(label) {
        return this.parent.startTimer(label);
    }
    
    child(additionalContext = {}) {
        const newContext = { ...this.context, ...additionalContext };
        return new ChildLogger(this.parent, newContext);
    }
}

// Create default logger instance
const defaultLogger = new Logger({
    logLevel: process.env.LOG_LEVEL || 'info',
    logDir: process.env.LOG_DIR || './logs',
    enableConsole: process.env.LOG_CONSOLE !== 'false',
    enableFile: process.env.LOG_FILE !== 'false'
});

module.exports = {
    Logger,
    logger: defaultLogger
};