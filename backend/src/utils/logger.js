/**
 * @module logger
 * @description Centralized logging utility for the HotelFinder backend.
 * Provides structured logging with consistent formatting and log levels.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('Database error', { error: err.message });
 */

const config = require('../config');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[config.logging.level] ?? LOG_LEVELS.info;

/**
 * Formats a log entry with timestamp, level, and optional context data.
 * @param {string} level - Log level (error, warn, info, debug)
 * @param {string} message - Human-readable message
 * @param {Object} [data] - Optional structured data to attach
 * @returns {string} Formatted log string
 */
function formatLog(level, message, data) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `${prefix} ${message}${dataStr}`;
}

const logger = {
  /**
   * Log an error message. Always printed regardless of log level.
   * @param {string} message
   * @param {Object} [data]
   */
  error(message, data) {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(formatLog('error', message, data));
    }
  },

  /**
   * Log a warning message.
   * @param {string} message
   * @param {Object} [data]
   */
  warn(message, data) {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatLog('warn', message, data));
    }
  },

  /**
   * Log an informational message.
   * @param {string} message
   * @param {Object} [data]
   */
  info(message, data) {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(formatLog('info', message, data));
    }
  },

  /**
   * Log a debug message. Only printed when LOG_LEVEL=debug.
   * @param {string} message
   * @param {Object} [data]
   */
  debug(message, data) {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(formatLog('debug', message, data));
    }
  },
};

module.exports = logger;
