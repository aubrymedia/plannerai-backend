import express from "express";
import {
  getAuthUrl,
  handleCallback,
  logout,
  getMe,
  getUserCalendarsList,
  updateSelectedCalendars,
} from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Routes publiques
router.get("/google", getAuthUrl);
router.get("/google/callback", handleCallback);

// Routes protégées
router.get("/me", protect, getMe);
router.post("/logout", protect, logout);

// Routes pour les calendriers Google
router.get("/calendars", protect, getUserCalendarsList);
router.put("/calendars/selected", protect, updateSelectedCalendars);

export default router;

