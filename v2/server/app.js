
const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const { assignCsrfToken, verifyCsrf } = require('./middlewares/csrf');
const { notFound } = require('./middlewares/not-found');
const { errorHandler } = require('./middlewares/error-handler');
const { logRequest } = require('./utils/logger');
const healthRoutes = require('./routes/health.routes');
const adminRoutes = require('./routes/admin.routes');
const customerRoutes = require('./routes/customer.routes');
const readyRoutes = require('./routes/ready.routes');

const adminAssets = path.resolve(__dirname, '../admin/public');
const customerAssets = path.resolve(__dirname, '../customer/public');
const appRoot = path.resolve(__dirname, '..');

function createSessionMiddleware({ name, secret, collectionName }) {
  let middleware;
  return (req, res, next) => {
    try {
      if (!middleware) {
        const clientPromise = Promise.resolve(mongoose.connection.getClient());
        middleware = session({
          name,
          secret,
          store: MongoStore.create({
            clientPromise,
            dbName: mongoose.connection.name,
            collectionName,
            autoRemove: 'native',
          }),
          resave: false,
          saveUninitialized: false,
          rolling: true,
          cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 8 * 60 * 60 * 1000,
            path: '/',
          },
        });
      }
      return middleware(req, res, next);
    } catch (error) {
      return next(error);
    }
  };
}

function createApp(env, portal) {
  if (!['admin', 'customer'].includes(portal)) {
    throw new TypeError('Portal must be either admin or customer.');
  }
  const app = express();
  const isAdmin = portal === 'admin';
  const portalSession = createSessionMiddleware({
    name: isAdmin ? 'rk_admin.sid' : 'rk_customer.sid',
    secret: isAdmin ? env.ADMIN_SESSION_SECRET : env.CUSTOMER_SESSION_SECRET,
    collectionName: isAdmin ? 'admin_sessions' : 'customer_sessions',
  });
  app.locals.portalPath = '/';
  app.locals.businessTimezone = env.BUSINESS_TIMEZONE;

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', [appRoot]);
  app.set('view cache', env.NODE_ENV === 'production');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
      },
    },
  }));
  // Liveness is process-only. Readiness pings the established Mongoose connection.
  app.use('/health', healthRoutes);
  app.use('/ready', readyRoutes);
  app.use(logRequest);
  app.use('/assets', express.static(isAdmin ? adminAssets : customerAssets, { fallthrough: true, maxAge: '1h' }));
  app.use('/shared/assets', express.static(path.join(__dirname, 'public'), { fallthrough: true, maxAge: '1h' }));
  // Product image uploads are base64 JSON capped at 4 MiB plus encoding overhead.
  app.use('/products/images', express.json({ limit: '5.7mb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(portalSession);
  app.use(assignCsrfToken);
  app.use(verifyCsrf);
  app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));

  app.use('/', isAdmin ? adminRoutes : customerRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
