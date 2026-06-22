/**
 * Global error handling middleware.
 * Must have 4 parameters so Express recognizes it as an error handler.
 *
 * Catches anything passed via next(err) in route handlers.
 */
function errorHandler(err, req, res, next) {
  console.error(err.stack);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: Object.values(err.errors).map((e) => e.message),
    });
  }

  // Mongoose cast error (e.g. invalid ObjectId format)
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // Default: internal server error
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  return res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
