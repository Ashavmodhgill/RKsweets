import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { router } from './routes.js';

export function createApp() {
  const app = express();
  const origins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://localhost:5174').split(',').map(x => x.trim());
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin(origin, cb) { if (!origin || origins.includes(origin)) return cb(null, true); cb(new Error('Origin not allowed')); }, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'rk-sweets-api' }));
  app.use('/api', router);
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } }));
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.code === 11000 ? 409 : err.name === 'CastError' || err.name === 'ValidationError' || err.name === 'ZodError' ? 400 : 500);
    if (status >= 500) console.error(err.message);
    res.status(status).json({ error: { code: err.code === 11000 ? 'ALREADY_EXISTS' : err.name === 'CastError' ? 'INVALID_IDENTIFIER' : err.code || 'REQUEST_FAILED', message: status >= 500 ? 'Something went wrong.' : err.message } });
  });
  return app;
}
