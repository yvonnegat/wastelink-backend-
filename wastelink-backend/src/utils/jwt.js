import jwt from 'jsonwebtoken';
import { Errors } from './errors.js';

const {
  JWT_SECRET,
  JWT_EXPIRES_IN        = '7d',
  JWT_REFRESH_EXPIRES_IN = '30d',
} = process.env;

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function signRefreshToken(payload) {
  return jwt.sign({ sub: payload.sub }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw Errors.unauthorized('Token expired');
    throw Errors.unauthorized('Invalid token');
  }
}

export function tokenPair(user) {
  const payload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken:  signToken(payload),
    refreshToken: signRefreshToken(payload),
    expiresIn:    JWT_EXPIRES_IN,
  };
}
