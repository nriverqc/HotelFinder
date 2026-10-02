/**
 * @module app
 * @description Express application configuration for the HotelFinder backend API.
 * This module configures all middleware, routes, and error handlers.
 * It exports the Express app instance without starting the server,
 * enabling clean separation for testing.
 *
 * @see {@link module:server} for the server startup logic.
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// ──────────────────────────────────────────────
//  Global Middleware
// ──────────────────────────────────────────────

/** CORS — allow cross-origin requests from the extension and landing page */
app.use(cors());

/** Parse JSON request bodies */
app.use(express.json());

/** Request logging middleware */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ──────────────────────────────────────────────
//  Health Check
// ──────────────────────────────────────────────

/**
 * GET /health
 * Basic health check endpoint for monitoring and load balancers.
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'HotelFinder API',
    version: require('../package.json').version,
    environment: config.server.env,
    uptime: Math.floor(process.uptime()),
  });
});

// ──────────────────────────────────────────────
//  API Routes
// ──────────────────────────────────────────────

/** Mount all API routes under /api and /api/v1 for backwards compatibility */
app.use('/api', routes);
app.use('/api/v1', routes);

// ──────────────────────────────────────────────
//  Error Handling (must be AFTER routes)
// ──────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
