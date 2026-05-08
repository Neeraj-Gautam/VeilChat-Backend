/**
 * Catches 404 (route not found) and forwards to the error handler.
 */
const notFound = (req, _res, next) => {
  const error = new Error(`Not Found — ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

export default notFound;
