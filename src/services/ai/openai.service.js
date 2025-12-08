import OpenAI from "openai";
import env from "../../config/env.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Améliore une description de tâche et génère un titre optimisé
 */
export const improveTaskDescription = async (description) => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const prompt = `Tu es un assistant expert en productivité et gestion de tâches. 
À partir de la description suivante d'une tâche, génère :
1. Un titre de tâche court, clair et actionnable (maximum 80 caractères) qui reste FIDÈLE à la description originale. Le titre doit reprendre TOUS les éléments importants mentionnés dans l'ordre logique, sans en omettre.
2. Une description améliorée, structurée et détaillée (2-3 phrases)
3. Une liste de sous-tâches décomposant les actions principales mentionnées dans la description

Description fournie : "${description}"

IMPORTANT pour le titre :
- Conserve TOUS les éléments importants de la description originale
- Garde l'ordre logique des actions
- Utilise les mêmes termes clés (noms propres, événements, etc.)
- Sois concis mais complet

Réponds UNIQUEMENT au format JSON suivant, sans texte supplémentaire :
{
  "title": "Titre de la tâche fidèle à la description",
  "description": "Description améliorée et structurée",
  "subtasks": [
    "Sous-tâche 1",
    "Sous-tâche 2",
    "Sous-tâche 3"
  ]
}

Les sous-tâches doivent être des actions concrètes et actionnables extraites de la description.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant expert en productivité. Tu génères des titres et descriptions de tâches clairs et actionnables. CRITIQUE : Le titre doit être FIDÈLE à la description originale, conserver TOUS les éléments importants dans l'ordre, et utiliser les mêmes termes clés (noms propres, événements, etc.). Ne résume pas trop, garde les détails importants.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return {
      title: response.title || "",
      description: response.description || "",
      subtasks: (response.subtasks || []).map((subtask) => ({
        title: typeof subtask === 'string' ? subtask : subtask.title || subtask,
        duration: typeof subtask === 'object' && subtask.duration ? subtask.duration : 0,
        completed: false,
      })),
    };
  } catch (error) {
    console.error("[OpenAI] Error:", error);
    throw new Error("Erreur lors de l'amélioration avec l'IA");
  }
};

/**
 * Améliore une description d'objectif et génère un titre optimisé avec les métadonnées
 */
export const improveGoalDescription = async (description) => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const prompt = `Tu es un assistant expert en gestion d'objectifs stratégiques et business. 
À partir de la description suivante d'un objectif, génère :
1. Un titre d'objectif court, clair et actionnable (maximum 100 caractères) qui reste FIDÈLE à la description originale
2. Une description améliorée, structurée et détaillée (3-5 phrases)
3. Un horizon temporel approprié : "short_term" (0-30 jours), "medium_term" (1-6 mois), ou "long_term" (6-36 mois)
4. Un niveau d'importance de 1 à 10
5. Un impact business estimé en euros (0 si non applicable)
6. Une deadline suggérée si mentionnée dans la description (format YYYY-MM-DD, null sinon)
7. Des suggestions de tâches liées sous forme de titres de tâches (maximum 5 suggestions)

Description fournie : "${description}"

IMPORTANT pour le titre :
- Conserve TOUS les éléments importants de la description originale
- Garde l'ordre logique des informations
- Utilise les mêmes termes clés (noms propres, entreprises, montants, etc.)
- Sois concis mais complet

Pour l'horizon :
- short_term : objectifs à réaliser dans les 30 prochains jours
- medium_term : objectifs à réaliser entre 1 et 6 mois
- long_term : objectifs à réaliser entre 6 et 36 mois

Pour l'importance :
- 1-3 : Faible importance
- 4-6 : Importance moyenne
- 7-8 : Haute importance
- 9-10 : Importance critique

Pour l'impact business :
- Estime le montant en euros que cet objectif pourrait générer ou économiser
- 0 si non applicable ou non quantifiable

Réponds UNIQUEMENT au format JSON suivant, sans texte supplémentaire :
{
  "title": "Titre de l'objectif fidèle à la description",
  "description": "Description améliorée et structurée",
  "horizon": "short_term" | "medium_term" | "long_term",
  "importance": 5,
  "businessImpact": 0,
  "deadline": "2024-12-31" | null,
  "suggestedTasks": [
    "Titre de tâche suggérée 1",
    "Titre de tâche suggérée 2"
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant expert en gestion d'objectifs stratégiques. Tu génères des titres et descriptions d'objectifs clairs et actionnables. CRITIQUE : Le titre doit être FIDÈLE à la description originale, conserver TOUS les éléments importants dans l'ordre, et utiliser les mêmes termes clés (noms propres, entreprises, montants, etc.). Ne résume pas trop, garde les détails importants.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return {
      title: response.title || "",
      description: response.description || "",
      horizon: response.horizon || "medium_term",
      importance: parseInt(response.importance) || 5,
      businessImpact: parseFloat(response.businessImpact) || 0,
      deadline: response.deadline || null,
      suggestedTasks: response.suggestedTasks || [],
    };
  } catch (error) {
    console.error("[OpenAI] Error:", error);
    throw new Error("Erreur lors de l'amélioration avec l'IA");
  }
};

