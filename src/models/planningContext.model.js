import mongoose from "mongoose";

const planningContextSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Finances personnelles
    personalTreasury: {
      type: Number,
      default: 0,
    },
    minimumMonthlyNeeds: {
      type: Number,
      default: 0,
    },
    riskProfile: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    // Préférences horaires
    preferredHours: {
      morning: {
        start: {
          type: String, // Format "HH:mm"
          default: "09:00",
        },
        end: {
          type: String,
          default: "12:00",
        },
        enabled: {
          type: Boolean,
          default: true,
        },
      },
      afternoon: {
        start: {
          type: String,
          default: "14:00",
        },
        end: {
          type: String,
          default: "18:00",
        },
        enabled: {
          type: Boolean,
          default: true,
        },
      },
      evening: {
        start: {
          type: String,
          default: "19:00",
        },
        end: {
          type: String,
          default: "22:00",
        },
        enabled: {
          type: Boolean,
          default: false,
        },
      },
    },
    // Contraintes de vie
    constraints: {
      evenings: {
        type: String, // Description des contraintes de soirée
      },
      sport: {
        type: String, // Planning sportif souhaité
      },
      rest: {
        type: String, // Besoins de repos
      },
      other: {
        type: String, // Autres contraintes
      },
    },
    // Notes libres pour guider l'IA
    aiNotes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("PlanningContext", planningContextSchema);

