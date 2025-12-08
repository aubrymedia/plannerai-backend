import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    picture: {
      type: String,
    },
    googleAccessToken: {
      type: String,
    },
    googleRefreshToken: {
      type: String,
    },
    googleTokenExpiry: {
      type: Date,
    },
    googleCalendarId: {
      type: String, // ID du calendrier "Life Planner AI" créé
    },
    selectedCalendarIds: {
      type: [String], // IDs des calendriers Google sélectionnés pour la planification
      default: [], // Par défaut, aucun calendrier sélectionné (tous seront utilisés)
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", userSchema);

