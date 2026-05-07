// ── Custom error class ────────────────────────────────────────────
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code       = code;
    this.isOperational = true;
  }
}

// ── Common error factories ─────────────────────────────────────────
export const Errors = {
  notFound:      (r = 'Resource') => new AppError(`${r} not found`, 404, 'NOT_FOUND'),
  unauthorized:  (m = 'Unauthorized') => new AppError(m, 401, 'UNAUTHORIZED'),
  forbidden:     (m = 'Forbidden')    => new AppError(m, 403, 'FORBIDDEN'),
  badRequest:    (m)                  => new AppError(m, 400, 'BAD_REQUEST'),
  conflict:      (m)                  => new AppError(m, 409, 'CONFLICT'),
  unprocessable: (m)                  => new AppError(m, 422, 'UNPROCESSABLE'),
};

// ── Wraps an async route handler so you never need try/catch ───────
export const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
