import 'dotenv/config';
import app from './app.js';
import { logger } from './config/logger.js';

const PORT = parseInt(process.env.PORT || '4000');

const server = app.listen(PORT, () => {
  logger.info(`🌿 WasteLink API running on http://localhost:${PORT}`);
  logger.info(`   Env    : ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Prefix : /api/${process.env.API_VERSION || 'v1'}`);
});

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down…`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  (err) => { logger.error('Uncaught exception',  err); process.exit(1); });
process.on('unhandledRejection', (err) => { logger.error('Unhandled rejection', err); process.exit(1); });
