import User from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Middleware pour vérifier que l'utilisateur est authentifié
 * Vérifie la session ou le token JWT
 */
export const protect = asyncHandler(async (req, res, next) => {
  // Pour l'instant, on utilise la session
  // TODO: Implémenter JWT si nécessaire
  const userId = req.session?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Not authorized. Please login.",
    });
  }

  const user = await User.findById(userId);

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      error: "User not found or inactive.",
    });
  }

  req.user = user;
  next();
});

/**
 * Middleware optionnel pour vérifier que l'utilisateur a un token Google valide
 */
export const requireGoogleAuth = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "User not authenticated.",
    });
  }

  if (!req.user.googleAccessToken) {
    return res.status(403).json({
      success: false,
      error: "Google authentication required. Please reconnect your Google account.",
    });
  }

  // Vérifier si le token est expiré
  if (
    req.user.googleTokenExpiry &&
    new Date() > req.user.googleTokenExpiry
  ) {
    return res.status(403).json({
      success: false,
      error: "Google token expired. Please reconnect your Google account.",
    });
  }

  next();
});

