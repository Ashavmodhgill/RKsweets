function logRequest(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const safePath = req.path.startsWith('/dine/') ? '/dine/[QR_CREDENTIAL_REDACTED]' : req.path;
    const line = `${new Date().toISOString()} ${req.method} ${safePath} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`;
    if (res.statusCode >= 500) console.error(line);
    else console.info(line);
  });
  next();
}

module.exports = { logRequest };
