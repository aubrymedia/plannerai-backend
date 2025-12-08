/**
 * Middleware de gestion centralisée des erreurs
 */
export const errorHandler = (err, req, res, next) => {
  console.error("=".repeat(50));
  console.error("[ERROR HANDLER] Erreur capturée:");
  console.error("[ERROR HANDLER] Path:", req.path);
  console.error("[ERROR HANDLER] Method:", req.method);
  console.error("[ERROR HANDLER] Error name:", err.name);
  console.error("[ERROR HANDLER] Error message:", err.message);
  console.error("[ERROR HANDLER] Stack:", err.stack);
  
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Erreur Mongoose - Validation
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
  }

  // Erreur Mongoose - Duplicate key
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyPattern)[0];
    message = `${field} already exists`;
  }

  // Erreur Mongoose - Cast error (ObjectId invalide)
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  }

  // Erreur JWT
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

/**
 * Middleware pour gérer les routes non trouvées
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

