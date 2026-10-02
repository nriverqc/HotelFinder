/**
 * @module errorHandler
 * @description Centralized error handling middleware for Express.
 * Catches all unhandled errors, logs them, and returns a consistent JSON response.
 * Must be registered AFTER all routes in the Express app.
 */

const logger = require('../utils/logger');

/**
 * Express error-handling middleware.
 * @param {Error} err - The error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error(`Unhandled error on ${req.method} ${req.path}`, {
    status: statusCode,
    message: err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });

  res.status(statusCode).json({
    status: 'error',
    message: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

/**
 * Middleware to handle 404 — route not found.
 * Must be registered AFTER all routes but BEFORE errorHandler.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.path} not found`,
  });
}

module.exports = { errorHandler, notFoundHandler };
