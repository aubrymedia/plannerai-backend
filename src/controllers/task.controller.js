import Task from "../models/task.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { improveTaskDescription } from "../services/ai/openai.service.js";
import { scheduleTask, rescheduleRemainingTask, calculateRemainingTime } from "../services/calendar/taskScheduler.service.js";
import User from "../models/user.model.js";

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
    filter.companyId = companyId;
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

  const task = await Task.create({
    userId: req.user._id,
    title,
    description,
    companyId: companyId || null,
    duration: duration || 60, // 60 minutes par défaut
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
  if (duration !== undefined) task.duration = duration;
  if (deadline !== undefined) task.deadline = deadline ? new Date(deadline) : null;
  if (subtasks !== undefined) task.subtasks = subtasks;
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

  await task.save();

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
    
    // Ajouter le nouveau créneau planifié
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
