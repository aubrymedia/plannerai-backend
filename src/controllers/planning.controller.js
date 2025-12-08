import { asyncHandler } from "../utils/asyncHandler.js";
import Plan from "../models/plan.model.js";
import Task from "../models/task.model.js";
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
 * Inclut les événements externes ET les tâches planifiées
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

  // Récupérer tous les événements Google Calendar
  const allGoogleEvents = await getCalendarEvents(user, start, end);

  // Séparer les événements externes (hors calendrier "Life Planner AI") et ceux du calendrier "Life Planner AI"
  const externalEvents = allGoogleEvents.filter((event) => {
    return event.calendarId !== user.googleCalendarId;
  });

  // Récupérer les événements du calendrier "Life Planner AI"
  const lifePlannerEvents = allGoogleEvents.filter((event) => {
    return event.calendarId === user.googleCalendarId;
  });

  // Récupérer les tâches planifiées dans cette période
  const tasks = await Task.find({
    userId: req.user._id,
    scheduledSlots: {
      $elemMatch: {
        start: { $lte: end },
        end: { $gte: start },
      },
    },
  })
    .populate("companyId", "name sector")
    .select("title description scheduledSlots companyId status progress");

  // Créer un Set des IDs d'événements Google déjà présents dans le calendrier
  const existingGoogleEventIds = new Set(
    lifePlannerEvents.map((event) => event.id).filter(Boolean)
  );

  // Convertir les créneaux planifiés des tâches en événements
  const taskEvents = [];
  tasks.forEach((task) => {
    if (task.scheduledSlots && task.scheduledSlots.length > 0) {
      task.scheduledSlots.forEach((slot) => {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);

        // Vérifier si le créneau est dans la période
        if (slotStart <= end && slotEnd >= start) {
          // Si l'événement existe déjà dans Google Calendar, ne pas le dupliquer
          if (slot.googleEventId && existingGoogleEventIds.has(slot.googleEventId)) {
            return; // Skip cet événement car il est déjà dans lifePlannerEvents
          }

          taskEvents.push({
            id: slot.googleEventId || `task-${task._id}-${slot._id}`,
            summary: task.title,
            description: task.description || "",
            start: {
              dateTime: slotStart.toISOString(),
              timeZone: "Europe/Paris",
            },
            end: {
              dateTime: slotEnd.toISOString(),
              timeZone: "Europe/Paris",
            },
            calendarId: user.googleCalendarId,
            calendarName: "Life Planner AI",
            isTaskEvent: true, // Marqueur pour identifier les événements créés à partir de tâches
            taskId: task._id.toString(),
            taskStatus: task.status,
            taskProgress: task.progress || 0,
            companyName: task.companyId?.name || null,
            slotCompleted: slot.completed || false,
          });
        }
      });
    }
  });

  // Marquer les événements du calendrier "Life Planner AI" qui proviennent de tâches
  // en vérifiant s'ils ont un googleEventId correspondant
  const taskGoogleEventIds = new Set(
    tasks
      .flatMap((task) => task.scheduledSlots || [])
      .map((slot) => slot.googleEventId)
      .filter(Boolean)
  );

  const enrichedLifePlannerEvents = lifePlannerEvents.map((event) => {
    // Si l'événement correspond à une tâche planifiée, ajouter les métadonnées
    if (taskGoogleEventIds.has(event.id)) {
      // Trouver la tâche correspondante
      const matchingTask = tasks.find((task) =>
        task.scheduledSlots?.some((slot) => slot.googleEventId === event.id)
      );
      
      if (matchingTask) {
        const matchingSlot = matchingTask.scheduledSlots.find(
          (slot) => slot.googleEventId === event.id
        );
        return {
          ...event,
          isTaskEvent: true,
          taskId: matchingTask._id.toString(),
          taskStatus: matchingTask.status,
          taskProgress: matchingTask.progress || 0,
          companyName: matchingTask.companyId?.name || null,
          slotCompleted: matchingSlot?.completed || false,
        };
      }
    }
    return event;
  });

  // Combiner tous les événements : externes + calendrier "Life Planner AI" + événements de tâches non encore synchronisés
  const allEvents = [...externalEvents, ...enrichedLifePlannerEvents, ...taskEvents];

  // Trier par date de début
  allEvents.sort((a, b) => {
    const aStart = new Date(a.start.dateTime || a.start.date);
    const bStart = new Date(b.start.dateTime || b.start.date);
    return aStart - bStart;
  });

  res.status(200).json({
    success: true,
    data: allEvents,
    externalEvents: externalEvents,
    taskEvents: taskEvents,
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

