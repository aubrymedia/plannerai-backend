import mongoose from "mongoose";

const goalSchema = new mongoose.Schema(
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
    // Type d'objectif
    horizon: {
      type: String,
      enum: ["short_term", "medium_term", "long_term"],
      required: true,
    },
    // Informations de base
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    importance: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    businessImpact: {
      type: Number, // Impact quantifiable (ex: revenu attendu)
      default: 0,
    },
    deadline: {
      type: Date,
    },
    // Tâches associées
    tasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    // Statut
    status: {
      type: String,
      enum: ["active", "completed", "cancelled", "on_hold"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Goal", goalSchema);

