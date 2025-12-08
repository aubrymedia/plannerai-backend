import mongoose from "mongoose";

const timeBlockSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "sport",
      "priority_task",
      "profitable_short_term",
      "long_term_development",
      "personal_time",
      "buffer",
      "other",
    ],
    required: true,
  },
  start: {
    type: Date,
    required: true,
  },
  end: {
    type: Date,
    required: true,
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Task",
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  googleEventId: {
    type: String, // ID de l'événement dans Google Calendar
  },
});

const planSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Période de planification
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    // Blocs horaires générés par l'IA
    timeBlocks: [timeBlockSchema],
    // Contexte utilisé pour générer le plan
    contextSnapshot: {
      companies: [
        {
          companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
          },
          name: String,
          mrr: Number,
          treasury: Number,
        },
      ],
      tasksCount: Number,
      goalsCount: Number,
    },
    // Statut
    status: {
      type: String,
      enum: ["draft", "pending_approval", "approved", "synced", "archived"],
      default: "draft",
    },
    // Validation et synchronisation
    approvedAt: {
      type: Date,
    },
    syncedAt: {
      type: Date,
    },
    // Notes de l'IA
    aiNotes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Plan", planSchema);

