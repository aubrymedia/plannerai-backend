import User from "../models/user.model.js";
import { oauth2Client } from "../config/google.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { google } from "googleapis";
import env from "../config/env.js";

/**
 * Génère l'URL d'authentification Google
 */
export const getAuthUrl = asyncHandler(async (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent", // Force la demande de refresh token
  });

  res.json({
    success: true,
    authUrl,
  });
});

/**
 * Callback après authentification Google
 */
export const handleCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: "Authorization code is required",
    });
  }

  // Échanger le code contre les tokens
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Récupérer les informations utilisateur
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  // Chercher ou créer l'utilisateur
  let user = await User.findOne({ googleId: userInfo.id });

  if (user) {
    // Mettre à jour les tokens
    user.googleAccessToken = tokens.access_token;
    user.googleRefreshToken = tokens.refresh_token;
    user.googleTokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : null;
    user.email = userInfo.email;
    user.name = userInfo.name;
    user.picture = userInfo.picture;
    await user.save();
  } else {
    // Créer un nouvel utilisateur
    user = await User.create({
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    });

    // Créer le calendrier "Life Planner AI"
    await createLifePlannerCalendar(user);
  }

  // Créer la session
  req.session.userId = user._id.toString();

  // Rediriger vers le frontend
  res.redirect(`${env.FRONTEND_URL}/dashboard?auth=success`);
});

/**
 * Crée le calendrier dédié "Life Planner AI" dans Google Calendar
 */
const createLifePlannerCalendar = asyncHandler(async (user) => {
  // Créer un nouveau client OAuth pour cet utilisateur
  const userOAuth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );

  // Configurer les credentials pour cet utilisateur
  userOAuth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: userOAuth2Client });

  try {
    const calendarList = await calendar.calendarList.list();
    const existingCalendar = calendarList.data.items.find(
      (cal) => cal.summary === "Life Planner AI"
    );

    if (existingCalendar) {
      user.googleCalendarId = existingCalendar.id;
      await user.save();
      return;
    }

    // Créer le nouveau calendrier
    const newCalendar = await calendar.calendars.insert({
      requestBody: {
        summary: "Life Planner AI",
        description: "Planning généré automatiquement par Life Planner AI",
        timeZone: "Europe/Paris",
      },
    });

    user.googleCalendarId = newCalendar.data.id;
    await user.save();
  } catch (error) {
    console.error("[Auth] Error creating calendar:", error);
    // Ne pas bloquer l'authentification si la création du calendrier échoue
  }
});

/**
 * Déconnexion
 */
export const logout = asyncHandler(async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: "Error during logout",
      });
    }

    res.clearCookie("connect.sid");
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  });
});

/**
 * Vérifier l'état de l'authentification
 */
export const getMe = asyncHandler(async (req, res) => {
  const userId = req.session?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Not authenticated",
    });
  }

  const user = await User.findById(userId).select("-googleAccessToken -googleRefreshToken");

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "User not found",
    });
  }

  res.json({
    success: true,
    user,
  });
});

/**
 * Récupère tous les calendriers Google de l'utilisateur
 */
export const getUserCalendarsList = asyncHandler(async (req, res) => {
  const { getUserCalendars } = await import("../services/calendar/googleCalendar.service.js");
  
  // req.user est déjà défini par le middleware protect
  const user = req.user;
  if (!user.googleAccessToken) {
    return res.status(400).json({
      success: false,
      error: "Google non connecté",
    });
  }

  const calendars = await getUserCalendars(user);
  
  // Marquer les calendriers sélectionnés
  const calendarsWithSelection = calendars.map((cal) => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description,
    backgroundColor: cal.backgroundColor,
    foregroundColor: cal.foregroundColor,
    selected: user.selectedCalendarIds?.includes(cal.id) || false,
  }));

  res.json({
    success: true,
    data: calendarsWithSelection,
  });
});

/**
 * Met à jour les calendriers sélectionnés par l'utilisateur
 */
export const updateSelectedCalendars = asyncHandler(async (req, res) => {
  const { calendarIds } = req.body;

  if (!Array.isArray(calendarIds)) {
    return res.status(400).json({
      success: false,
      error: "calendarIds doit être un tableau",
    });
  }

  // req.user est déjà défini par le middleware protect
  const user = req.user;
  user.selectedCalendarIds = calendarIds;
  await user.save();

  res.json({
    success: true,
    data: {
      selectedCalendarIds: user.selectedCalendarIds,
    },
  });
});

