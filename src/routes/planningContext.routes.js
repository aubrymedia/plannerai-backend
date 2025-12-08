import express from "express";
import {
  getPlanningContext,
  updatePlanningContext,
} from "../controllers/planningContext.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// Routes pour le contexte personnel
router
  .route("/")
  .get(getPlanningContext)
  .put(updatePlanningContext);

export default router;

