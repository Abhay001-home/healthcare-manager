const logger = require('../config/logger');

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'An unexpected error occurred.';

  if (status >= 500) {
    logger.error('Unhandled error', {
      err: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  res.status(status).json({ error: message });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
}

module.exports = { errorHandler, notFound };
