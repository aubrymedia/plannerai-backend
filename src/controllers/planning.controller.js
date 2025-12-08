import { asyncHandler } from "../utils/asyncHandler.js";
import Plan from "../models/plan.model.js";
import { generatePlanning } from "../services/ai/plannerAI.service.js";
import { getCalendarEvents, createCalendarEvent } from "../services/calendar/googleCalendar.service.js";
import User from "../models/user.model.js";

/**
 * Génère une nouvelle planification avec l'IA
 */
export const generatePlan = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: "Les dates de début et de fin sont requises",
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({
      success: false,
      error: "Format de date invalide",
    });
  }

  if (start >= end) {
    return res.status(400).json({
      success: false,
      error: "La date de début doit être antérieure à la date de fin",
    });
  }

  // Vérifier que l'utilisateur a un calendrier Google configuré
  const user = await User.findById(req.user._id);
  if (!user.googleCalendarId) {
    return res.status(400).json({
      success: false,
      error: "Calendrier Google non configuré. Veuillez vous reconnecter avec Google.",
    });
  }

  // Générer la planification avec l'IA
  const planning = await generatePlanning(user, start, end);

  // Créer le plan en base de données
  const plan = await Plan.create({
    userId: req.user._id,
    startDate: start,
    endDate: end,
    timeBlocks: planning.timeBlocks,
    aiNotes: planning.aiNotes,
    status: "draft",
    contextSnapshot: {
      companies: [],
      tasksCount: 0,
      goalsCount: 0,
    },
  });

  res.status(201).json({
    success: true,
    data: plan,
  });
});

/**
 * Récupère tous les plans de l'utilisateur
 */
export const getPlans = asyncHandler(async (req, res) => {
  const plans = await Plan.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .populate("timeBlocks.taskId", "title description");

  res.status(200).json({
    success: true,
    data: plans,
  });
});

/**
 * Récupère un plan spécifique
 */
export const getPlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).populate("timeBlocks.taskId", "title description duration deadline");

  if (!plan) {
    return res.status(404).json({
      success: false,
      error: "Plan non trouvé",
    });
  }

  res.status(200).json({
    success: true,
    data: plan,
  });
});

/**
 * Approuve un plan (passe de draft à approved)
 */
export const approvePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return res.status(404).json({
      success: false,
      error: "Plan non trouvé",
    });
  }

  plan.status = "approved";
  plan.approvedAt = new Date();
  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
  });
});

/**
 * Synchronise un plan approuvé avec Google Calendar
 */
export const syncPlanToCalendar = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({
    _id: req.params.id,
    userId: req.user._id,
    status: "approved",
  }).populate("timeBlocks.taskId");

  if (!plan) {
    return res.status(404).json({
      success: false,
      error: "Plan approuvé non trouvé",
    });
  }

  const user = await User.findById(req.user._id);
  if (!user.googleCalendarId) {
    return res.status(400).json({
      success: false,
      error: "Calendrier Google non configuré",
    });
  }

  // Créer les événements dans Google Calendar
  const createdEvents = [];
  for (const block of plan.timeBlocks) {
    try {
      // Ignorer les blocs de type "buffer" ou "personal_time" sauf si explicitement demandé
      if (block.type === "buffer" && !req.body.includeBuffer) {
        continue;
      }

      const event = await createCalendarEvent(user, {
        title: block.title,
        description: block.description || "",
        start: block.start,
        end: block.end,
      });

      // Mettre à jour le bloc avec l'ID de l'événement Google
      block.googleEventId = event.id;
      createdEvents.push(event);
    } catch (error) {
      console.error(`[Planning] Error creating event for block ${block._id}:`, error);
      // Continue même en cas d'erreur sur un bloc
    }
  }

  // Sauvegarder les IDs des événements
  plan.syncedAt = new Date();
  plan.status = "synced";
  await plan.save();

  res.status(200).json({
    success: true,
    data: {
      plan,
      eventsCreated: createdEvents.length,
    },
  });
});

/**
 * Récupère les événements du calendrier pour une période
 */
export const getCalendarEventsForPeriod = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: "Les paramètres startDate et endDate sont requis",
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  const user = await User.findById(req.user._id);
  if (!user.googleCalendarId) {
    return res.status(400).json({
      success: false,
      error: "Calendrier Google non configuré",
    });
  }

  const events = await getCalendarEvents(user, start, end);

  // Filtrer les événements créés par l'app (ceux dans le calendrier "Life Planner IA")
  const externalEvents = events.filter((event) => {
    // Exclure les événements du calendrier "Life Planner IA"
    return event.calendarId !== user.googleCalendarId;
  });

  res.status(200).json({
    success: true,
    data: externalEvents,
    allEvents: events, // Inclure aussi tous les événements pour référence
  });
});

/**
 * Supprime un plan
 */
export const deletePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return res.status(404).json({
      success: false,
      error: "Plan non trouvé",
    });
  }

  await plan.deleteOne();

  res.status(200).json({
    success: true,
    message: "Plan supprimé avec succès",
  });
});

