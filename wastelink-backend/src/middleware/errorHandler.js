import { logger } from '../config/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Operational errors (AppError instances)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  // Supabase / Postgres errors
  if (err.code?.startsWith('P') || err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'A record with this data already exists.' },
    });
  }

  // Unknown / programming errors — don't leak internals
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
}
