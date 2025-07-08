/**
 * Custom error classes for the trading bot
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    Error.captureStackTrace(this, ValidationError);
  }
}

export class TradingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TradingError';
    this.code = 'TRADING_ERROR';
    this.details = details;
    Error.captureStackTrace(this, TradingError);
  }
}

export class ExchangeError extends Error {
  constructor(message, exchangeCode = null, details = {}) {
    super(message);
    this.name = 'ExchangeError';
    this.code = 'EXCHANGE_ERROR';
    this.exchangeCode = exchangeCode;
    this.details = details;
    Error.captureStackTrace(this, ExchangeError);
  }
}

export class RiskManagementError extends Error {
  constructor(message, riskMetrics = {}) {
    super(message);
    this.name = 'RiskManagementError';
    this.code = 'RISK_MANAGEMENT_ERROR';
    this.riskMetrics = riskMetrics;
    Error.captureStackTrace(this, RiskManagementError);
  }
}

export class ConfigurationError extends Error {
  constructor(message, configPath = null) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'CONFIGURATION_ERROR';
    this.configPath = configPath;
    Error.captureStackTrace(this, ConfigurationError);
  }
}

export class DatabaseError extends Error {
  constructor(message, operation = null, details = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.code = 'DATABASE_ERROR';
    this.operation = operation;
    this.details = details;
    Error.captureStackTrace(this, DatabaseError);
  }
}

export class APIError extends Error {
  constructor(message, statusCode = null, endpoint = null) {
    super(message);
    this.name = 'APIError';
    this.code = 'API_ERROR';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    Error.captureStackTrace(this, APIError);
  }
}

export class NetworkError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'NetworkError';
    this.code = 'NETWORK_ERROR';
    this.details = details;
    Error.captureStackTrace(this, NetworkError);
  }
}

export class TimeoutError extends Error {
  constructor(message, timeout = null) {
    super(message);
    this.name = 'TimeoutError';
    this.code = 'TIMEOUT_ERROR';
    this.timeout = timeout;
    Error.captureStackTrace(this, TimeoutError);
  }
}

export class InsufficientFundsError extends Error {
  constructor(message, required = null, available = null) {
    super(message);
    this.name = 'InsufficientFundsError';
    this.code = 'INSUFFICIENT_FUNDS_ERROR';
    this.required = required;
    this.available = available;
    Error.captureStackTrace(this, InsufficientFundsError);
  }
}

/**
 * Error handler utility functions
 */
export const ErrorHandler = {
  /**
   * Check if error is retryable
   * @param {Error} error - Error instance
   * @returns {boolean} Whether error is retryable
   */
  isRetryable(error) {
    const retryableErrors = [
      'NetworkError',
      'TimeoutError',
      'ExchangeError'
    ];
    
    return retryableErrors.includes(error.name);
  },

  /**
   * Get error severity level
   * @param {Error} error - Error instance
   * @returns {string} Severity level: 'low', 'medium', 'high', 'critical'
   */
  getSeverity(error) {
    switch (error.name) {
      case 'ValidationError':
      case 'ConfigurationError':
        return 'medium';
      
      case 'TradingError':
      case 'RiskManagementError':
      case 'InsufficientFundsError':
        return 'high';
      
      case 'DatabaseError':
      case 'ExchangeError':
        return 'critical';
      
      default:
        return 'low';
    }
  },

  /**
   * Format error for logging
   * @param {Error} error - Error instance
   * @returns {Object} Formatted error object
   */
  formatForLog(error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      severity: this.getSeverity(error),
      stack: error.stack,
      timestamp: new Date().toISOString(),
      details: error.details || {},
      retryable: this.isRetryable(error)
    };
  },

  /**
   * Handle error with appropriate response
   * @param {Error} error - Error instance
   * @param {Object} context - Additional context
   * @returns {Object} Error response
   */
  handleError(error, context = {}) {
    const severity = this.getSeverity(error);
    const isRetryable = this.isRetryable(error);
    
    return {
      success: false,
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        severity,
        retryable: isRetryable,
        timestamp: new Date().toISOString(),
        context
      }
    };
  }
};