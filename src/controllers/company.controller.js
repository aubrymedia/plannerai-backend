import Company from "../models/company.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Récupérer toutes les sociétés de l'utilisateur
 */
export const getCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find({
    userId: req.user._id,
    isActive: true,
  }).sort({ createdAt: -1 });

  res.json({
    success: true,
    count: companies.length,
    data: companies,
  });
});

/**
 * Récupérer une société par ID
 */
export const getCompany = asyncHandler(async (req, res) => {
  const company = await Company.findOne({
    _id: req.params.id,
    userId: req.user._id,
    isActive: true,
  });

  if (!company) {
    return res.status(404).json({
      success: false,
      error: "Société non trouvée",
    });
  }

  res.json({
    success: true,
    data: company,
  });
});

/**
 * Créer une nouvelle société
 */
export const createCompany = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    sector,
    strategicWeight,
    foundedDate,
    pappersUrl,
    currentTreasury,
    mrr,
    oneOffMonthlyRevenue,
    pipelineValue,
    revenueStability,
  } = req.body;

  const company = await Company.create({
    userId: req.user._id,
    name,
    description,
    sector: sector || "other",
    strategicWeight: strategicWeight || 5,
    foundedDate: foundedDate ? new Date(foundedDate) : undefined,
    pappersUrl: pappersUrl || undefined,
    currentTreasury: currentTreasury || 0,
    mrr: mrr || 0,
    oneOffMonthlyRevenue: oneOffMonthlyRevenue || 0,
    pipelineValue: pipelineValue || 0,
    revenueStability: revenueStability || 5,
  });

  res.status(201).json({
    success: true,
    data: company,
  });
});

/**
 * Mettre à jour une société
 */
export const updateCompany = asyncHandler(async (req, res) => {
  let company = await Company.findOne({
    _id: req.params.id,
    userId: req.user._id,
    isActive: true,
  });

  if (!company) {
    return res.status(404).json({
      success: false,
      error: "Société non trouvée",
    });
  }

  // Mettre à jour les champs fournis
  const {
    name,
    description,
    sector,
    strategicWeight,
    foundedDate,
    pappersUrl,
    currentTreasury,
    mrr,
    oneOffMonthlyRevenue,
    pipelineValue,
    revenueStability,
  } = req.body;

  if (name !== undefined) company.name = name;
  if (description !== undefined) company.description = description;
  if (sector !== undefined) company.sector = sector;
  if (strategicWeight !== undefined) company.strategicWeight = strategicWeight;
  if (foundedDate !== undefined)
    company.foundedDate = foundedDate ? new Date(foundedDate) : null;
  if (pappersUrl !== undefined) company.pappersUrl = pappersUrl || null;
  if (currentTreasury !== undefined) company.currentTreasury = currentTreasury;
  if (mrr !== undefined) company.mrr = mrr;
  if (oneOffMonthlyRevenue !== undefined)
    company.oneOffMonthlyRevenue = oneOffMonthlyRevenue;
  if (pipelineValue !== undefined) company.pipelineValue = pipelineValue;
  if (revenueStability !== undefined)
    company.revenueStability = revenueStability;

  await company.save();

  res.json({
    success: true,
    data: company,
  });
});

/**
 * Supprimer une société (soft delete)
 */
export const deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findOne({
    _id: req.params.id,
    userId: req.user._id,
    isActive: true,
  });

  if (!company) {
    return res.status(404).json({
      success: false,
      error: "Société non trouvée",
    });
  }

  company.isActive = false;
  await company.save();

  res.json({
    success: true,
    message: "Société supprimée avec succès",
  });
});

/**
 * Créer un snapshot historique pour une société
 */
export const createSnapshot = asyncHandler(async (req, res) => {
  const company = await Company.findOne({
    _id: req.params.id,
    userId: req.user._id,
    isActive: true,
  });

  if (!company) {
    return res.status(404).json({
      success: false,
      error: "Société non trouvée",
    });
  }

  const { strategicComments, aiHints } = req.body;

  const snapshot = {
    date: new Date(),
    mrr: company.mrr,
    oneOff: company.oneOffMonthlyRevenue,
    treasury: company.currentTreasury,
    pipeline: company.pipelineValue,
    strategicComments,
    aiHints,
  };

  company.snapshots.push(snapshot);
  await company.save();

  res.status(201).json({
    success: true,
    data: snapshot,
  });
});

/**
 * Récupérer les snapshots d'une société
 */
export const getSnapshots = asyncHandler(async (req, res) => {
  const company = await Company.findOne({
    _id: req.params.id,
    userId: req.user._id,
    isActive: true,
  }).select("snapshots");

  if (!company) {
    return res.status(404).json({
      success: false,
      error: "Société non trouvée",
    });
  }

  res.json({
    success: true,
    count: company.snapshots.length,
    data: company.snapshots.sort((a, b) => b.date - a.date),
  });
});

