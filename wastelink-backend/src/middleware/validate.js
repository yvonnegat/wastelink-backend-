import { Errors } from '../utils/errors.js';

/**
 * validate(schema) — validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (coerced) data.
 */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const message = result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    return next(Errors.badRequest(message));
  }
  req.body = result.data;
  next();
};

/**
 * validateQuery(schema) — same but for req.query
 */
export const validateQuery = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const message = result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    return next(Errors.badRequest(message));
  }
  req.query = result.data;
  next();
};
