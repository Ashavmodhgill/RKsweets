const crypto = require('node:crypto');

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assignCsrfToken(req, res, next) {
  // Only portal page requests need a token. Static assets, health checks, and API reads
  // remain unmodified so saveUninitialized:false does not persist anonymous sessions.
  const isPortalPage = !req.path.startsWith('/assets/') && !req.path.startsWith('/shared/assets/');
  const wantsHtml = req.accepts(['html', 'json']) === 'html';
  if (req.method === 'GET' && isPortalPage && wantsHtml && req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  }
  res.locals.csrfToken = req.session?.csrfToken || '';
  next();
}

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const submitted = req.get('x-csrf-token') || req.body?._csrf;
  if (!safeEqual(req.session?.csrfToken, submitted)) {
    const error = new Error('CSRF verification failed.');
    error.code = 'CSRF_INVALID';
    return next(error);
  }

  return next();
}

module.exports = { assignCsrfToken, verifyCsrf };
