function logRequest(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const line = `${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`;
    if (res.statusCode >= 500) console.error(line);
    else console.info(line);
  });
  next();
}

module.exports = { logRequest };
