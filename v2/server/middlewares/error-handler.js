const BODY_PARSER_STATUS = Object.freeze({
  'entity.parse.failed': 400,
  'request.aborted': 400,
  'request.size.invalid': 400,
  'entity.verify.failed': 403,
  'entity.too.large': 413,
  'encoding.unsupported': 415,
  'charset.unsupported': 415,
});

const APPLICATION_STATUS = Object.freeze({
  CSRF_INVALID: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  AUTH_RATE_LIMITED: 429,
  MOBILE_ALREADY_REGISTERED: 409,
});

function getClientStatus(err) {
  if (typeof err?.type === 'string' && BODY_PARSER_STATUS[err.type]) {
    return BODY_PARSER_STATUS[err.type];
  }
  if (typeof err?.code === 'string' && APPLICATION_STATUS[err.code]) {
    return APPLICATION_STATUS[err.code];
  }
  return 500;
}

function isApiRequest(req) {
  // API responses are selected by an /api/ path, JSON request body, or JSON-only Accept header.
  return req.path.startsWith('/api/')
    || req.is('application/json')
    || req.accepts(['html', 'json']) === 'json';
}

function safeValidationDetails(err) {
  if (err?.code !== 'VALIDATION_FAILED' || !Array.isArray(err.details)) return [];
  return err.details
    .filter((detail) => detail && typeof detail === 'object')
    .map((detail) => ({
      path: typeof detail.path === 'string' ? detail.path.slice(0, 100) : '',
      message: typeof detail.message === 'string' ? detail.message.slice(0, 200) : 'Invalid value.',
    }));
}

function safeDevelopmentDiagnostic(err) {
  let diagnostic = typeof err?.stack === 'string'
    ? err.stack
    : `${err?.name || 'Error'}: ${err?.message || 'Unknown error'}`;

  // Remove configured credential material if a dependency includes it in an error.
  const sensitiveEnvNames = [
    'NODE_ENV',
    'PORT',
    'ADMIN_PORT',
    'MONGODB_URI',
    'ADMIN_SESSION_SECRET',
    'CUSTOMER_SESSION_SECRET',
    'TRUST_PROXY',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'BUSINESS_TIMEZONE',
    'OWNER_SETUP_NAME',
    'OWNER_SETUP_MOBILE',
    'OWNER_SETUP_PASSWORD',
  ];
  for (const name of sensitiveEnvNames) {
    const value = process.env[name];
    if (typeof value === 'string' && value.length > 0) {
      diagnostic = diagnostic.split(value).join('[REDACTED]');
    }
  }

  return diagnostic
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[REDACTED_MONGODB_URI]')
    .replace(/(["']?(?:cookie|set-cookie|authorization|password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, '$1[REDACTED]')
    .replace(/\b([A-Z][A-Z0-9_]{2,})\s*=\s*("[^"]*"|'[^']*'|[^\s,;]+)/g, '$1=[REDACTED]')
    .slice(0, 6000);
}

function errorHandler(err, req, res, _next) {
  const statusCode = getClientStatus(err);
  const code = typeof err?.code === 'string' && APPLICATION_STATUS[err.code]
    ? err.code
    : (BODY_PARSER_STATUS[err?.type] ? 'INVALID_REQUEST' : 'INTERNAL_ERROR');

  if (statusCode >= 500) {
    console.error(`${req.method} request failed: ${err?.name || 'Error'} (${code})`);
    if (process.env.NODE_ENV === 'development') {
      console.error(`Development error detail:\n${safeDevelopmentDiagnostic(err)}`);
    }
  }

  const message = statusCode >= 500
    ? 'Please try again later.'
    : (err?.code === 'CSRF_INVALID'
      ? 'Your form session has expired or could not be verified. Return to the portal and try again.'
      : err?.code === 'NOT_FOUND' ? 'The page or endpoint could not be found.'
        : err?.code === 'AUTH_RATE_LIMITED' ? 'Too many sign-in attempts. Try again later.'
          : err?.code === 'MOBILE_ALREADY_REGISTERED' ? 'An account already uses this mobile number.'
          : 'The request could not be processed.');

  if (isApiRequest(req)) {
    const error = { code, message };
    if (err?.code === 'VALIDATION_FAILED') error.details = safeValidationDetails(err);
    return res.status(statusCode).json({ error });
  }

  return res.status(statusCode).render('server/views/shared/error', {
    pageTitle: statusCode >= 500 ? 'Something went wrong' : statusCode === 403 ? 'Request not accepted' : 'Request error',
    statusCode,
    message: err?.code === 'VALIDATION_FAILED' ? 'Review the following fields and try again.' : message,
    details: safeValidationDetails(err),
    portalPath: req.app.locals.portalPath || '/',
  });
}

module.exports = { errorHandler, getClientStatus, isApiRequest };
