import express from "express";
import {
  getTasks,
  getTask,
  getCurrentTask,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  addSubtask,
  updateSubtask,
  improveTaskWithAI,
  scheduleTaskToCalendar,
  updateTaskProgress,
  completeScheduledSlot,
  rescheduleRemaining,
  rescheduleTask,
  syncTaskSlots,
} from "../controllers/task.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// Route pour récupérer la tâche en cours (doit être avant /:id)
router.route("/current").get(getCurrentTask);

// Routes CRUD
router.route("/").get(getTasks).post(createTask);
router
  .route("/:id")
  .get(getTask)
  .put(updateTask)
  .delete(deleteTask);

// Route pour améliorer avec l'IA
router.route("/improve").post(improveTaskWithAI);

// Route pour mettre à jour le statut
router.route("/:id/status").put(updateTaskStatus);

// Routes pour les sous-tâches
router.route("/:id/subtasks").post(addSubtask);
router.route("/:id/subtasks/:subtaskIndex").put(updateSubtask);

// Route pour planifier une tâche dans Google Calendar
router.route("/:id/schedule").post(scheduleTaskToCalendar);

// Route pour synchroniser les créneaux avec Google Calendar
router.route("/:id/sync-slots").post(syncTaskSlots);

// Route pour replanifier complètement une tâche (supprime les anciens créneaux)
router.route("/:id/reschedule").post(rescheduleTask);
// Route pour replanifier la partie restante d'une tâche
router.route("/:id/reschedule-remaining").post(rescheduleRemaining);

// Route pour mettre à jour la progression d'une tâche
router.route("/:id/progress").put(updateTaskProgress);
router.route("/:id/progress/:slotIndex").put(updateTaskProgress);

// Route pour marquer un créneau comme complété
router.route("/:id/slots/:slotIndex/complete").put(completeScheduledSlot);

export default router;

