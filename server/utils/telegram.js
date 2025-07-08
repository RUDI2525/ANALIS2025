const axios = require('axios');
const { logger } = require('./logger');

/**
 * Telegram Bot API Client for Trading Notifications
 * Features: Message formatting, rate limiting, error handling, message queuing
 */
class TelegramBot {
    constructor(options = {}) {
        this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = options.chatId || process.env.TELEGRAM_CHAT_ID;
        this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
        this.enabled = options.enabled !== false && this.botToken && this.chatId;
        
        // Rate limiting
        this.messageQueue = [];
        this.isProcessing = false;
        this.rateLimitDelay = options.rateLimitDelay || 1000; // 1 second between messages
        this.maxRetries = options.maxRetries || 3;
        
        // Message formatting
        this.parseMode = options.parseMode || 'HTML';
        this.disableWebPagePreview = options.disableWebPagePreview !== false;
        this.disableNotification = options.disableNotification || false;
        
        // Initialize logger
        this.logger = logger.child({ module: 'TelegramBot' });
        
        if (!this.enabled) {
            this.logger.warn('Telegram notifications disabled - missing bot token or chat ID');
        }
    }
    
    /**
     * Send message to Telegram
     */
    async sendMessage(text, options = {}) {
        if (!this.enabled) {
            this.logger.debug('Telegram disabled, skipping message', { text });
            return { success: false, reason: 'disabled' };
        }
        
        const message = {
            text,
            options: {
                chat_id: options.chatId || this.chatId,
                parse_mode: options.parseMode || this.parseMode,
                disable_web_page_preview: options.disableWebPagePreview !== false,
                disable_notification: options.disableNotification || this.disableNotification,
                ...options
            },
            timestamp: Date.now(),
            retries: 0
        };
        
        return new Promise((resolve) => {
            this.messageQueue.push({ message, resolve });
            this.processQueue();
        });
    }
    
    /**
     * Process message queue with rate limiting
     */
    async processQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        while (this.messageQueue.length > 0) {
            const { message, resolve } = this.messageQueue.shift();
            
            try {
                const result = await this.sendMessageDirect(message);
                resolve(result);
            } catch (error) {
                this.logger.error('Error processing message queue', error);
                resolve({ success: false, error: error.message });
            }
            
            // Rate limiting delay
            if (this.messageQueue.length > 0) {
                await this.sleep(this.rateLimitDelay);
            }
        }
        
        this.isProcessing = false;
    }
    
    /**
     * Send message directly to Telegram API
     */
    async sendMessageDirect(message) {
        try {
            const response = await axios.post(`${this.apiUrl}/sendMessage`, message.options, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            this.logger.debug('Telegram message sent successfully', {
                messageId: response.data.result.message_id,
                chatId: message.options.chat_id
            });
            
            return {
                success: true,
                messageId: response.data.result.message_id,
                response: response.data
            };
            
        } catch (error) {
            this.logger.error('Failed to send Telegram message', error, {
                text: message.text,
                chatId: message.options.chat_id,
                retries: message.retries
            });
            
            // Retry logic
            if (message.retries < this.maxRetries) {
                message.retries++;
                this.logger.info(`Retrying Telegram message (${message.retries}/${this.maxRetries})`);
                await this.sleep(1000 * message.retries); // Exponential backoff
                return this.sendMessageDirect(message);
            }
            
            return {
                success: false,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            };
        }
    }
    
    /**
     * Format trading-specific messages
     */
    formatTradeMessage(action, symbol, data = {}) {
        const emoji = this.getTradeEmoji(action);
        const timestamp = new Date().toLocaleString();
        
        let message = `${emoji} <b>${action.toUpperCase()}</b> ${symbol}\n`;
        message += `🕒 ${timestamp}\n`;
        
        if (data.price) {
            message += `💰 Price: ${data.price}\n`;
        }
        
        if (data.quantity) {
            message += `📊 Quantity: ${data.quantity}\n`;
        }
        
        if (data.value) {
            message += `💵 Value: ${data.value}\n`;
        }
        
        if (data.profit) {
            const profitEmoji = data.profit > 0 ? '📈' : '📉';
            message += `${profitEmoji} P&L: ${data.profit}\n`;
        }
        
        if (data.reason) {
            message += `📝 Reason: ${data.reason}\n`;
        }
        
        return message;
    }
    
    /**
     * Format order status messages
     */
    formatOrderMessage(orderId, status, data = {}) {
        const emoji = this.getOrderEmoji(status);
        const timestamp = new Date().toLocaleString();
        
        let message = `${emoji} <b>ORDER ${status.toUpperCase()}</b>\n`;
        message += `🔢 ID: ${orderId}\n`;
        message += `🕒 ${timestamp}\n`;
        
        if (data.symbol) {
            message += `🏷️ Symbol: ${data.symbol}\n`;
        }
        
        if (data.type) {
            message += `📋 Type: ${data.type}\n`;
        }
        
        if (data.side) {
            message += `↔️ Side: ${data.side}\n`;
        }
        
        if (data.price) {
            message += `💰 Price: ${data.price}\n`;
        }
        
        if (data.quantity) {
            message += `📊 Quantity: ${data.quantity}\n`;
        }
        
        if (data.executedQuantity) {
            message += `✅ Executed: ${data.executedQuantity}\n`;
        }
        
        return message;
    }
    
    /**
     * Format alert messages
     */
    formatAlertMessage(level, title, message, data = {}) {
        const emoji = this.getAlertEmoji(level);
        const timestamp = new Date().toLocaleString();
        
        let formattedMessage = `${emoji} <b>${level.toUpperCase()}: ${title}</b>\n`;
        formattedMessage += `🕒 ${timestamp}\n`;
        formattedMessage += `📄 ${message}\n`;
        
        if (data && Object.keys(data).length > 0) {
            formattedMessage += `\n<b>Details:</b>\n`;
            for (const [key, value] of Object.entries(data)) {
                formattedMessage += `• ${key}: ${value}\n`;
            }
        }
        
        return formattedMessage;
    }
    
    /**
     * Format performance summary
     */
    formatPerformanceSummary(data) {
        const timestamp = new Date().toLocaleString();
        
        let message = `📊 <b>PERFORMANCE SUMMARY</b>\n`;
        message += `🕒 ${timestamp}\n\n`;
        
        if (data.totalTrades) {
            message += `📈 Total Trades: ${data.totalTrades}\n`;
        }
        
        if (data.winRate) {
            message += `🎯 Win Rate: ${data.winRate}%\n`;
        }
        
        if (data.totalProfit) {
            const profitEmoji = data.totalProfit > 0 ? '💰' : '💸';
            message += `${profitEmoji} Total P&L: ${data.totalProfit}\n`;
        }
        
        if (data.dayProfit) {
            const dayEmoji = data.dayProfit > 0 ? '📈' : '📉';
            message += `${dayEmoji} Today's P&L: ${data.dayProfit}\n`;
        }
        
        if (data.portfolio) {
            message += `💼 Portfolio Value: ${data.portfolio}\n`;
        }
        
        if (data.maxDrawdown) {
            message += `⚠️ Max Drawdown: ${data.maxDrawdown}\n`;
        }
        
        return message;
    }
    
    /**
     * Get appropriate emoji for trade actions
     */
    getTradeEmoji(action) {
        const emojis = {
            'buy': '🟢',
            'sell': '🔴',
            'long': '📈',
            'short': '📉',
            'close': '🔄',
            'partial': '⚡'
        };
        return emojis[action.toLowerCase()] || '🔄';
    }
    
    /**
     * Get appropriate emoji for order status
     */
    getOrderEmoji(status) {
        const emojis = {
            'filled': '✅',
            'cancelled': '❌',
            'rejected': '🚫',
            'pending': '⏳',
            'partial': '⚡',
            'expired': '⏰'
        };
        return emojis[status.toLowerCase()] || '📋';
    }
    
    /**
     * Get appropriate emoji for alert levels
     */
    getAlertEmoji(level) {
        const emojis = {
            'error': '🚨',
            'warning': '⚠️',
            'info': 'ℹ️',
            'success': '✅',
            'critical': '🔴'
        };
        return emojis[level.toLowerCase()] || 'ℹ️';
    }
    
    /**
     * Trading-specific notification methods
     */
    async notifyTrade(action, symbol, data = {}) {
        const message = this.formatTradeMessage(action, symbol, data);
        return this.sendMessage(message);
    }
    
    async notifyOrder(orderId, status, data = {}) {
        const message = this.formatOrderMessage(orderId, status, data);
        return this.sendMessage(message);
    }
    
    async notifyAlert(level, title, message, data = {}) {
        const formattedMessage = this.formatAlertMessage(level, title, message, data);
        return this.sendMessage(formattedMessage);
    }
    
    async notifyPerformance(data) {
        const message = this.formatPerformanceSummary(data);
        return this.sendMessage(message);
    }
    
    async notifyError(error, context = {}) {
        const message = this.formatAlertMessage('error', 'Trading Error', error.message, {
            ...context,
            stack: error.stack?.split('\n')[0] // First line of stack trace
        });
        return this.sendMessage(message);
    }
    
    async notifyStartup(config = {}) {
        const message = this.formatAlertMessage('info', 'Bot Started', 'Trading bot has started successfully', {
            version: config.version,
            strategy: config.strategy,
            symbols: config.symbols?.join(', '),
            timeframe: config.timeframe
        });
        return this.sendMessage(message);
    }
    
    async notifyShutdown(reason = 'Manual shutdown') {
        const message = this.formatAlertMessage('info', 'Bot Stopped', `Trading bot has been stopped: ${reason}`, {
            uptime: this.getUptime(),
            timestamp: new Date().toLocaleString()
        });
        return this.sendMessage(message);
    }
    
    /**
     * Utility methods
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getUptime() {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    }
    
    /**
     * Test connection
     */
    async testConnection() {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }
        
        try {
            const response = await axios.get(`${this.apiUrl}/getMe`, { timeout: 5000 });
            this.logger.info('Telegram connection test successful', {
                botName: response.data.result.username
            });
            return { success: true, bot: response.data.result };
        } catch (error) {
            this.logger.error('Telegram connection test failed', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Get chat information
     */
    async getChatInfo() {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }
        
        try {
            const response = await axios.get(`${this.apiUrl}/getChat`, {
                params: { chat_id: this.chatId },
                timeout: 5000
            });
            return { success: true, chat: response.data.result };
        } catch (error) {
            this.logger.error('Failed to get chat info', error);
            return { success: false, error: error.message };
        }
    }
}

// Create default telegram bot instance
const defaultTelegram = new TelegramBot({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    enabled: process.env.TELEGRAM_ENABLED !== 'false'
});

module.exports = {
    TelegramBot,
    telegram: defaultTelegram
};