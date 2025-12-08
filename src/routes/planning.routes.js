import express from "express";
import {
  generatePlan,
  getPlans,
  getPlan,
  approvePlan,
  syncPlanToCalendar,
  getCalendarEventsForPeriod,
  deletePlan,
} from "../controllers/planning.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// Routes pour les plans
router.route("/").get(getPlans).post(generatePlan);
router.route("/:id").get(getPlan).delete(deletePlan);
router.route("/:id/approve").put(approvePlan);
router.route("/:id/sync").post(syncPlanToCalendar);

// Route pour récupérer les événements du calendrier
router.get("/calendar/events", getCalendarEventsForPeriod);

export default router;

