function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const error = new Error('Some submitted information is invalid.');
      error.statusCode = 400;
      error.code = 'VALIDATION_FAILED';
      error.details = result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
      return next(error);
    }
    req.validated = req.validated || {};
    req.validated[source] = result.data;
    return next();
  };
}

module.exports = { validate };
