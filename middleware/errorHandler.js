/**
 * Safe error responses — never expose stack traces or internal details to clients.
 */

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

function logError(err) {
  console.error('[Error]', err.message);
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(err.stack);
  }
}

/** Wrap async route handlers so errors reach the global handler */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Send a safe JSON error from route catch blocks */
function respondWithError(res, err, fallbackMessage = 'Something went wrong.') {
  logError(err);

  if (err.code === 11000) {
    return res.status(409).json({ error: 'Email already registered.' });
  }

  if (err.isOperational && err.statusCode && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  return res.status(500).json({ error: fallbackMessage });
}

/** Express global error handler — last middleware */
function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  logError(err);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  if (err.isOperational && err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error.' });
}

/** Express 404 handler for unmatched API routes */
function notFoundHandler(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  res.status(404).json({ error: 'Not found.' });
}

module.exports = {
  AppError,
  asyncHandler,
  respondWithError,
  globalErrorHandler,
  notFoundHandler,
  logError,
};
