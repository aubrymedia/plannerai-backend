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
        title: subtask,
        completed: false,
      })),
    };
  } catch (error) {
    console.error("[OpenAI] Error:", error);
    throw new Error("Erreur lors de l'amélioration avec l'IA");
  }
};

