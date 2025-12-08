import { google } from "googleapis";
import User from "../../models/user.model.js";
import env from "../../config/env.js";

/**
 * Crée un client OAuth2 pour un utilisateur spécifique
 */
const getUserOAuth2Client = (user) => {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });

  return oauth2Client;
};

/**
 * Récupère tous les calendriers de l'utilisateur
 */
export const getUserCalendars = async (user) => {
  try {
    const oauth2Client = getUserOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.calendarList.list();
    return response.data.items || [];
  } catch (error) {
    console.error("[Google Calendar] Error fetching calendars:", error);
    return [];
  }
};

/**
 * Récupère les événements de TOUS les calendriers Google pour une période donnée
 * Si selectedCalendarIds est défini, ne récupère que ces calendriers
 */
export const getCalendarEvents = async (user, startDate, endDate) => {
  try {
    const oauth2Client = getUserOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Récupérer tous les calendriers
    const calendars = await getUserCalendars(user);
    
    if (calendars.length === 0) {
      console.log("[Google Calendar] Aucun calendrier trouvé");
      return [];
    }
    
    // Filtrer selon les calendriers sélectionnés par l'utilisateur
    let calendarIds;
    if (user.selectedCalendarIds && user.selectedCalendarIds.length > 0) {
      // Utiliser uniquement les calendriers sélectionnés
      calendarIds = user.selectedCalendarIds.filter((id) =>
        calendars.some((cal) => cal.id === id)
      );
      console.log("[Google Calendar] Utilisation des calendriers sélectionnés:", calendarIds.length, "sur", calendars.length);
      
      if (calendarIds.length === 0) {
        console.log("[Google Calendar] ATTENTION: Aucun calendrier sélectionné valide, utilisation de tous les calendriers par défaut");
        // Si aucun calendrier sélectionné n'est valide, utiliser tous les calendriers
        calendarIds = calendars.map((cal) => cal.id);
      }
    } else {
      // Utiliser tous les calendriers (comportement par défaut si aucun n'est sélectionné)
      calendarIds = calendars.map((cal) => cal.id);
      console.log("[Google Calendar] Aucun calendrier sélectionné dans les paramètres, utilisation de tous les calendriers:", calendarIds.length);
    }

    // Récupérer les événements de tous les calendriers
    const allEvents = [];
    for (const calendarId of calendarIds) {
      try {
        const response = await calendar.events.list({
          calendarId: calendarId,
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });
        
        // Ajouter le nom du calendrier à chaque événement
        const events = (response.data.items || []).map((event) => ({
          ...event,
          calendarName: calendars.find((c) => c.id === calendarId)?.summary || "Unknown",
          calendarId: calendarId,
        }));
        
        allEvents.push(...events);
      } catch (error) {
        console.error(`[Google Calendar] Error fetching events from calendar ${calendarId}:`, error);
        // Continue avec les autres calendriers
      }
    }

    // Trier par date de début
    allEvents.sort((a, b) => {
      const aStart = a.start.dateTime || a.start.date;
      const bStart = b.start.dateTime || b.start.date;
      return new Date(aStart) - new Date(bStart);
    });

    return allEvents;
  } catch (error) {
    console.error("[Google Calendar] Error fetching events:", error);
    throw new Error("Erreur lors de la récupération des événements");
  }
};

/**
 * Récupère les créneaux libres pour une période donnée
 */
export const getFreeSlots = async (user, startDate, endDate, workingHours = {}) => {
  console.log("[GET FREE SLOTS] Début de la recherche de créneaux libres");
  console.log("[GET FREE SLOTS] Période:", {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    duration: (endDate - startDate) / (1000 * 60 * 60 * 24), // en jours
  });
  
  try {
    console.log("[GET FREE SLOTS] Récupération des événements...");
    const events = await getCalendarEvents(user, startDate, endDate);
    
    console.log("[GET FREE SLOTS] Événements récupérés:", events.length);
    if (events.length > 0) {
      console.log("[Google Calendar] Premier événement:", {
        summary: events[0].summary,
        start: events[0].start.dateTime || events[0].start.date,
        end: events[0].end.dateTime || events[0].end.date,
        calendarId: events[0].calendarId,
      });
    }
    
    // Filtrer les événements protégés (#lock, #no-touch, #prive)
    const protectedEvents = events.filter((event) => {
      const summary = (event.summary || "").toLowerCase();
      const description = (event.description || "").toLowerCase();
      return (
        summary.includes("#lock") ||
        summary.includes("#no-touch") ||
        summary.includes("#prive") ||
        description.includes("#lock") ||
        description.includes("#no-touch") ||
        description.includes("#prive")
      );
    });

    // Convertir les événements en créneaux occupés
    const busySlots = events.map((event) => {
      const start = event.start.dateTime || event.start.date;
      const end = event.end.dateTime || event.end.date;
      return {
        start: new Date(start),
        end: new Date(end),
        isProtected: protectedEvents.includes(event),
      };
    });

    // Calculer les créneaux libres
    const freeSlots = [];
    let currentTime = new Date(startDate);
    
    console.log("[GET FREE SLOTS] Nombre d'événements occupés:", busySlots.length);
    if (busySlots.length > 0) {
      console.log("[GET FREE SLOTS] Premier événement occupé:", {
        start: busySlots[0].start.toISOString(),
        end: busySlots[0].end.toISOString(),
      });
    }

    while (currentTime < endDate) {
      const slotEnd = new Date(currentTime.getTime() + 30 * 60 * 1000); // Créneaux de 30 min

      // Vérifier si le créneau chevauche un événement
      const isBusy = busySlots.some((slot) => {
        // Vérifier si le créneau chevauche avec un événement occupé
        const overlaps = (
          (currentTime.getTime() < slot.end.getTime() && slotEnd.getTime() > slot.start.getTime())
        );
        return overlaps;
      });

      // Vérifier les heures de travail si définies
      const hour = currentTime.getHours();
      let isWorkingHour = true; // Par défaut, tous les créneaux sont disponibles
      
      if (workingHours && Object.keys(workingHours).length > 0) {
        isWorkingHour = false;
        // Vérifier si le créneau est dans une plage horaire définie
        if (workingHours.morning?.enabled) {
          const morningStart = parseInt(workingHours.morning.start.split(":")[0]);
          const morningEnd = parseInt(workingHours.morning.end.split(":")[0]);
          if (hour >= morningStart && hour < morningEnd) {
            isWorkingHour = true;
          }
        }
        if (workingHours.afternoon?.enabled && !isWorkingHour) {
          const afternoonStart = parseInt(workingHours.afternoon.start.split(":")[0]);
          const afternoonEnd = parseInt(workingHours.afternoon.end.split(":")[0]);
          if (hour >= afternoonStart && hour < afternoonEnd) {
            isWorkingHour = true;
          }
        }
        if (workingHours.evening?.enabled && !isWorkingHour) {
          const eveningStart = parseInt(workingHours.evening.start.split(":")[0]);
          const eveningEnd = parseInt(workingHours.evening.end.split(":")[0]);
          if (hour >= eveningStart && hour < eveningEnd) {
            isWorkingHour = true;
          }
        }
      }

      if (!isBusy && isWorkingHour) {
        freeSlots.push({
          start: new Date(currentTime),
          end: new Date(slotEnd),
        });
      }

      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000); // Incrémenter de 30 min
    }
    
    console.log("[GET FREE SLOTS] Créneaux libres trouvés:", freeSlots.length);
    if (freeSlots.length > 0) {
      console.log("[GET FREE SLOTS] Premier créneau libre:", {
        start: freeSlots[0].start.toISOString(),
        end: freeSlots[0].end.toISOString(),
        duration: (freeSlots[0].end - freeSlots[0].start) / 1000 / 60,
      });
      console.log("[GET FREE SLOTS] Dernier créneau libre:", {
        start: freeSlots[freeSlots.length - 1].start.toISOString(),
        end: freeSlots[freeSlots.length - 1].end.toISOString(),
        duration: (freeSlots[freeSlots.length - 1].end - freeSlots[freeSlots.length - 1].start) / 1000 / 60,
      });
    } else {
      console.log("[GET FREE SLOTS] ⚠️ AUCUN CRÉNEAU LIBRE TROUVÉ !");
      console.log("[GET FREE SLOTS] Période analysée:", {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        durationDays: (endDate - startDate) / (1000 * 60 * 60 * 24),
      });
      console.log("[GET FREE SLOTS] Événements qui bloquent:", busySlots.length);
    }

    console.log("[Google Calendar] Créneaux libres calculés:", freeSlots.length);
    if (freeSlots.length > 0) {
      console.log("[Google Calendar] Premier créneau libre:", {
        start: freeSlots[0].start.toISOString(),
        end: freeSlots[0].end.toISOString(),
        duration: (freeSlots[0].end - freeSlots[0].start) / 1000 / 60,
      });
    }

    return freeSlots;
  } catch (error) {
    console.error("[Google Calendar] Error getting free slots:", error);
    throw error;
  }
};

/**
 * Crée un événement dans le calendrier "Life Planner IA"
 */
export const createCalendarEvent = async (user, eventData) => {
  try {
    if (!user.googleCalendarId) {
      throw new Error("Calendrier Life Planner IA non configuré");
    }

    const oauth2Client = getUserOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event = {
      summary: eventData.title,
      description: eventData.description || "",
      start: {
        dateTime: eventData.start.toISOString(),
        timeZone: "Europe/Paris",
      },
      end: {
        dateTime: eventData.end.toISOString(),
        timeZone: "Europe/Paris",
      },
      calendarId: user.googleCalendarId,
    };

    const response = await calendar.events.insert({
      calendarId: user.googleCalendarId,
      requestBody: event,
    });

    return response.data;
  } catch (error) {
    console.error("[Google Calendar] Error creating event:", error);
    throw new Error("Erreur lors de la création de l'événement");
  }
};

/**
 * Supprime un événement du calendrier
 */
export const deleteCalendarEvent = async (user, eventId) => {
  try {
    if (!user.googleCalendarId) {
      throw new Error("Calendrier Life Planner IA non configuré");
    }

    const oauth2Client = getUserOAuth2Client(user);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    await calendar.events.delete({
      calendarId: user.googleCalendarId,
      eventId: eventId,
    });

    return true;
  } catch (error) {
    console.error("[Google Calendar] Error deleting event:", error);
    throw new Error("Erreur lors de la suppression de l'événement");
  }
};

