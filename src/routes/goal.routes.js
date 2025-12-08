import express from "express";
import {
  getGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  updateGoalStatus,
  addTaskToGoal,
  removeTaskFromGoal,
  improveGoalWithAI,
} from "../controllers/goal.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// Route pour améliorer avec l'IA (doit être avant /:id)
router.route("/improve").post(improveGoalWithAI);

// Routes CRUD
router.route("/").get(getGoals).post(createGoal);
router
  .route("/:id")
  .get(getGoal)
  .put(updateGoal)
  .delete(deleteGoal);

// Route pour mettre à jour le statut
router.route("/:id/status").put(updateGoalStatus);

// Routes pour les tâches associées
router.route("/:id/tasks").post(addTaskToGoal);
router.route("/:id/tasks/:taskId").delete(removeTaskFromGoal);

export default router;

