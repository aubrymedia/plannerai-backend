import Company from "../../models/company.model.js";
import Task from "../../models/task.model.js";
import Goal from "../../models/goal.model.js";
import PlanningContext from "../../models/planningContext.model.js";

/**
 * Construit le contexte complet pour la planification IA
 */
export const buildPlanningContext = async (userId, startDate, endDate) => {
  try {
    // Récupérer toutes les données nécessaires
    const [companies, tasks, goals, planningContext] = await Promise.all([
      Company.find({ userId, isActive: true }),
      Task.find({
        userId,
        status: { $in: ["todo", "in_progress"] },
        deadline: { $lte: endDate, $gte: startDate },
      })
        .populate("companyId", "name strategicWeight")
        .populate("dependencies", "title status"),
      Goal.find({ userId, status: "active" }).populate("companyId", "name"),
      PlanningContext.findOne({ userId }),
    ]);

    // Calculer les statistiques financières
    const totalTreasury = companies.reduce(
      (sum, c) => sum + (c.currentTreasury || 0),
      0
    );
    const totalMRR = companies.reduce((sum, c) => sum + (c.mrr || 0), 0);
    const totalPipeline = companies.reduce(
      (sum, c) => sum + (c.pipelineValue || 0),
      0
    );

    // Calculer la valeur totale des tâches
    const totalTaskValue = tasks.reduce(
      (sum, t) => sum + (t.businessValue?.potentialRevenue || 0),
      0
    );

    // Trier les tâches par priorité (urgence + impact stratégique)
    const prioritizedTasks = tasks
      .map((task) => ({
        ...task.toObject(),
        priorityScore:
          (task.businessValue?.urgency || 5) * 2 +
          (task.businessValue?.strategicImpact || 5) +
          (task.companyId?.strategicWeight || 5),
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      // Période
      period: {
        start: startDate,
        end: endDate,
        durationDays: Math.ceil(
          (endDate - startDate) / (1000 * 60 * 60 * 24)
        ),
      },

      // Contexte financier
      financial: {
        personalTreasury: planningContext?.personalTreasury || 0,
        minimumMonthlyNeeds: planningContext?.minimumMonthlyNeeds || 0,
        totalCompanyTreasury: totalTreasury,
        totalMRR,
        totalPipeline,
        riskProfile: planningContext?.riskProfile || "medium",
      },

      // Sociétés
      companies: companies.map((c) => ({
        id: c._id,
        name: c.name,
        sector: c.sector,
        strategicWeight: c.strategicWeight,
        treasury: c.currentTreasury,
        mrr: c.mrr,
        pipeline: c.pipelineValue,
        revenueStability: c.revenueStability,
      })),

      // Tâches prioritaires
      tasks: prioritizedTasks.map((t) => ({
        id: t._id,
        title: t.title,
        description: t.description,
        duration: t.duration,
        deadline: t.deadline,
        company: t.companyId?.name || null,
        companyStrategicWeight: t.companyId?.strategicWeight || 0,
        businessValue: t.businessValue,
        priorityScore: t.priorityScore,
        dependencies: t.dependencies?.map((d) => d._id.toString()) || [],
        subtasks: t.subtasks || [],
      })),

      // Objectifs
      goals: goals.map((g) => ({
        id: g._id,
        title: g.title,
        horizon: g.horizon,
        importance: g.importance,
        deadline: g.deadline,
        company: g.companyId?.name || null,
      })),

      // Contexte personnel
      personal: {
        personalInfo: planningContext?.personalInfo || {},
        preferredHours: planningContext?.preferredHours || {},
        constraints: planningContext?.constraints || {},
        aiNotes: planningContext?.aiNotes || "",
      },

      // Statistiques
      stats: {
        totalTasks: tasks.length,
        totalCompanies: companies.length,
        totalGoals: goals.length,
        totalTaskValue,
        averageTaskDuration: tasks.length
          ? tasks.reduce((sum, t) => sum + t.duration, 0) / tasks.length
          : 0,
      },
    };
  } catch (error) {
    console.error("[Context Builder] Error:", error);
    throw new Error("Erreur lors de la construction du contexte");
  }
};

