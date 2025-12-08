import Goal from "../models/goal.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Récupérer tous les objectifs de l'utilisateur
 */
export const getGoals = asyncHandler(async (req, res) => {
  const { horizon, status, companyId } = req.query;
  const filter = {
    userId: req.user._id,
  };

  if (horizon) {
    filter.horizon = horizon;
  }

  if (status) {
    filter.status = status;
  }

  if (companyId) {
    filter.companyId = companyId;
  }

  const goals = await Goal.find(filter)
    .populate("companyId", "name sector")
    .populate("tasks", "title status deadline")
    .sort({ importance: -1, createdAt: -1 });

  res.json({
    success: true,
    count: goals.length,
    data: goals,
  });
});

/**
 * Récupérer un objectif par ID
 */
export const getGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({
    _id: req.params.id,
    userId: req.user._id,
  })
    .populate("companyId", "name sector")
    .populate("tasks", "title status deadline duration businessValue");

  if (!goal) {
    return res.status(404).json({
      success: false,
      error: "Objectif non trouvé",
    });
  }

  res.json({
    success: true,
    data: goal,
  });
});

/**
 * Créer un nouvel objectif
 */
export const createGoal = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    horizon,
    importance,
    businessImpact,
    deadline,
    companyId,
    tasks,
    status,
  } = req.body;

  if (!title || !horizon || !importance) {
    return res.status(400).json({
      success: false,
      error: "Le titre, l'horizon et l'importance sont requis",
    });
  }

  if (!["short_term", "medium_term", "long_term"].includes(horizon)) {
    return res.status(400).json({
      success: false,
      error: "L'horizon doit être short_term, medium_term ou long_term",
    });
  }

  const goal = await Goal.create({
    userId: req.user._id,
    title,
    description,
    horizon,
    importance: parseInt(importance),
    businessImpact: businessImpact ? parseFloat(businessImpact) : 0,
    deadline: deadline ? new Date(deadline) : null,
    companyId: companyId || null,
    tasks: tasks || [],
    status: status || "active",
  });

  await goal.populate("companyId", "name sector");
  await goal.populate("tasks", "title status");

  res.status(201).json({
    success: true,
    data: goal,
  });
});

/**
 * Mettre à jour un objectif
 */
export const updateGoal = asyncHandler(async (req, res) => {
  let goal = await Goal.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      error: "Objectif non trouvé",
    });
  }

  const {
    title,
    description,
    horizon,
    importance,
    businessImpact,
    deadline,
    companyId,
    tasks,
    status,
  } = req.body;

  if (title !== undefined) goal.title = title;
  if (description !== undefined) goal.description = description;
  if (horizon !== undefined) {
    if (!["short_term", "medium_term", "long_term"].includes(horizon)) {
      return res.status(400).json({
        success: false,
        error: "L'horizon doit être short_term, medium_term ou long_term",
      });
    }
    goal.horizon = horizon;
  }
  if (importance !== undefined) goal.importance = parseInt(importance);
  if (businessImpact !== undefined) goal.businessImpact = parseFloat(businessImpact) || 0;
  if (deadline !== undefined) goal.deadline = deadline ? new Date(deadline) : null;
  if (companyId !== undefined) goal.companyId = companyId || null;
  if (tasks !== undefined) goal.tasks = tasks;
  if (status !== undefined) {
    if (!["active", "completed", "cancelled", "on_hold"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Statut invalide",
      });
    }
    goal.status = status;
  }

  await goal.save();

  await goal.populate("companyId", "name sector");
  await goal.populate("tasks", "title status deadline");

  res.json({
    success: true,
    data: goal,
  });
});

/**
 * Supprimer un objectif
 */
export const deleteGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      error: "Objectif non trouvé",
    });
  }

  await goal.deleteOne();

  res.json({
    success: true,
    message: "Objectif supprimé avec succès",
  });
});

/**
 * Mettre à jour le statut d'un objectif
 */
export const updateGoalStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["active", "completed", "cancelled", "on_hold"].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Statut invalide",
    });
  }

  const goal = await Goal.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      error: "Objectif non trouvé",
    });
  }

  goal.status = status;
  await goal.save();

  await goal.populate("companyId", "name sector");
  await goal.populate("tasks", "title status");

  res.json({
    success: true,
    data: goal,
  });
});

/**
 * Ajouter une tâche à un objectif
 */
export const addTaskToGoal = asyncHandler(async (req, res) => {
  const { taskId } = req.body;

  if (!taskId) {
    return res.status(400).json({
      success: false,
      error: "L'ID de la tâche est requis",
    });
  }

  const goal = await Goal.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      error: "Objectif non trouvé",
    });
  }

  // Vérifier que la tâche n'est pas déjà associée
  if (goal.tasks.includes(taskId)) {
    return res.status(400).json({
      success: false,
      error: "Cette tâche est déjà associée à cet objectif",
    });
  }

  goal.tasks.push(taskId);
  await goal.save();

  await goal.populate("companyId", "name sector");
  await goal.populate("tasks", "title status deadline");

  res.json({
    success: true,
    data: goal,
  });
});

/**
 * Retirer une tâche d'un objectif
 */
export const removeTaskFromGoal = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const goal = await Goal.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      error: "Objectif non trouvé",
    });
  }

  goal.tasks = goal.tasks.filter(
    (id) => id.toString() !== taskId
  );
  await goal.save();

  await goal.populate("companyId", "name sector");
  await goal.populate("tasks", "title status deadline");

  res.json({
    success: true,
    data: goal,
  });
});

