/**
 * @module server
 * @description Entry point for the HotelFinder backend.
 * Imports the configured Express app and starts listening on the configured port.
 * Handles graceful shutdown signals (SIGTERM, SIGINT).
 */

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./data/database');

const PORT = config.server.port;

/**
 * Initialize the database and start the HTTP server.
 */
async function start() {
  try {
    // Initialize SQLite database (runs migrations if needed)
    await db.initialize();
    logger.info('Database initialized successfully');

    const server = app.listen(PORT, () => {
      logger.info(`🚀 HotelFinder API running on http://localhost:${PORT}`, {
        environment: config.server.env,
        port: PORT,
      });
    });

    // Graceful shutdown handler
    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(() => {
        db.close();
        logger.info('Server closed. Goodbye!');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

start();
