import { google } from "googleapis";
import env from "./env.js";

export const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

export const calendar = google.calendar({ version: "v3", auth: oauth2Client });

