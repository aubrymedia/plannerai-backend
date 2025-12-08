import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import authRoutes from "./routes/auth.routes.js";
import companyRoutes from "./routes/company.routes.js";
import taskRoutes from "./routes/task.routes.js";
import goalRoutes from "./routes/goal.routes.js";
import planningRoutes from "./routes/planning.routes.js";
import planningContextRoutes from "./routes/planningContext.routes.js";
import { errorHandler, notFound } from "./middlewares/error.middleware.js";
import env from "./config/env.js";

const app = express();

// CORS
app.use(
  cors({
    origin: env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// Session
app.use(
  session({
    secret: env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 heures
    },
  })
);

// Middleware de logging pour toutes les requêtes
app.use((req, res, next) => {
  if (req.path.startsWith("/api/tasks") && req.method === "POST" && req.path.includes("/schedule")) {
    console.log("=".repeat(50));
    console.log("[REQUEST] POST", req.path);
    console.log("[REQUEST] Body:", JSON.stringify(req.body, null, 2));
    console.log("[REQUEST] Params:", req.params);
    console.log("[REQUEST] Session:", req.session?.userId ? "User ID: " + req.session.userId : "No session");
  }
  next();
});

// Routes
app.get("/", (req, res) => {
  res.json({ message: "PlannerIA Backend is running." });
});

// Route de test pour vérifier les logs
app.get("/test-logs", (req, res) => {
  console.log("=".repeat(50));
  console.log("[TEST] Route de test appelée");
  console.log("[TEST] Date:", new Date().toISOString());
  res.json({ 
    success: true, 
    message: "Les logs fonctionnent ! Vérifiez votre terminal backend.",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/planning", planningRoutes);
app.use("/api/planning-context", planningContextRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;

