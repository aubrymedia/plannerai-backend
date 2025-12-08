import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },
    // Informations de base
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    duration: {
      type: Number, // en minutes
      required: true,
    },
    deadline: {
      type: Date,
    },
    // Sous-tâches
    subtasks: [
      {
        title: String,
        completed: {
          type: Boolean,
          default: false,
        },
      },
    ],
    // Dépendances (références vers d'autres tâches)
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    // Valeur business
    businessValue: {
      potentialRevenue: {
        type: Number,
        default: 0,
      },
      strategicImpact: {
        type: Number,
        min: 1,
        max: 10,
        default: 5,
      },
      urgency: {
        type: Number,
        min: 1,
        max: 10,
        default: 5,
      },
    },
    // Statut
    status: {
      type: String,
      enum: ["todo", "in_progress", "completed", "cancelled", "blocked"],
      default: "todo",
    },
    // Planification - Support de plusieurs créneaux pour une même tâche
    scheduledSlots: [
      {
        start: {
          type: Date,
          required: true,
        },
        end: {
          type: Date,
          required: true,
        },
        googleEventId: {
          type: String, // ID de l'événement dans Google Calendar
        },
        completed: {
          type: Boolean,
          default: false, // Indique si ce créneau a été complété
        },
        timeSpent: {
          type: Number, // Temps réellement passé en minutes
          default: 0,
        },
      },
    ],
    // Suivi de progression
    timeSpent: {
      type: Number, // Temps total passé sur la tâche en minutes
      default: 0,
    },
    progress: {
      type: Number, // Progression en pourcentage (0-100)
      min: 0,
      max: 100,
      default: 0,
    },
    // Champs de compatibilité (dépréciés mais conservés pour la migration)
    scheduledStart: {
      type: Date,
    },
    scheduledEnd: {
      type: Date,
    },
    googleEventId: {
      type: String, // ID de l'événement dans Google Calendar (déprécié, utiliser scheduledSlots)
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Task", taskSchema);

