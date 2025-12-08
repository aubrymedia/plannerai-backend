import Task from "../models/task.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { improveTaskDescription } from "../services/ai/openai.service.js";
import { scheduleTask, rescheduleRemainingTask, calculateRemainingTime } from "../services/calendar/taskScheduler.service.js";
import User from "../models/user.model.js";
import { getCalendarEvents } from "../services/calendar/googleCalendar.service.js";

/**
 * Récupérer toutes les tâches de l'utilisateur
 */
export const getTasks = asyncHandler(async (req, res) => {
  const { status, companyId } = req.query;
  const filter = {
    userId: req.user._id,
  };

  if (status) {
    filter.status = status;
  }

  if (companyId) {
    if (companyId === "none") {
      // Filtrer les tâches sans société (personnelles)
      filter.companyId = { $in: [null, ""] };
    } else {
      filter.companyId = companyId;
    }
  }

  const tasks = await Task.find(filter)
    .populate("companyId", "name")
    .populate("dependencies", "title status")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: tasks.length,
    data: tasks,
  });
});

/**
 * Récupérer une tâche par ID
 */
export const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  })
    .populate("companyId", "name sector")
    .populate("dependencies", "title status deadline");

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  res.json({
    success: true,
    data: task,
  });
});

/**
 * Récupérer la tâche en cours (celle qui a un créneau planifié qui contient l'heure actuelle)
 * Vérifie aussi les événements du calendrier "Life Planner AI"
 */
export const getCurrentTask = asyncHandler(async (req, res) => {
  const now = new Date();
  const user = await User.findById(req.user._id);

  // Récupérer toutes les tâches de l'utilisateur avec des créneaux planifiés
  const tasks = await Task.find({
    userId: req.user._id,
    status: { $in: ["todo", "in_progress"] },
    scheduledSlots: { $exists: true, $ne: [] },
  })
    .populate("companyId", "name sector");

  // Trouver la tâche qui a un créneau en cours
  let currentTask = tasks.find((task) => {
    if (!task.scheduledSlots || task.scheduledSlots.length === 0) return false;

    return task.scheduledSlots.some((slot) => {
      const slotStart = new Date(slot.start);
      const slotEnd = new Date(slot.end);
      // Vérifier si le créneau n'est pas complété et contient l'heure actuelle
      return !slot.completed && now >= slotStart && now <= slotEnd;
    });
  });

  // Si aucune tâche trouvée, vérifier les événements du calendrier "Life Planner AI"
  if (!currentTask && user.googleCalendarId) {
    try {
      // Récupérer les événements du calendrier "Life Planner AI" pour l'heure actuelle
      const startOfHour = new Date(now);
      startOfHour.setMinutes(0, 0, 0);
      const endOfHour = new Date(now);
      endOfHour.setMinutes(59, 59, 999);

      const allEvents = await getCalendarEvents(user, startOfHour, endOfHour);
      
      // Filtrer les événements du calendrier "Life Planner AI" qui sont en cours
      const currentEvent = allEvents.find((event) => {
        if (event.calendarId !== user.googleCalendarId) return false;
        
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        
        return now >= eventStart && now <= eventEnd;
      });

      // Si un événement est trouvé, essayer de trouver la tâche correspondante
      if (currentEvent) {
        // Chercher la tâche qui correspond à cet événement via googleEventId
        const matchingTask = tasks.find((task) =>
          task.scheduledSlots?.some((slot) => slot.googleEventId === currentEvent.id)
        );

        if (matchingTask) {
          currentTask = matchingTask;
        } else {
          // Si aucune tâche ne correspond, chercher par titre
          const taskByTitle = await Task.findOne({
            userId: req.user._id,
            title: currentEvent.summary,
            status: { $in: ["todo", "in_progress"] },
          }).populate("companyId", "name sector");

          if (taskByTitle) {
            currentTask = taskByTitle;
          } else {
            // Créer une tâche virtuelle à partir de l'événement
            // On retourne un objet qui ressemble à une tâche mais qui vient du calendrier
            currentTask = {
              _id: `event-${currentEvent.id}`,
              title: currentEvent.summary || "Événement planifié",
              description: currentEvent.description || "",
              status: "in_progress",
              companyId: null,
              subtasks: [],
              scheduledSlots: [
                {
                  start: currentEvent.start.dateTime || currentEvent.start.date,
                  end: currentEvent.end.dateTime || currentEvent.end.date,
                  completed: false,
                  googleEventId: currentEvent.id,
                },
              ],
              isFromCalendar: true, // Marqueur pour indiquer que c'est un événement du calendrier
            };
          }
        }
      }
    } catch (error) {
      console.error("[getCurrentTask] Erreur lors de la récupération des événements:", error);
      // Continuer avec le comportement par défaut si l'erreur n'est pas critique
    }
  }

  if (!currentTask) {
    return res.json({
      success: true,
      data: null,
      message: "Aucune tâche en cours",
    });
  }

  // Populate les dépendances si nécessaire (seulement pour les vraies tâches)
  if (!currentTask.isFromCalendar && currentTask.populate) {
    await currentTask.populate("dependencies", "title status");
  }

  res.json({
    success: true,
    data: currentTask,
  });
});

/**
 * Améliorer une description de tâche avec l'IA
 */
export const improveTaskWithAI = asyncHandler(async (req, res) => {
  const { description } = req.body;

  if (!description || !description.trim()) {
    return res.status(400).json({
      success: false,
      error: "La description est requise",
    });
  }

  try {
    const improved = await improveTaskDescription(description);
    res.json({
      success: true,
      data: improved,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "Erreur lors de l'amélioration avec l'IA",
    });
  }
});

/**
 * Créer une nouvelle tâche
 */
export const createTask = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    companyId,
    duration,
    deadline,
    subtasks,
    dependencies,
    businessValue,
    status,
  } = req.body;

  // Calculer la durée à partir des sous-tâches si fournies
  let calculatedDuration = duration || 0;
  if (subtasks && subtasks.length > 0) {
    calculatedDuration = subtasks.reduce((sum, subtask) => {
      return sum + (subtask.duration || 0);
    }, 0);
  }

  // Si aucune durée n'est fournie et aucune sous-tâche, utiliser 60 minutes par défaut
  if (calculatedDuration === 0 && (!subtasks || subtasks.length === 0)) {
    calculatedDuration = 60;
  }

  const task = await Task.create({
    userId: req.user._id,
    title,
    description,
    companyId: companyId || null,
    duration: calculatedDuration,
    deadline: deadline ? new Date(deadline) : null,
    subtasks: subtasks || [],
    dependencies: dependencies || [],
    businessValue: {
      potentialRevenue: businessValue?.potentialRevenue || 0,
      strategicImpact: businessValue?.strategicImpact || 5,
      urgency: businessValue?.urgency || 5,
    },
    status: status || "todo",
  });

  // Populate pour retourner les données complètes
  await task.populate("companyId", "name");
  await task.populate("dependencies", "title");

  res.status(201).json({
    success: true,
    data: task,
  });
});

/**
 * Mettre à jour une tâche
 */
export const updateTask = asyncHandler(async (req, res) => {
  let task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  // Mettre à jour les champs fournis
  const {
    title,
    description,
    companyId,
    duration,
    deadline,
    subtasks,
    dependencies,
    businessValue,
    status,
    scheduledStart,
    scheduledEnd,
    googleEventId,
  } = req.body;

  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (companyId !== undefined) task.companyId = companyId;
  if (deadline !== undefined) task.deadline = deadline ? new Date(deadline) : null;
  if (subtasks !== undefined) {
    task.subtasks = subtasks;
    // Recalculer la durée à partir des sous-tâches
    const calculatedDuration = subtasks.reduce((sum, subtask) => {
      return sum + (subtask.duration || 0);
    }, 0);
    task.duration = calculatedDuration;
  } else if (duration !== undefined) {
    // Si seulement la durée est fournie (sans sous-tâches), l'utiliser
    task.duration = duration;
  }
  if (dependencies !== undefined) task.dependencies = dependencies;
  if (status !== undefined) task.status = status;
  if (scheduledStart !== undefined)
    task.scheduledStart = scheduledStart ? new Date(scheduledStart) : null;
  if (scheduledEnd !== undefined)
    task.scheduledEnd = scheduledEnd ? new Date(scheduledEnd) : null;
  if (googleEventId !== undefined) task.googleEventId = googleEventId;

  if (businessValue !== undefined) {
    if (businessValue.potentialRevenue !== undefined)
      task.businessValue.potentialRevenue = businessValue.potentialRevenue;
    if (businessValue.strategicImpact !== undefined)
      task.businessValue.strategicImpact = businessValue.strategicImpact;
    if (businessValue.urgency !== undefined)
      task.businessValue.urgency = businessValue.urgency;
  }

  await task.save();

  // Populate pour retourner les données complètes
  await task.populate("companyId", "name");
  await task.populate("dependencies", "title status");

  res.json({
    success: true,
    data: task,
  });
});

/**
 * Supprimer une tâche
 */
export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  await Task.deleteOne({ _id: task._id });

  res.json({
    success: true,
    message: "Tâche supprimée avec succès",
  });
});

/**
 * Mettre à jour le statut d'une tâche
 */
export const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["todo", "in_progress", "completed", "cancelled", "blocked"].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Statut invalide",
    });
  }

  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  task.status = status;
  await task.save();

  await task.populate("companyId", "name");

  res.json({
    success: true,
    data: task,
  });
});

/**
 * Ajouter une sous-tâche
 */
export const addSubtask = asyncHandler(async (req, res) => {
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({
      success: false,
      error: "Le titre de la sous-tâche est requis",
    });
  }

  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  task.subtasks.push({
    title,
    completed: false,
  });

  await task.save();

  res.json({
    success: true,
    data: task,
  });
});

/**
 * Mettre à jour une sous-tâche
 */
export const updateSubtask = asyncHandler(async (req, res) => {
  const { subtaskIndex } = req.params;
  const { title, completed } = req.body;

  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  const index = parseInt(subtaskIndex);
  if (index < 0 || index >= task.subtasks.length) {
    return res.status(400).json({
      success: false,
      error: "Index de sous-tâche invalide",
    });
  }

  if (title !== undefined) task.subtasks[index].title = title;
  if (completed !== undefined) task.subtasks[index].completed = completed;

  // Calculer automatiquement la progression basée sur les sous-tâches complétées
  if (task.subtasks && task.subtasks.length > 0) {
    const completedSubtasks = task.subtasks.filter((st) => st.completed).length;
    const totalSubtasks = task.subtasks.length;
    task.progress = Math.round((completedSubtasks / totalSubtasks) * 100);

    // Mettre à jour le statut si nécessaire
    if (task.progress === 100 && task.status !== "completed") {
      task.status = "completed";
    } else if (task.progress > 0 && task.status === "todo") {
      task.status = "in_progress";
    }
  }

  await task.save();
  await task.populate("companyId", "name");

  res.json({
    success: true,
    data: task,
  });
});

/**
 * Planifier une tâche dans Google Calendar
 */
export const scheduleTaskToCalendar = asyncHandler(async (req, res) => {
  try {
    console.log("=".repeat(50));
    console.log("[TASK SCHEDULER] Début de la planification");
    console.log("[TASK SCHEDULER] Task ID:", req.params.id);
    console.log("[TASK SCHEDULER] User ID:", req.user?._id || req.session?.userId);
    console.log("[TASK SCHEDULER] Request body:", req.body);
    
    if (!req.user && !req.session?.userId) {
      console.log("[TASK SCHEDULER] ERREUR: Utilisateur non authentifié");
      return res.status(401).json({
        success: false,
        error: "Non authentifié",
      });
    }
    
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user?._id || req.session?.userId,
    });

  if (!task) {
    console.log("[TASK SCHEDULER] ERREUR: Tâche non trouvée");
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  console.log("[TASK SCHEDULER] Tâche trouvée:", {
    title: task.title,
    duration: task.duration,
    deadline: task.deadline,
    googleEventId: task.googleEventId,
  });

  // Vérifier si la tâche a déjà des créneaux planifiés non complétés
  const hasIncompleteSlots = task.scheduledSlots?.some(slot => !slot.completed);
  if (hasIncompleteSlots && !req.body.forceReschedule) {
    console.log("[TASK SCHEDULER] ATTENTION: Tâche a déjà des créneaux planifiés non complétés");
    // On permet quand même la planification pour replanifier la partie restante
  }

    // Vérifier que l'utilisateur a un calendrier Google configuré
    const userId = req.user?._id || req.session?.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      console.log("[TASK SCHEDULER] ERREUR: Utilisateur non trouvé");
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }
    
    if (!user.googleCalendarId) {
      console.log("[TASK SCHEDULER] ERREUR: Calendrier Google non configuré");
      return res.status(400).json({
        success: false,
        error: "Calendrier Google non configuré. Veuillez vous reconnecter avec Google.",
      });
    }

    console.log("[TASK SCHEDULER] Calendrier Google configuré:", user.googleCalendarId);
    console.log("[TASK SCHEDULER] Calendriers sélectionnés:", user.selectedCalendarIds?.length || 0);
    
    // Vérifier si des calendriers sont sélectionnés
    if (!user.selectedCalendarIds || user.selectedCalendarIds.length === 0) {
      console.log("[TASK SCHEDULER] ATTENTION: Aucun calendrier sélectionné dans les paramètres");
      console.log("[TASK SCHEDULER] Le système utilisera tous les calendriers par défaut");
      // On continue quand même, car le service utilisera tous les calendriers par défaut
    }

    // Date préférée si fournie
    const preferredDate = req.body.preferredDate
      ? new Date(req.body.preferredDate)
      : null;

    console.log("[TASK SCHEDULER] Date préférée:", preferredDate);

    // Planifier la tâche
    console.log("[TASK SCHEDULER] Appel de scheduleTask...");
    const result = await scheduleTask(user, task, preferredDate);
    console.log("[TASK SCHEDULER] Résultat de scheduleTask:", {
      success: result.success,
      reason: result.reason,
      hasSlot: !!result.slot,
    });

    if (!result.success) {
      console.log("[TASK SCHEDULER] ÉCHEC - Envoi de l'erreur au client:", result.reason);
      return res.status(400).json({
        success: false,
        error: result.reason,
        alternatives: result.alternatives || [],
      });
    }

    // Mettre à jour la tâche avec les informations de planification
    // Initialiser scheduledSlots si nécessaire
    if (!task.scheduledSlots) {
      task.scheduledSlots = [];
    }
    
    // Si la tâche a été splittée en plusieurs créneaux
    if (result.slots && result.slots.length > 0) {
      for (const slotData of result.slots) {
        task.scheduledSlots.push({
          start: slotData.slot.start,
          end: slotData.slot.end,
          googleEventId: slotData.event.id,
          completed: false,
          timeSpent: 0,
        });
      }
      // Mettre à jour les champs de compatibilité avec le premier créneau
      task.googleEventId = result.slots[0].event.id;
      task.scheduledStart = result.slots[0].slot.start;
      task.scheduledEnd = result.slots[result.slots.length - 1].slot.end;
    } else {
      // Un seul créneau
      task.scheduledSlots.push({
        start: result.slot.start,
        end: result.slot.end,
        googleEventId: result.event.id,
        completed: false,
        timeSpent: 0,
      });
      
      // Mettre à jour les champs de compatibilité (dépréciés)
      task.googleEventId = result.event.id;
      task.scheduledStart = result.slot.start;
      task.scheduledEnd = result.slot.end;
    }
    
    await task.save();

    await task.populate("companyId", "name");

    console.log("[TASK SCHEDULER] SUCCÈS - Tâche planifiée avec succès");
    res.json({
      success: true,
      data: {
        task,
        event: result.event,
        slot: result.slot,
        alternatives: result.alternatives || [],
      },
    });
  } catch (error) {
    console.error("[TASK SCHEDULER] ERREUR INATTENDUE:", error);
    console.error("[TASK SCHEDULER] Stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: "Erreur serveur lors de la planification: " + error.message,
    });
  }
});

/**
 * Mettre à jour le temps passé et la progression d'une tâche
 */
export const updateTaskProgress = asyncHandler(async (req, res) => {
  const { timeSpent, progress } = req.body;
  const { slotIndex } = req.params;

  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  // Mettre à jour le temps total passé
  if (timeSpent !== undefined) {
    task.timeSpent = Math.max(0, timeSpent);
  }

  // Mettre à jour la progression
  if (progress !== undefined) {
    task.progress = Math.max(0, Math.min(100, progress));
  }

  // Si un slotIndex est fourni, mettre à jour le temps passé sur ce créneau
  if (slotIndex !== undefined && task.scheduledSlots) {
    const index = parseInt(slotIndex);
    if (index >= 0 && index < task.scheduledSlots.length) {
      if (timeSpent !== undefined) {
        task.scheduledSlots[index].timeSpent = Math.max(0, timeSpent);
      }
    }
  }

  // Calculer automatiquement la progression si non fournie
  if (progress === undefined && task.duration > 0) {
    const totalTimeSpent = task.timeSpent || 0;
    task.progress = Math.min(100, Math.round((totalTimeSpent / task.duration) * 100));
  }

  await task.save();
  await task.populate("companyId", "name");

  res.json({
    success: true,
    data: task,
  });
});

/**
 * Marquer un créneau planifié comme complété
 */
export const completeScheduledSlot = asyncHandler(async (req, res) => {
  const { slotIndex } = req.params;
  const { timeSpent } = req.body;

  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  if (!task.scheduledSlots || task.scheduledSlots.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Cette tâche n'a pas de créneaux planifiés",
    });
  }

  const index = parseInt(slotIndex);
  if (index < 0 || index >= task.scheduledSlots.length) {
    return res.status(400).json({
      success: false,
      error: "Index de créneau invalide",
    });
  }

  const slot = task.scheduledSlots[index];
  slot.completed = true;
  
  if (timeSpent !== undefined) {
    slot.timeSpent = Math.max(0, timeSpent);
  } else {
    // Calculer le temps passé depuis le début du créneau
    const slotDuration = (new Date(slot.end) - new Date(slot.start)) / (1000 * 60);
    slot.timeSpent = slot.timeSpent || slotDuration;
  }

  // Mettre à jour le temps total passé
  task.timeSpent = (task.timeSpent || 0) + slot.timeSpent;

  // Calculer la progression
  if (task.duration > 0) {
    task.progress = Math.min(100, Math.round((task.timeSpent / task.duration) * 100));
  }

  // Si la progression est à 100%, marquer la tâche comme complétée
  if (task.progress >= 100) {
    task.status = "completed";
  } else if (task.status === "todo") {
    // Si c'était "à faire" et qu'on a commencé, passer à "en cours"
    task.status = "in_progress";
  }

  await task.save();
  await task.populate("companyId", "name");

  res.json({
    success: true,
    data: task,
  });
});

/**
 * Synchronise les créneaux planifiés d'une tâche avec Google Calendar
 */
export const syncTaskSlots = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  const user = await User.findById(req.user._id);
  if (!user || !user.googleCalendarId) {
    return res.status(400).json({
      success: false,
      error: "Calendrier Google non configuré",
    });
  }

  if (!task.scheduledSlots || task.scheduledSlots.length === 0) {
    return res.json({
      success: true,
      data: task,
      message: "Aucun créneau à synchroniser",
    });
  }

  // Récupérer les événements depuis Google Calendar
  const { getCalendarEvents } = await import("../services/calendar/googleCalendar.service.js");
  
  // Déterminer la période de recherche (de maintenant à 30 jours dans le futur)
  const now = new Date();
  const searchEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const allEvents = await getCalendarEvents(user, now, searchEnd);
  
  // Filtrer les événements du calendrier "Life Planner AI"
  const lifePlannerEvents = allEvents.filter(
    (event) => event.calendarId === user.googleCalendarId
  );

  // Créer un Map des événements par ID
  const eventsMap = new Map();
  lifePlannerEvents.forEach((event) => {
    eventsMap.set(event.id, event);
  });

  // Synchroniser les créneaux avec les événements réels
  let hasChanges = false;
  for (let i = 0; i < task.scheduledSlots.length; i++) {
    const slot = task.scheduledSlots[i];
    if (slot.googleEventId) {
      const calendarEvent = eventsMap.get(slot.googleEventId);
      
      if (calendarEvent) {
        // Mettre à jour les dates depuis Google Calendar
        const eventStart = new Date(calendarEvent.start.dateTime || calendarEvent.start.date);
        const eventEnd = new Date(calendarEvent.end.dateTime || calendarEvent.end.date);
        
        // Vérifier si les dates ont changé
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        
        if (
          eventStart.getTime() !== slotStart.getTime() ||
          eventEnd.getTime() !== slotEnd.getTime()
        ) {
          slot.start = eventStart;
          slot.end = eventEnd;
          hasChanges = true;
        }
      } else {
        // L'événement n'existe plus dans Google Calendar, le marquer comme supprimé
        // On pourrait le supprimer ou le garder avec un flag
        console.log(`[SYNC] Événement ${slot.googleEventId} non trouvé dans Google Calendar`);
      }
    }
  }

  if (hasChanges) {
    await task.save();
  }

  await task.populate("companyId", "name");

  res.json({
    success: true,
    data: task,
    hasChanges,
  });
});

/**
 * Replanifier complètement une tâche (supprime les anciens créneaux et replanifie)
 */
export const rescheduleTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user || !user.googleCalendarId) {
    return res.status(400).json({
      success: false,
      error: "Calendrier Google non configuré",
    });
  }

  // Supprimer les anciens événements Google Calendar
  const { deleteCalendarEvent } = await import("../services/calendar/googleCalendar.service.js");
  
  if (task.scheduledSlots && task.scheduledSlots.length > 0) {
    for (const slot of task.scheduledSlots) {
      if (slot.googleEventId) {
        try {
          await deleteCalendarEvent(user, slot.googleEventId);
        } catch (error) {
          console.error(`[RESCHEDULE] Erreur lors de la suppression de l'événement ${slot.googleEventId}:`, error);
          // Continuer même si la suppression échoue
        }
      }
    }
  }

  // Réinitialiser les créneaux planifiés
  task.scheduledSlots = [];
  task.googleEventId = null;
  task.scheduledStart = null;
  task.scheduledEnd = null;
  await task.save();

  // Replanifier la tâche complète
  const { scheduleTask } = await import("../services/calendar/taskScheduler.service.js");
  const result = await scheduleTask(user, task);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.reason,
      alternatives: result.alternatives || [],
    });
  }

  // Ajouter le nouveau créneau (ou les créneaux si split)
  if (!task.scheduledSlots) {
    task.scheduledSlots = [];
  }

  // Si la tâche a été splittée en plusieurs créneaux
  if (result.slots && result.slots.length > 0) {
    for (const slotData of result.slots) {
      task.scheduledSlots.push({
        start: slotData.slot.start,
        end: slotData.slot.end,
        googleEventId: slotData.event.id,
        completed: false,
        timeSpent: 0,
      });
    }
    // Mettre à jour les champs de compatibilité avec le premier créneau
    task.googleEventId = result.slots[0].event.id;
    task.scheduledStart = result.slots[0].slot.start;
    task.scheduledEnd = result.slots[result.slots.length - 1].slot.end;
  } else {
    // Un seul créneau
    task.scheduledSlots.push({
      start: result.slot.start,
      end: result.slot.end,
      googleEventId: result.event.id,
      completed: false,
      timeSpent: 0,
    });

    // Mettre à jour les champs de compatibilité
    task.googleEventId = result.event.id;
    task.scheduledStart = result.slot.start;
    task.scheduledEnd = result.slot.end;
  }

  await task.save();
  await task.populate("companyId", "name");

  res.json({
    success: true,
    data: {
      task,
      event: result.event,
      slot: result.slot,
      alternatives: result.alternatives || [],
    },
  });
});

/**
 * Replanifier la partie restante d'une tâche
 */
export const rescheduleRemaining = asyncHandler(async (req, res) => {
  const { preferredDate } = req.body;

  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!task) {
    return res.status(404).json({
      success: false,
      error: "Tâche non trouvée",
    });
  }

  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user || !user.googleCalendarId) {
    return res.status(400).json({
      success: false,
      error: "Calendrier Google non configuré",
    });
  }

  const result = await rescheduleRemainingTask(user, task, preferredDate ? new Date(preferredDate) : null);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.reason,
      alternatives: result.alternatives || [],
    });
  }

  // Ajouter le nouveau créneau
  if (!task.scheduledSlots) {
    task.scheduledSlots = [];
  }

  task.scheduledSlots.push({
    start: result.slot.start,
    end: result.slot.end,
    googleEventId: result.event.id,
    completed: false,
    timeSpent: 0,
  });

  await task.save();
  await task.populate("companyId", "name");

  res.json({
    success: true,
    data: {
      task,
      event: result.event,
      slot: result.slot,
      alternatives: result.alternatives || [],
      remainingTime: calculateRemainingTime(task),
    },
  });
});
