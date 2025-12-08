import mongoose from "mongoose";

const snapshotSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  mrr: {
    type: Number,
    default: 0,
  },
  oneOff: {
    type: Number,
    default: 0,
  },
  treasury: {
    type: Number,
    default: 0,
  },
  pipeline: {
    type: Number,
    default: 0,
  },
  strategicComments: {
    type: String,
  },
  aiHints: {
    type: String, // Hints IA pour améliorer la croissance
  },
});

const companySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Informations statiques
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    sector: {
      type: String,
      enum: ["saas", "agency", "restaurant", "ecommerce", "other"],
      default: "other",
    },
    strategicWeight: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },
    // Date de création/fondation
    foundedDate: {
      type: Date,
    },
    // Lien Pappers.fr
    pappersUrl: {
      type: String,
    },
    // Informations financières dynamiques
    currentTreasury: {
      type: Number,
      default: 0,
    },
    mrr: {
      type: Number,
      default: 0,
    },
    oneOffMonthlyRevenue: {
      type: Number,
      default: 0,
    },
    pipelineValue: {
      type: Number,
      default: 0,
    },
    revenueStability: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },
    // Snapshots historiques
    snapshots: [snapshotSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Company", companySchema);

