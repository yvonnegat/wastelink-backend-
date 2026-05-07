import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes          from './modules/auth/auth.routes.js';
import usersRoutes         from './modules/users/users.routes.js';
import listingsRoutes      from './modules/listings/listings.routes.js';
import recyclersRoutes     from './modules/recyclers/recyclers.routes.js';
import transactionsRoutes  from './modules/transactions/transactions.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import uploadsRoutes       from './modules/uploads/uploads.routes.js';
import adminRoutes         from './modules/admin/admin.routes.js';

const app = express();
const API = `/api/${process.env.API_VERSION || 'v1'}`;

// ── Security & parsing ────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────────
app.use(morgan('dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Rate limiting ─────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX       || '100'),
  message:  { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter limit on auth endpoints
app.use(`${API}/auth`, rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version || '1.0.0', ts: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────
app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/users`,         usersRoutes);
app.use(`${API}/listings`,      listingsRoutes);
app.use(`${API}/recyclers`,     recyclersRoutes);
app.use(`${API}/transactions`,  transactionsRoutes);
app.use(`${API}/notifications`, notificationsRoutes);
app.use(`${API}/uploads`,       uploadsRoutes);
app.use(`${API}/admin`,         adminRoutes);

// ── 404 ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Global error handler ──────────────────────────────────────────
app.use(errorHandler);

export default app;
