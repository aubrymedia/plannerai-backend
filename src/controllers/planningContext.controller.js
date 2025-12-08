import PlanningContext from "../models/planningContext.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Récupère le contexte personnel de l'utilisateur
 */
export const getPlanningContext = asyncHandler(async (req, res) => {
  let planningContext = await PlanningContext.findOne({
    userId: req.user._id,
  });

  // Si le contexte n'existe pas, le créer avec des valeurs par défaut
  if (!planningContext) {
    planningContext = await PlanningContext.create({
      userId: req.user._id,
    });
  }

  res.json({
    success: true,
    data: planningContext,
  });
});

/**
 * Met à jour le contexte personnel de l'utilisateur
 */
export const updatePlanningContext = asyncHandler(async (req, res) => {
  const {
    personalInfo,
    personalTreasury,
    minimumMonthlyNeeds,
    riskProfile,
    preferredHours,
    constraints,
    aiNotes,
  } = req.body;

  let planningContext = await PlanningContext.findOne({
    userId: req.user._id,
  });

  // Si le contexte n'existe pas, le créer
  if (!planningContext) {
    planningContext = await PlanningContext.create({
      userId: req.user._id,
    });
  }

  // Mettre à jour les champs fournis
  if (personalInfo !== undefined) {
    planningContext.personalInfo = {
      ...planningContext.personalInfo,
      ...personalInfo,
    };
  }

  if (personalTreasury !== undefined) {
    planningContext.personalTreasury = personalTreasury;
  }

  if (minimumMonthlyNeeds !== undefined) {
    planningContext.minimumMonthlyNeeds = minimumMonthlyNeeds;
  }

  if (riskProfile !== undefined) {
    planningContext.riskProfile = riskProfile;
  }

  if (preferredHours !== undefined) {
    planningContext.preferredHours = {
      ...planningContext.preferredHours,
      ...preferredHours,
    };
  }

  if (constraints !== undefined) {
    planningContext.constraints = {
      ...planningContext.constraints,
      ...constraints,
    };
  }

  if (aiNotes !== undefined) {
    planningContext.aiNotes = aiNotes;
  }

  await planningContext.save();

  res.json({
    success: true,
    data: planningContext,
  });
});

