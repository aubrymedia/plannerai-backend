import { getCalendarEvents, createCalendarEvent } from "./googleCalendar.service.js";
import { getFreeSlots } from "./googleCalendar.service.js";

/**
 * Arrondit une date à l'heure ronde la plus proche (00, 15, 30, 45 minutes)
 */
const roundToQuarterHour = (date) => {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  rounded.setMinutes(roundedMinutes, 0, 0);
  return rounded;
};

/**
 * Arrondit une date à l'heure ronde supérieure (00, 15, 30, 45 minutes)
 */
const roundUpToQuarterHour = (date) => {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const remainder = minutes % 15;
  if (remainder === 0) {
    rounded.setSeconds(0, 0);
    return rounded;
  }
  const roundedMinutes = minutes + (15 - remainder);
  rounded.setMinutes(roundedMinutes, 0, 0);
  return rounded;
};

/**
 * Trouve le meilleur créneau libre pour une tâche
 */
export const findBestSlotForTask = async (user, task, preferredDate = null) => {
  try {
    // Déterminer la période de recherche
    const now = new Date();
    
    // Si la tâche a une deadline, l'utiliser pour limiter la recherche
    const deadline = task.deadline ? new Date(task.deadline) : null;
    
    // Si deadline existe et est dans le passé (plus d'un jour), ne pas planifier
    // Mais si c'est le même jour, on peut quand même planifier
    if (deadline) {
      const deadlineDate = new Date(deadline);
      deadlineDate.setHours(0, 0, 0, 0);
      const nowDate = new Date(now);
      nowDate.setHours(0, 0, 0, 0);
      const daysDiff = (deadlineDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff < 0) {
        // Deadline est dans le passé (hier ou avant)
        console.log("[Task Scheduler] ERREUR: Deadline dans le passé:", deadline.toISOString());
        return {
          success: false,
          reason: `La deadline de cette tâche (${deadline.toLocaleDateString("fr-FR")}) est dans le passé. Impossible de planifier.`,
        };
      }
    }
    
    // Date de début de recherche
    let searchStart;
    if (preferredDate) {
      searchStart = roundUpToQuarterHour(new Date(preferredDate));
    } else {
      // Commencer dès maintenant (ou dans 30 minutes pour laisser le temps), arrondi au quart d'heure supérieur
      searchStart = roundUpToQuarterHour(new Date(now.getTime() + 30 * 60 * 1000));
    }
    
    // Date de fin de recherche
    let searchEnd;
    if (deadline) {
      // Si deadline est aujourd'hui, chercher jusqu'à la fin de la journée de la deadline
      const deadlineEndOfDay = new Date(deadline);
      deadlineEndOfDay.setHours(23, 59, 59, 999);
      searchEnd = deadlineEndOfDay;
      
      // Mais ne pas chercher plus de 30 jours dans le futur
      const maxSearchEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      searchEnd = new Date(Math.min(searchEnd.getTime(), maxSearchEnd.getTime()));
    } else {
      // Pas de deadline, chercher dans les 14 prochains jours
      searchEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    }
    
    // S'assurer que searchStart < searchEnd
    if (searchStart >= searchEnd) {
      console.log("[Task Scheduler] ERREUR: Période de recherche invalide");
      console.log("[Task Scheduler] searchStart:", searchStart.toISOString());
      console.log("[Task Scheduler] searchEnd:", searchEnd.toISOString());
      return {
        success: false,
        reason: `Impossible de planifier cette tâche. La période de recherche est invalide (deadline: ${deadline ? deadline.toLocaleDateString("fr-FR") : "aucune"}).`,
      };
    }

    console.log("[Task Scheduler] Recherche de créneau pour:", {
      taskTitle: task.title,
      taskDuration: task.duration,
      searchStart: searchStart.toISOString(),
      searchEnd: searchEnd.toISOString(),
      deadline: deadline ? deadline.toISOString() : null,
      now: now.toISOString(),
      periodDurationDays: (searchEnd - searchStart) / (1000 * 60 * 60 * 24),
    });

    // Récupérer les événements existants pour trouver les fins d'événements
    const existingEvents = await getCalendarEvents(user, searchStart, searchEnd);
    
    // Extraire les fins d'événements (prioriser les créneaux qui commencent juste après)
    const eventEnds = existingEvents
      .map((event) => {
        const end = new Date(event.end.dateTime || event.end.date);
        const minutes = end.getMinutes();
        const seconds = end.getSeconds();
        // Si l'heure de fin est déjà ronde (00, 15, 30, 45), ne pas décaler
        if (minutes % 15 === 0 && seconds === 0) {
          return end;
        }
        // Sinon, arrondir au quart d'heure supérieur
        return roundUpToQuarterHour(end);
      })
      .filter((end) => end >= searchStart && end <= searchEnd)
      .sort((a, b) => a.getTime() - b.getTime());

    if (eventEnds.length > 0) {
      console.log("[Task Scheduler] Première fin d'événement pour enchaînement:", eventEnds[0].toISOString());
    }

    // Récupérer les créneaux libres
    const freeSlots = await getFreeSlots(user, searchStart, searchEnd, {});
    
    console.log("[Task Scheduler] Créneaux libres trouvés:", freeSlots.length);
    console.log("[Task Scheduler] Fins d'événements trouvées:", eventEnds.length);

    // Filtrer les créneaux qui ont la durée nécessaire
    const taskDuration = task.duration || 60; // Durée en minutes
    const requiredDuration = taskDuration * 60 * 1000; // En millisecondes

    console.log("[Task Scheduler] Durée requise:", taskDuration, "minutes =", requiredDuration / 1000 / 60, "minutes");

    // Trier les créneaux par date de début
    freeSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    if (freeSlots.length > 0) {
      console.log("[Task Scheduler] Premier créneau libre:", {
        start: freeSlots[0].start.toISOString(),
        end: freeSlots[0].end.toISOString(),
        duration: (freeSlots[0].end - freeSlots[0].start) / 1000 / 60,
      });
    }

    // Trouver des créneaux consécutifs qui peuvent être combinés
    const suitableSlots = [];
    
    // Fonction pour créer un créneau arrondi
    const createRoundedSlot = (start, end, priority = 0) => {
      // Arrondir au quart d'heure le plus proche (00, 15, 30, 45)
      const roundedStart = roundToQuarterHour(start);
      const roundedEnd = new Date(roundedStart.getTime() + requiredDuration);
      
      // Vérifier que le créneau arrondi est toujours dans le créneau libre
      // On accepte si le créneau arrondi commence après ou à l'heure de début et se termine avant ou à l'heure de fin
      if (roundedStart >= start && roundedEnd <= end) {
        return {
          start: roundedStart,
          end: roundedEnd,
          priority: priority, // Priorité plus élevée = meilleur
          combined: false,
        };
      }
      // Si l'arrondi ne fonctionne pas, essayer d'arrondir vers le haut
      const roundedUpStart = roundUpToQuarterHour(start);
      const roundedUpEnd = new Date(roundedUpStart.getTime() + requiredDuration);
      if (roundedUpStart >= start && roundedUpEnd <= end) {
        return {
          start: roundedUpStart,
          end: roundedUpEnd,
          priority: priority,
          combined: false,
        };
      }
      return null;
    };
    
    for (let i = 0; i < freeSlots.length; i++) {
      const startSlot = freeSlots[i];
      let currentEnd = startSlot.end;
      let combinedSlots = [startSlot];
      
      // Essayer de combiner avec les créneaux suivants
      for (let j = i + 1; j < freeSlots.length; j++) {
        const nextSlot = freeSlots[j];
        
        // Si le créneau suivant commence juste après le précédent (avec une tolérance de 5 min)
        if (nextSlot.start.getTime() <= currentEnd.getTime() + 5 * 60 * 1000) {
          combinedSlots.push(nextSlot);
          currentEnd = nextSlot.end;
          
          // Si on a assez de temps, on peut utiliser ce créneau combiné
          if (currentEnd.getTime() - startSlot.start.getTime() >= requiredDuration) {
            const roundedSlot = createRoundedSlot(startSlot.start, currentEnd, 1);
            if (roundedSlot) {
              suitableSlots.push(roundedSlot);
            }
            break;
          }
        } else {
          // Si le créneau suivant n'est pas consécutif, on arrête
          break;
        }
      }
      
      // Vérifier aussi les créneaux individuels qui sont assez longs
      const slotDuration = startSlot.end.getTime() - startSlot.start.getTime();
      if (slotDuration >= requiredDuration) {
        const roundedSlot = createRoundedSlot(startSlot.start, startSlot.end, 1);
        if (roundedSlot) {
          suitableSlots.push(roundedSlot);
        }
      }
    }
    
    // Ajouter des créneaux qui commencent juste après les fins d'événements
    for (const eventEnd of eventEnds) {
      // Commencer juste après l'événement (sans arrondir pour éviter les trous)
      // Si l'événement se termine à 15h30, on commence à 15h30, pas à 15h45
      let slotStart = eventEnd;
      
      // Si l'heure de fin n'est pas ronde (00, 15, 30, 45), arrondir au quart d'heure suivant
      const minutes = slotStart.getMinutes();
      const seconds = slotStart.getSeconds();
      if (minutes % 15 !== 0 || seconds !== 0) {
        // Arrondir au quart d'heure suivant
        slotStart = roundUpToQuarterHour(eventEnd);
      } else {
        // L'heure est déjà ronde, utiliser telle quelle
        slotStart = new Date(eventEnd);
      }
      
      const slotEnd = new Date(slotStart.getTime() + requiredDuration);
      
      // Vérifier que ce créneau est dans un créneau libre
      const isInFreeSlot = freeSlots.some((freeSlot) => {
        return slotStart >= freeSlot.start && slotEnd <= freeSlot.end;
      });
      
      if (isInFreeSlot && slotEnd <= searchEnd) {
        suitableSlots.push({
          start: slotStart,
          end: slotEnd,
          priority: 10, // Priorité très élevée pour les créneaux qui suivent un événement
          combined: false,
        });
      }
    }

    // Supprimer les doublons (créneaux qui se chevauchent)
    const uniqueSlots = [];
    suitableSlots.forEach((slot) => {
      const isDuplicate = uniqueSlots.some((existing) => {
        const timeDiff = Math.abs(existing.start.getTime() - slot.start.getTime());
        return timeDiff < 15 * 60 * 1000; // Moins de 15 min de différence
      });
      if (!isDuplicate) {
        uniqueSlots.push(slot);
      }
    });

    console.log("[Task Scheduler] Créneaux uniques trouvés après combinaison:", uniqueSlots.length);
    
    if (uniqueSlots.length > 0) {
      console.log("[Task Scheduler] Meilleur créneau:", {
        start: uniqueSlots[0].start.toISOString(),
        end: uniqueSlots[0].end.toISOString(),
        combined: uniqueSlots[0].combined,
      });
    }

    if (uniqueSlots.length === 0) {
      console.log("[Task Scheduler] ERREUR: Aucun créneau trouvé. Détails:", {
        freeSlotsCount: freeSlots.length,
        requiredDurationMinutes: taskDuration,
        requiredDurationMs: requiredDuration,
        searchPeriod: {
          start: searchStart.toISOString(),
          end: searchEnd.toISOString(),
          durationDays: Math.ceil((searchEnd - searchStart) / (1000 * 60 * 60 * 24)),
        },
        firstFreeSlot: freeSlots.length > 0 ? {
          start: freeSlots[0].start.toISOString(),
          end: freeSlots[0].end.toISOString(),
          duration: (freeSlots[0].end - freeSlots[0].start) / 1000 / 60,
        } : null,
      });
      
      // Message d'erreur plus détaillé
      let reason = `Aucun créneau libre disponible pour une durée de ${taskDuration} minutes dans les 14 prochains jours.`;
      
      if (freeSlots.length === 0) {
        reason += "\n\nVotre calendrier semble complètement occupé sur cette période.";
      } else {
        const maxSlotDuration = Math.max(...freeSlots.map(s => (s.end - s.start) / 1000 / 60));
        reason += `\n\nLes créneaux libres trouvés sont de ${Math.round(maxSlotDuration)} minutes maximum, ce qui est insuffisant pour cette tâche de ${taskDuration} minutes.`;
      }
      
      reason += "\n\n💡 Suggestions :\n- Réduisez la durée de la tâche\n- Sélectionnez des calendriers dans les Paramètres pour mieux filtrer les événements\n- Planifiez manuellement dans Google Calendar";
      
      return {
        success: false,
        reason: reason,
      };
    }

    // Prioriser les créneaux :
    // 1. Priorité (créneaux qui suivent un événement = priorité 10)
    // 2. Heures rondes (00, 15, 30, 45)
    // 3. Le plus proche de la date préférée (si fournie)
    // 4. Le plus proche de maintenant
    // 5. Le plus proche de la deadline (si existe)
    uniqueSlots.sort((a, b) => {
      // Priorité (plus élevée = meilleur)
      const aPriority = a.priority || 0;
      const bPriority = b.priority || 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      
      // Vérifier si l'heure est ronde (00, 15, 30, 45)
      const aMinutes = a.start.getMinutes();
      const bMinutes = b.start.getMinutes();
      const aIsRound = aMinutes === 0 || aMinutes === 15 || aMinutes === 30 || aMinutes === 45;
      const bIsRound = bMinutes === 0 || bMinutes === 15 || bMinutes === 30 || bMinutes === 45;
      
      if (aIsRound && !bIsRound) return -1;
      if (!aIsRound && bIsRound) return 1;
      
      const aStart = a.start.getTime();
      const bStart = b.start.getTime();
      const nowTime = now.getTime();
      const preferredTime = preferredDate ? new Date(preferredDate).getTime() : null;
      const deadlineTime = deadline ? deadline.getTime() : null;

      // Si on a une date préférée, prioriser les créneaux proches
      if (preferredTime) {
        const aDiff = Math.abs(aStart - preferredTime);
        const bDiff = Math.abs(bStart - preferredTime);
        if (aDiff !== bDiff) return aDiff - bDiff;
      }

      // Sinon, prioriser les créneaux proches de maintenant
      const aDiffFromNow = Math.abs(aStart - nowTime);
      const bDiffFromNow = Math.abs(bStart - nowTime);
      if (aDiffFromNow !== bDiffFromNow) return aDiffFromNow - bDiffFromNow;

      // Si deadline existe, prioriser les créneaux proches de la deadline
      if (deadlineTime) {
        const aDiffFromDeadline = Math.abs(aStart - deadlineTime);
        const bDiffFromDeadline = Math.abs(bStart - deadlineTime);
        return aDiffFromDeadline - bDiffFromDeadline;
      }

      return aStart - bStart;
    });

    const bestSlot = uniqueSlots[0];

    // Arrondir l'heure de début au quart d'heure le plus proche (00, 15, 30, 45)
    const roundedStart = roundToQuarterHour(bestSlot.start);
    
    // Calculer la durée du créneau
    const duration = bestSlot.end.getTime() - bestSlot.start.getTime();
    
    // Ajuster l'heure de fin en fonction de l'heure de début arrondie
    const roundedEnd = new Date(roundedStart.getTime() + duration);
    
    // Vérifier que le créneau arrondi ne dépasse pas le créneau libre disponible
    if (roundedEnd.getTime() > bestSlot.end.getTime()) {
      // Si l'arrondi fait dépasser, utiliser l'heure de début originale mais arrondir quand même
      const adjustedStart = roundToQuarterHour(bestSlot.start);
      const adjustedEnd = new Date(adjustedStart.getTime() + duration);
      if (adjustedEnd.getTime() <= bestSlot.end.getTime()) {
        return {
          success: true,
          slot: {
            start: adjustedStart,
            end: adjustedEnd,
          },
          alternatives: uniqueSlots.slice(1, 4).map((slot) => ({
            start: roundToQuarterHour(slot.start),
            end: new Date(roundToQuarterHour(slot.start).getTime() + (slot.end.getTime() - slot.start.getTime())),
          })),
        };
      }
    }

    return {
      success: true,
      slot: {
        start: roundedStart,
        end: roundedEnd,
      },
      alternatives: uniqueSlots.slice(1, 4).map((slot) => ({
        start: roundToQuarterHour(slot.start),
        end: new Date(roundToQuarterHour(slot.start).getTime() + (slot.end.getTime() - slot.start.getTime())),
      })),
    };
  } catch (error) {
    console.error("[Task Scheduler] Error finding slot:", error);
    return {
      success: false,
      reason: "Erreur lors de la recherche de créneau : " + error.message,
    };
  }
};

/**
 * Calcule le temps restant nécessaire pour une tâche
 */
export const calculateRemainingTime = (task) => {
  const totalDuration = task.duration || 0; // Durée totale en minutes
  const timeSpent = task.timeSpent || 0; // Temps déjà passé en minutes
  
  // Calculer le temps déjà planifié dans les créneaux complétés
  const completedSlotsTime = (task.scheduledSlots || [])
    .filter(slot => slot.completed)
    .reduce((total, slot) => {
      const slotDuration = (new Date(slot.end) - new Date(slot.start)) / (1000 * 60);
      return total + (slot.timeSpent || slotDuration);
    }, 0);
  
  // Le temps restant est la durée totale moins le temps déjà passé/planifié
  const remainingTime = Math.max(0, totalDuration - Math.max(timeSpent, completedSlotsTime));
  
  return remainingTime;
};

/**
 * Planifie une tâche dans Google Calendar (première planification ou replanification)
 * Peut splitter la tâche en plusieurs événements si nécessaire
 */
export const scheduleTask = async (user, task, preferredDate = null, remainingDuration = null, allowSplitting = true) => {
  console.log("[SCHEDULE TASK] Fonction appelée avec:", {
    taskTitle: task.title,
    taskDuration: task.duration,
    timeSpent: task.timeSpent || 0,
    scheduledSlots: task.scheduledSlots?.length || 0,
    preferredDate: preferredDate,
    remainingDuration: remainingDuration,
    allowSplitting: allowSplitting,
  });
  
  try {
    // Calculer la durée à planifier
    let durationToSchedule = remainingDuration;
    if (durationToSchedule === null) {
      // Si pas de durée spécifiée, calculer le temps restant
      durationToSchedule = calculateRemainingTime(task);
      
      // Si la tâche est déjà complètement planifiée et non complétée, on replanifie
      if (durationToSchedule === 0 && task.scheduledSlots?.length > 0) {
        // Vérifier si tous les créneaux sont complétés
        const allCompleted = task.scheduledSlots.every(slot => slot.completed);
        if (!allCompleted) {
          // Il reste des créneaux non complétés, on ne replanifie pas
          return {
            success: false,
            reason: "Cette tâche a déjà des créneaux planifiés non complétés.",
          };
        }
        // Tous les créneaux sont complétés mais la tâche n'est pas terminée, on replanifie
        durationToSchedule = task.duration - (task.timeSpent || 0);
      }
      
      // Si pas de temps restant, ne pas planifier
      if (durationToSchedule <= 0) {
        return {
          success: false,
          reason: "Cette tâche est déjà complétée ou n'a pas de temps restant à planifier.",
        };
      }
    }

    // Créer une tâche temporaire avec la durée à planifier pour trouver le créneau
    const tempTask = {
      ...task.toObject ? task.toObject() : task,
      duration: durationToSchedule,
    };

    // Essayer de trouver un créneau unique d'abord
    console.log("[SCHEDULE TASK] Recherche du meilleur créneau pour", durationToSchedule, "minutes...");
    const slotResult = await findBestSlotForTask(user, tempTask, preferredDate);
    
    if (slotResult.success) {
      console.log("[SCHEDULE TASK] Créneau unique trouvé, création de l'événement...");
      // Créer l'événement dans Google Calendar
      const event = await createCalendarEvent(user, {
        title: `${task.title}${task.scheduledSlots?.length > 0 ? ` (suite)` : ""}`,
        description: task.description || "",
        start: slotResult.slot.start,
        end: slotResult.slot.end,
      });

      console.log("[SCHEDULE TASK] SUCCÈS: Événement créé avec ID:", event.id);
      return {
        success: true,
        event,
        slot: {
          start: slotResult.slot.start,
          end: slotResult.slot.end,
        },
        alternatives: slotResult.alternatives,
        durationScheduled: durationToSchedule,
        slots: [{ event, slot: { start: slotResult.slot.start, end: slotResult.slot.end } }],
      };
    }

    // Si aucun créneau unique n'est trouvé et que le split est autorisé, essayer de splitter
    if (allowSplitting && durationToSchedule > 60) { // Seulement si la tâche fait plus d'1h
      console.log("[SCHEDULE TASK] Aucun créneau unique trouvé, tentative de split...");
      return await scheduleTaskSplit(user, task, durationToSchedule, preferredDate);
    }

    console.log("[SCHEDULE TASK] ÉCHEC: Impossible de trouver un créneau");
    return slotResult;
  } catch (error) {
    console.error("[SCHEDULE TASK] ERREUR:", error);
    console.error("[SCHEDULE TASK] Stack:", error.stack);
    return {
      success: false,
      reason: "Erreur lors de la planification : " + error.message,
    };
  }
};

/**
 * Planifie une tâche en la splittant en plusieurs événements
 * Utilise les durées des sous-tâches si disponibles pour un split plus logique
 */
const scheduleTaskSplit = async (user, task, totalDuration, preferredDate = null) => {
  console.log("[SCHEDULE TASK SPLIT] Tentative de split pour", totalDuration, "minutes");
  
  const now = new Date();
  const deadline = task.deadline ? new Date(task.deadline) : null;
  
  // Déterminer la période de recherche
    let searchStart = preferredDate ? roundUpToQuarterHour(new Date(preferredDate)) : roundUpToQuarterHour(new Date(now.getTime() + 30 * 60 * 1000));
  let searchEnd;
  if (deadline) {
    const deadlineEndOfDay = new Date(deadline);
    deadlineEndOfDay.setHours(23, 59, 59, 999);
    searchEnd = deadlineEndOfDay;
    const maxSearchEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    searchEnd = new Date(Math.min(searchEnd.getTime(), maxSearchEnd.getTime()));
  } else {
    searchEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  }

  // Récupérer les créneaux libres
  const freeSlots = await getFreeSlots(user, searchStart, searchEnd, {});
  freeSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

  // D'ABORD essayer les stratégies classiques de split (qui privilégient les gros blocs)
  // Stratégies de split : essayer différentes tailles de blocs
  // On commence par essayer de garder la tâche en un seul bloc si possible
  const splitStrategies = [
    { minBlockSize: totalDuration, maxBlocks: 1 }, // D'abord essayer de garder la tâche complète en un seul bloc
    { minBlockSize: Math.max(120, Math.floor(totalDuration / 2)), maxBlocks: 5 }, // Blocs de 2h minimum, max 5 blocs
    { minBlockSize: Math.max(60, Math.floor(totalDuration / 3)), maxBlocks: 5 }, // Blocs de 1h minimum, max 5 blocs
    { minBlockSize: Math.max(30, Math.floor(totalDuration / 5)), maxBlocks: 10 }, // Blocs de 30min minimum, max 10 blocs
  ];

  for (const strategy of splitStrategies) {
    console.log("[SCHEDULE TASK SPLIT] Essai stratégie:", strategy);
    const slots = [];
    let remainingDuration = totalDuration;
    let lastSlotEnd = null;

    for (const freeSlot of freeSlots) {
      if (remainingDuration <= 0) break;
      if (slots.length >= strategy.maxBlocks) break;

      // Si on a déjà un créneau, s'assurer qu'on ne planifie pas trop loin dans le futur
      if (lastSlotEnd && freeSlot.start.getTime() - lastSlotEnd.getTime() > 7 * 24 * 60 * 60 * 1000) {
        // Plus de 7 jours entre les créneaux, arrêter
        break;
      }

      const slotDuration = (freeSlot.end.getTime() - freeSlot.start.getTime()) / (1000 * 60); // en minutes
      const blockSize = Math.min(slotDuration, remainingDuration, Math.max(strategy.minBlockSize, Math.floor(remainingDuration / (strategy.maxBlocks - slots.length))));

      if (blockSize >= strategy.minBlockSize) {
        // Pour le premier bloc, commencer au début du créneau libre (ou juste après un événement)
        // Pour les blocs suivants, commencer juste après le bloc précédent
        let blockStart;
        if (slots.length === 0) {
          // Premier bloc : commencer au début du créneau libre
          blockStart = freeSlot.start;
          // Si l'heure n'est pas ronde, arrondir au quart d'heure le plus proche
          const minutes = blockStart.getMinutes();
          const seconds = blockStart.getSeconds();
          if (minutes % 15 !== 0 || seconds !== 0) {
            blockStart = roundToQuarterHour(freeSlot.start);
          }
        } else {
          // Bloc suivant : commencer juste après le bloc précédent
          blockStart = lastSlotEnd;
          // Si l'heure n'est pas ronde, arrondir au quart d'heure suivant
          const minutes = blockStart.getMinutes();
          const seconds = blockStart.getSeconds();
          if (minutes % 15 !== 0 || seconds !== 0) {
            blockStart = roundUpToQuarterHour(lastSlotEnd);
          }
        }
        
        const blockEnd = new Date(blockStart.getTime() + blockSize * 60 * 1000);
        
        // Vérifier que le créneau tient dans le slot libre
        if (blockEnd.getTime() <= freeSlot.end.getTime()) {
          slots.push({
            start: blockStart,
            end: blockEnd,
            duration: blockSize,
          });
          remainingDuration -= blockSize;
          lastSlotEnd = blockEnd;
        } else {
          // Si le créneau ne tient pas, essayer de l'ajuster
          const adjustedEnd = freeSlot.end;
          const adjustedStart = new Date(adjustedEnd.getTime() - blockSize * 60 * 1000);
          if (adjustedStart >= freeSlot.start) {
            const roundedAdjustedStart = roundToQuarterHour(adjustedStart);
            if (roundedAdjustedStart >= freeSlot.start) {
              slots.push({
                start: roundedAdjustedStart,
                end: adjustedEnd,
                duration: blockSize,
              });
              remainingDuration -= blockSize;
              lastSlotEnd = adjustedEnd;
            }
          }
        }

        remainingDuration -= blockSize;
        lastSlotEnd = blockEnd;
      }
    }

    if (remainingDuration <= 0 && slots.length > 0) {
      console.log("[SCHEDULE TASK SPLIT] SUCCÈS: Tâche splittée en", slots.length, "blocs");
      
      // Créer les événements
      const createdSlots = [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        // S'assurer que les heures sont arrondies
        const roundedStart = roundToQuarterHour(slot.start);
        const duration = slot.end.getTime() - slot.start.getTime();
        const roundedEnd = new Date(roundedStart.getTime() + duration);
        
        const event = await createCalendarEvent(user, {
          title: `${task.title}${i > 0 ? ` (${i + 1}/${slots.length})` : ""}`,
          description: task.description || "",
          start: roundedStart,
          end: roundedEnd,
        });

        createdSlots.push({
          event,
          slot: {
            start: roundedStart,
            end: roundedEnd,
          },
        });
      }

      return {
        success: true,
        event: createdSlots[0].event, // Pour compatibilité
        slot: createdSlots[0].slot, // Pour compatibilité
        slots: createdSlots,
        durationScheduled: totalDuration,
        split: true,
      };
    }
  }

  // AVANT de splitter par sous-tâches, vérifier une dernière fois si un créneau unique est disponible
  // Cela peut arriver si findBestSlotForTask a échoué mais qu'un créneau est disponible dans freeSlots
  // Il faut vérifier les créneaux individuels ET les créneaux consécutifs qui peuvent être combinés
  const totalDurationMinutes = totalDuration;
  
  // D'abord, vérifier les créneaux individuels assez longs
  for (const freeSlot of freeSlots) {
    const slotDuration = (freeSlot.end.getTime() - freeSlot.start.getTime()) / (1000 * 60); // en minutes
    if (slotDuration >= totalDurationMinutes) {
      // Un créneau unique est disponible, l'utiliser
      console.log("[SCHEDULE TASK SPLIT] Créneau unique trouvé dans freeSlots, création d'un seul événement");
      
      // Commencer juste après l'événement précédent si possible, sinon arrondir
      let slotStart = freeSlot.start;
      const minutes = slotStart.getMinutes();
      const seconds = slotStart.getSeconds();
      if (minutes % 15 !== 0 || seconds !== 0) {
        slotStart = roundToQuarterHour(freeSlot.start);
      }
      
      const slotEnd = new Date(slotStart.getTime() + totalDurationMinutes * 60 * 1000);
      
      if (slotEnd.getTime() <= freeSlot.end.getTime()) {
        const event = await createCalendarEvent(user, {
          title: task.title,
          description: task.description || "",
          start: slotStart,
          end: slotEnd,
        });

        return {
          success: true,
          event: event,
          slot: {
            start: slotStart,
            end: slotEnd,
          },
          slots: [{
            event,
            slot: {
              start: slotStart,
              end: slotEnd,
            },
          }],
          durationScheduled: totalDurationMinutes,
          split: false,
        };
      }
    }
  }
  
  // Ensuite, vérifier si on peut combiner des créneaux consécutifs
  for (let i = 0; i < freeSlots.length; i++) {
    const startSlot = freeSlots[i];
    let combinedStart = startSlot.start;
    let combinedEnd = startSlot.end;
    let combinedDuration = (combinedEnd.getTime() - combinedStart.getTime()) / (1000 * 60); // en minutes
    
    // Essayer de combiner avec les créneaux suivants
    for (let j = i + 1; j < freeSlots.length; j++) {
      const nextSlot = freeSlots[j];
      
      // Si le créneau suivant commence juste après le précédent (tolérance de 5 min)
      if (nextSlot.start.getTime() <= combinedEnd.getTime() + 5 * 60 * 1000) {
        combinedEnd = nextSlot.end;
        combinedDuration = (combinedEnd.getTime() - combinedStart.getTime()) / (1000 * 60);
        
        // Si on a assez de temps, utiliser ce créneau combiné
        if (combinedDuration >= totalDurationMinutes) {
          console.log("[SCHEDULE TASK SPLIT] Créneau unique trouvé en combinant", j - i + 1, "créneaux consécutifs, création d'un seul événement");
          
          // Commencer juste après l'événement précédent si possible, sinon arrondir
          let slotStart = combinedStart;
          const minutes = slotStart.getMinutes();
          const seconds = slotStart.getSeconds();
          if (minutes % 15 !== 0 || seconds !== 0) {
            slotStart = roundToQuarterHour(combinedStart);
          }
          
          const slotEnd = new Date(slotStart.getTime() + totalDurationMinutes * 60 * 1000);
          
          if (slotEnd.getTime() <= combinedEnd.getTime()) {
            const event = await createCalendarEvent(user, {
              title: task.title,
              description: task.description || "",
              start: slotStart,
              end: slotEnd,
            });

            return {
              success: true,
              event: event,
              slot: {
                start: slotStart,
                end: slotEnd,
              },
              slots: [{
                event,
                slot: {
                  start: slotStart,
                  end: slotEnd,
                },
              }],
              durationScheduled: totalDurationMinutes,
              split: false,
            };
          }
        }
      } else {
        // Si le créneau suivant n'est pas consécutif, arrêter
        break;
      }
    }
  }

  // Si les stratégies classiques ont échoué, essayer le split par sous-tâches en dernier recours
  const subtasksWithDuration = (task.subtasks || []).filter(st => st.duration && st.duration > 0);
  if (subtasksWithDuration.length > 0) {
    console.log("[SCHEDULE TASK SPLIT] Stratégies classiques échouées, tentative de split par sous-tâches:", subtasksWithDuration.length, "sous-tâches");
    const result = await scheduleTaskSplitBySubtasks(user, task, subtasksWithDuration, freeSlots, preferredDate);
    if (result.success) {
      return result;
    }
    console.log("[SCHEDULE TASK SPLIT] Split par sous-tâches également échoué");
  }

  console.log("[SCHEDULE TASK SPLIT] ÉCHEC: Impossible de splitter la tâche");
  return {
    success: false,
    reason: `Impossible de planifier cette tâche de ${totalDuration} minutes. Aucun créneau suffisant trouvé, même en la découpant en plusieurs blocs.`,
  };
};

/**
 * Planifie une tâche en utilisant les durées des sous-tâches pour créer des événements logiques
 */
const scheduleTaskSplitBySubtasks = async (user, task, subtasksWithDuration, freeSlots, preferredDate = null) => {
  console.log("[SCHEDULE TASK SPLIT BY SUBTASKS] Planification basée sur", subtasksWithDuration.length, "sous-tâches");
  
  // D'ABORD : Vérifier si toutes les sous-tâches peuvent tenir dans un seul créneau
  const totalTaskDuration = subtasksWithDuration.reduce((sum, st) => sum + (st.duration || 0), 0);
  
  for (const freeSlot of freeSlots) {
    const slotDuration = (freeSlot.end.getTime() - freeSlot.start.getTime()) / (1000 * 60); // en minutes
    
    if (slotDuration >= totalTaskDuration) {
      // Toutes les sous-tâches tiennent dans ce créneau, créer un seul événement
      // Commencer juste après l'événement précédent si possible, sinon arrondir
      let slotStart = freeSlot.start;
      const minutes = slotStart.getMinutes();
      const seconds = slotStart.getSeconds();
      if (minutes % 15 !== 0 || seconds !== 0) {
        slotStart = roundToQuarterHour(freeSlot.start);
      }
      
      const blockEnd = new Date(slotStart.getTime() + totalTaskDuration * 60 * 1000);
      
      if (blockEnd.getTime() <= freeSlot.end.getTime()) {
        console.log("[SCHEDULE TASK SPLIT BY SUBTASKS] Toutes les sous-tâches tiennent dans un seul créneau, création d'un seul événement");
        
        const event = await createCalendarEvent(user, {
          title: task.title,
          description: task.description || "",
          start: slotStart,
          end: blockEnd,
        });

        return {
          success: true,
          event: event,
          slot: {
            start: slotStart,
            end: blockEnd,
          },
          slots: [{
            event,
            slot: {
              start: slotStart,
              end: blockEnd,
            },
            subtasks: subtasksWithDuration,
          }],
          durationScheduled: totalTaskDuration,
          split: true,
          splitBySubtasks: true,
        };
      }
    }
  }
  
  // Si toutes les sous-tâches ne tiennent pas dans un seul créneau, les séparer
  const slots = [];
  let subtaskIndex = 0;
  let lastSlotEnd = null;
  const maxDaysBetweenSlots = 7; // Maximum 7 jours entre les créneaux

  for (const freeSlot of freeSlots) {
    if (subtaskIndex >= subtasksWithDuration.length) break;

    // Si on a déjà un créneau, s'assurer qu'on ne planifie pas trop loin dans le futur
    if (lastSlotEnd && freeSlot.start.getTime() - lastSlotEnd.getTime() > maxDaysBetweenSlots * 24 * 60 * 60 * 1000) {
      break;
    }

    const slotDuration = (freeSlot.end.getTime() - freeSlot.start.getTime()) / (1000 * 60); // en minutes
    
    // Essayer de regrouper plusieurs sous-tâches dans ce créneau
    const groupedSubtasks = [];
    let totalGroupDuration = 0;
    let currentSubtaskIndex = subtaskIndex;

    while (currentSubtaskIndex < subtasksWithDuration.length) {
      const subtask = subtasksWithDuration[currentSubtaskIndex];
      const subtaskDuration = subtask.duration || 0;
      
      if (totalGroupDuration + subtaskDuration <= slotDuration) {
        groupedSubtasks.push({
          subtask,
          index: currentSubtaskIndex,
        });
        totalGroupDuration += subtaskDuration;
        currentSubtaskIndex++;
      } else {
        break;
      }
    }

    // Si on a trouvé au moins une sous-tâche qui tient dans ce créneau
    if (groupedSubtasks.length > 0 && totalGroupDuration > 0) {
      // Commencer juste après l'événement précédent si possible, sinon arrondir
      let blockStart;
      if (lastSlotEnd) {
        // Bloc suivant : commencer juste après le bloc précédent
        blockStart = lastSlotEnd;
        const minutes = blockStart.getMinutes();
        const seconds = blockStart.getSeconds();
        if (minutes % 15 !== 0 || seconds !== 0) {
          blockStart = roundUpToQuarterHour(lastSlotEnd);
        }
      } else {
        // Premier bloc : commencer au début du créneau libre
        blockStart = freeSlot.start;
        const minutes = blockStart.getMinutes();
        const seconds = blockStart.getSeconds();
        if (minutes % 15 !== 0 || seconds !== 0) {
          blockStart = roundToQuarterHour(freeSlot.start);
        }
      }
      
      const blockEnd = new Date(blockStart.getTime() + totalGroupDuration * 60 * 1000);

      // Vérifier que le créneau ne dépasse pas le slot libre
      if (blockEnd.getTime() > freeSlot.end.getTime()) {
        // Ajuster pour tenir dans le slot
        blockStart = new Date(freeSlot.end.getTime() - totalGroupDuration * 60 * 1000);
        const minutes = blockStart.getMinutes();
        const seconds = blockStart.getSeconds();
        if (minutes % 15 !== 0 || seconds !== 0) {
          blockStart = roundToQuarterHour(blockStart);
        }
      }

      // Créer un titre descriptif basé sur les sous-tâches
      let eventTitle = task.title;
      if (groupedSubtasks.length === 1) {
        eventTitle = `${task.title} - ${groupedSubtasks[0].subtask.title}`;
      } else {
        const subtaskTitles = groupedSubtasks.map(g => g.subtask.title).join(", ");
        eventTitle = `${task.title} (${subtaskTitles})`;
      }

      slots.push({
        start: blockStart,
        end: blockEnd,
        duration: totalGroupDuration,
        subtasks: groupedSubtasks.map(g => g.subtask),
        eventTitle,
      });

      subtaskIndex = currentSubtaskIndex;
      lastSlotEnd = blockEnd;
    }
  }

  // Vérifier si toutes les sous-tâches ont été planifiées
  if (subtaskIndex >= subtasksWithDuration.length && slots.length > 0) {
    console.log("[SCHEDULE TASK SPLIT BY SUBTASKS] SUCCÈS: Toutes les sous-tâches planifiées en", slots.length, "événements");
    
    // Créer les événements dans Google Calendar
    const createdSlots = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      // S'assurer que les heures sont arrondies
      const roundedStart = roundToQuarterHour(slot.start);
      const duration = slot.end.getTime() - slot.start.getTime();
      const roundedEnd = new Date(roundedStart.getTime() + duration);
      
      const event = await createCalendarEvent(user, {
        title: slot.eventTitle + (slots.length > 1 ? ` (${i + 1}/${slots.length})` : ""),
        description: task.description || "",
        start: roundedStart,
        end: roundedEnd,
      });

      createdSlots.push({
        event,
        slot: {
          start: roundedStart,
          end: roundedEnd,
        },
        subtasks: slot.subtasks,
      });
    }

    return {
      success: true,
      event: createdSlots[0].event, // Pour compatibilité
      slot: createdSlots[0].slot, // Pour compatibilité
      slots: createdSlots,
      durationScheduled: slots.reduce((sum, s) => sum + s.duration, 0),
      split: true,
      splitBySubtasks: true,
    };
  }

  console.log("[SCHEDULE TASK SPLIT BY SUBTASKS] ÉCHEC: Impossible de planifier toutes les sous-tâches");
  return {
    success: false,
    reason: "Impossible de planifier toutes les sous-tâches dans les créneaux disponibles.",
  };
};

/**
 * Replanifie la partie restante d'une tâche non terminée
 */
export const rescheduleRemainingTask = async (user, task, preferredDate = null) => {
  console.log("[RESCHEDULE TASK] Replanification de la partie restante");
  
  const remainingTime = calculateRemainingTime(task);
  
  if (remainingTime <= 0) {
    return {
      success: false,
      reason: "Cette tâche n'a plus de temps restant à planifier.",
    };
  }
  
  return await scheduleTask(user, task, preferredDate, remainingTime);
};

