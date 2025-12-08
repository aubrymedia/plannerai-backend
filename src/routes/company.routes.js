import express from "express";
import {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  createSnapshot,
  getSnapshots,
} from "../controllers/company.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// Routes CRUD
router.route("/").get(getCompanies).post(createCompany);
router
  .route("/:id")
  .get(getCompany)
  .put(updateCompany)
  .delete(deleteCompany);

// Routes pour les snapshots
router.route("/:id/snapshots").get(getSnapshots).post(createSnapshot);

export default router;

