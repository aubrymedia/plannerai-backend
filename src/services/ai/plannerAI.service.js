import OpenAI from "openai";
import env from "../../config/env.js";
import { buildPlanningContext } from "../context/contextBuilder.service.js";
import { getFreeSlots, getCalendarEvents } from "../calendar/googleCalendar.service.js";
import User from "../../models/user.model.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Génère une planification optimisée avec l'IA
 */
export const generatePlanning = async (user, startDate, endDate) => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  try {
    // Construire le contexte
    const context = await buildPlanningContext(user._id, startDate, endDate);

    // Récupérer tous les événements du calendrier (y compris les entraînements)
    const calendarEvents = await getCalendarEvents(user, startDate, endDate);

    // Identifier les événements sportifs
    const sportEvents = calendarEvents.filter((event) => {
      const summary = (event.summary || "").toLowerCase();
      const description = (event.description || "").toLowerCase();
      const sportKeywords = [
        "karaté",
        "karate",
        "sport",
        "entraînement",
        "entrainement",
        "training",
        "gym",
        "fitness",
        "course",
        "running",
        "vélo",
        "velo",
        "natation",
        "swimming",
        "tennis",
        "football",
        "basket",
        "yoga",
        "pilates",
      ];
      return (
        sportKeywords.some((keyword) => summary.includes(keyword)) ||
        sportKeywords.some((keyword) => description.includes(keyword))
      );
    });

    // Récupérer les créneaux libres
    const freeSlots = await getFreeSlots(
      user,
      startDate,
      endDate,
      context.personal.preferredHours
    );

    // Préparer le prompt pour l'IA
    const prompt = `Tu es un assistant expert en planification stratégique et productivité.

CONTEXTE FINANCIER:
- Trésorerie personnelle: ${context.financial.personalTreasury}€
- Besoins mensuels minimum: ${context.financial.minimumMonthlyNeeds}€
- Trésorerie totale des sociétés: ${context.financial.totalCompanyTreasury}€
- MRR total: ${context.financial.totalMRR}€
- Pipeline total: ${context.financial.totalPipeline}€
- Profil de risque: ${context.financial.riskProfile}

SOCIÉTÉS (${context.companies.length}):
${context.companies
  .map(
    (c) =>
      `- ${c.name} (${c.sector}): Poids ${c.strategicWeight}/10, Trésorerie ${c.treasury}€, MRR ${c.mrr}€, Pipeline ${c.pipeline}€`
  )
  .join("\n")}

TÂCHES À PLANIFIER (${context.tasks.length}):
${context.tasks
  .map(
    (t) =>
      `- ${t.title} (${t.duration}min): Revenu ${t.businessValue.potentialRevenue}€, Impact ${t.businessValue.strategicImpact}/10, Urgence ${t.businessValue.urgency}/10, Deadline: ${t.deadline ? new Date(t.deadline).toLocaleDateString("fr-FR") : "Aucune"}, Société: ${t.company || "Aucune"}`
  )
  .join("\n")}

ÉVÉNEMENTS EXISTANTS DANS LE CALENDRIER (${calendarEvents.length}):
${calendarEvents
  .slice(0, 30)
  .map(
    (event) =>
      `- ${event.summary || "Sans titre"} (${event.calendarName}): ${new Date(event.start.dateTime || event.start.date).toLocaleString("fr-FR")} → ${new Date(event.end.dateTime || event.end.date).toLocaleString("fr-FR")}`
  )
  .join("\n")}

ÉVÉNEMENTS SPORTIFS IDENTIFIÉS (${sportEvents.length}):
${sportEvents
  .map(
    (event) =>
      `- ${event.summary || "Sans titre"}: ${new Date(event.start.dateTime || event.start.date).toLocaleString("fr-FR")} → ${new Date(event.end.dateTime || event.end.date).toLocaleString("fr-FR")}`
  )
  .join("\n")}

CRÉNEAUX LIBRES DISPONIBLES:
${freeSlots
  .slice(0, 50)
  .map(
    (slot) =>
      `- ${new Date(slot.start).toLocaleString("fr-FR")} → ${new Date(slot.end).toLocaleString("fr-FR")}`
  )
  .join("\n")}

PÉRIODE DE PLANIFICATION: ${new Date(startDate).toLocaleDateString("fr-FR")} → ${new Date(endDate).toLocaleDateString("fr-FR")} (${context.period.durationDays} jours)

CONTRAINTES PERSONNELLES:
${context.personal.constraints.sport ? `- Sport: ${context.personal.constraints.sport}` : ""}
${context.personal.constraints.rest ? `- Repos: ${context.personal.constraints.rest}` : ""}
${context.personal.constraints.evenings ? `- Soirées: ${context.personal.constraints.evenings}` : ""}

OBJECTIF: Crée une planification optimisée qui :
1. Priorise les tâches avec le plus d'impact business et d'urgence
2. Respecte les deadlines
3. Prend en compte les dépendances entre tâches
4. Optimise selon le contexte financier (besoins de trésorerie, MRR, pipeline)
5. Respecte les contraintes personnelles
6. Utilise les créneaux libres disponibles
7. NE CRÉE PAS d'événements qui chevauchent les événements existants du calendrier
8. Prend en compte la FATIGUE des entraînements sportifs : après un entraînement, évite de planifier des tâches très exigeantes mentalement ou physiquement. Laisse un temps de récupération (au moins 2-3 heures après un entraînement intensif)
9. Pour les objectifs sportifs, prend en compte la fréquence et l'intensité des entraînements pour éviter le surentraînement

Réponds UNIQUEMENT au format JSON suivant, sans texte supplémentaire :
{
  "timeBlocks": [
    {
      "type": "sport" | "priority_task" | "profitable_short_term" | "long_term_development" | "personal_time" | "buffer",
      "start": "2024-01-15T09:00:00Z",
      "end": "2024-01-15T10:00:00Z",
      "taskId": "id_de_la_tache_ou_null",
      "title": "Titre du bloc",
      "description": "Description optionnelle"
    }
  ],
  "aiNotes": "Notes et recommandations stratégiques de l'IA"
}

IMPORTANT:
- Utilise les créneaux libres fournis
- Assigne les tâches par ordre de priorité
- Inclus des blocs de buffer pour l'imprévu
- Respecte les contraintes de temps (deadlines, durées)
- Optimise pour maximiser la valeur business`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es un expert en planification stratégique et optimisation du temps. Tu crées des planifications qui maximisent la valeur business tout en respectant les contraintes personnelles.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0].message.content);

    // Convertir les dates string en Date objects
    const timeBlocks = (response.timeBlocks || []).map((block) => ({
      ...block,
      start: new Date(block.start),
      end: new Date(block.end),
    }));

    return {
      timeBlocks,
      aiNotes: response.aiNotes || "",
    };
  } catch (error) {
    console.error("[Planner AI] Error:", error);
    throw new Error("Erreur lors de la génération de la planification");
  }
};

