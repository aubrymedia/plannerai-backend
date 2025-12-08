import { getCalendarEvents, createCalendarEvent } from "./googleCalendar.service.js";
import { getFreeSlots } from "./googleCalendar.service.js";

/**
 * Trouve le meilleur créneau libre pour une tâche
 */
export const findBestSlotForTask = async (user, task, preferredDate = null) => {
  try {
    // Déterminer la période de recherche
    const now = new Date();
    
    // Si la tâche a une deadline, l'utiliser pour limiter la recherche
    const deadline = task.deadline ? new Date(task.deadline) : null;
    
    // Si deadline existe et est dans le passé, ne pas planifier
    if (deadline && deadline < now) {
      console.log("[Task Scheduler] ERREUR: Deadline dans le passé:", deadline.toISOString());
      return {
        success: false,
        reason: `La deadline de cette tâche (${deadline.toLocaleDateString("fr-FR")}) est dans le passé. Impossible de planifier.`,
      };
    }
    
    // Date de début de recherche
    let searchStart;
    if (preferredDate) {
      searchStart = new Date(preferredDate);
    } else {
      // Commencer dès maintenant (ou dans 30 minutes pour laisser le temps)
      searchStart = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes dans le futur
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

    // Récupérer les créneaux libres
    const freeSlots = await getFreeSlots(user, searchStart, searchEnd, {});
    
    console.log("[Task Scheduler] Créneaux libres trouvés:", freeSlots.length);

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
            suitableSlots.push({
              start: startSlot.start,
              end: new Date(startSlot.start.getTime() + requiredDuration),
              combined: true,
            });
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
        suitableSlots.push({
          start: startSlot.start,
          end: new Date(startSlot.start.getTime() + requiredDuration),
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
    // 1. Le plus proche de la date préférée (si fournie)
    // 2. Le plus proche de maintenant
    // 3. Le plus proche de la deadline (si existe)
    uniqueSlots.sort((a, b) => {
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

    return {
      success: true,
      slot: {
        start: bestSlot.start,
        end: bestSlot.end,
      },
      alternatives: uniqueSlots.slice(1, 4).map((slot) => ({
        start: slot.start,
        end: slot.end,
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
 */
export const scheduleTask = async (user, task, preferredDate = null, remainingDuration = null) => {
  console.log("[SCHEDULE TASK] Fonction appelée avec:", {
    taskTitle: task.title,
    taskDuration: task.duration,
    timeSpent: task.timeSpent || 0,
    scheduledSlots: task.scheduledSlots?.length || 0,
    preferredDate: preferredDate,
    remainingDuration: remainingDuration,
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

    // Trouver un créneau
    console.log("[SCHEDULE TASK] Recherche du meilleur créneau pour", durationToSchedule, "minutes...");
    const slotResult = await findBestSlotForTask(user, tempTask, preferredDate);
    console.log("[SCHEDULE TASK] Résultat de findBestSlotForTask:", {
      success: slotResult.success,
      reason: slotResult.reason,
      hasSlot: !!slotResult.slot,
    });

    if (!slotResult.success) {
      console.log("[SCHEDULE TASK] ÉCHEC: Impossible de trouver un créneau");
      return slotResult;
    }

    console.log("[SCHEDULE TASK] Créneau trouvé, création de l'événement...");
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
      slot: slotResult.slot,
      alternatives: slotResult.alternatives,
      durationScheduled: durationToSchedule,
    };
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

