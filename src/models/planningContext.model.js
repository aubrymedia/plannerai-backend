import mongoose from "mongoose";

const planningContextSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Informations personnelles
    personalInfo: {
      firstName: {
        type: String,
      },
      lastName: {
        type: String,
      },
      dateOfBirth: {
        type: Date,
      },
      gender: {
        type: String,
        enum: ["male", "female", ""],
        default: "",
      },
      weight: {
        type: Number, // en kg
        min: 0,
      },
      height: {
        type: Number, // en cm
        min: 0,
      },
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
    // Préférences horaires par type d'activité
    preferredHours: {
      sleep: {
        start: {
          type: String, // Format "HH:mm"
        },
        end: {
          type: String,
        },
        flexible: {
          type: Boolean, // "Peu importe"
          default: false,
        },
      },
      sport: {
        start: {
          type: String,
        },
        end: {
          type: String,
        },
        flexible: {
          type: Boolean,
          default: false,
        },
      },
      work: {
        start: {
          type: String,
        },
        end: {
          type: String,
        },
        flexible: {
          type: Boolean,
          default: false,
        },
      },
      social: {
        start: {
          type: String,
        },
        end: {
          type: String,
        },
        flexible: {
          type: Boolean,
          default: false,
        },
      },
      meals: {
        start: {
          type: String,
        },
        end: {
          type: String,
        },
        flexible: {
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

