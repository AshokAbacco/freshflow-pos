import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

import authRoutes from "./routes/auth.routes.js";
import billingRoutes, { webhookRouter } from "./routes/billing.routes.js";
import publicRoutes from "./routes/public.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";

import platformAccountRoutes from "./routes/platform/account.routes.js";
import platformAuditRoutes from "./routes/platform/audit.routes.js";
import platformAuthRoutes from "./routes/platform/auth.routes.js";
import platformDashboardRoutes from "./routes/platform/dashboard.routes.js";
import platformFollowUpRoutes from "./routes/platform/followups.routes.js";
import platformPaymentRoutes, {
  webhookRouter as platformWebhookRoutes,
} from "./routes/platform/payments.routes.js";
import platformMessageRoutes, {
  inboxRouter as platformInboxRoutes,
} from "./routes/platform/messages.routes.js";
import platformPlanRoutes from "./routes/platform/plans.routes.js";
import platformReportRoutes from "./routes/platform/reports.routes.js";
import platformSearchRoutes from "./routes/platform/search.routes.js";
import platformSettingsRoutes, {
  healthRouter as platformHealthRoutes,
} from "./routes/platform/settings.routes.js";
import platformStoreRoutes from "./routes/platform/stores.routes.js";
import platformTeamRoutes from "./routes/platform/team.routes.js";
import platformUserRoutes from "./routes/platform/users.routes.js";

import categoryRoutes from "./routes/categories.routes.js";
import productRoutes from "./routes/products.routes.js";
import reportRoutes from "./routes/reports.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import transactionRoutes from "./routes/transactions.routes.js";
import userRoutes from "./routes/users.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  if (env.trustProxy) {
    app.set("trust proxy", 1);
  }

  // ============================================
  // CORS CONFIGURATION
  // ============================================

  const allowedOrigins = [
    "https://grocery-pos-ui.onrender.com",
    "https://www.supermarketbilling.com",
    "https://supermarketbilling.com",
    ...env.corsOrigins,
  ];

  const corsOptions = {
    origin(origin, callback) {
      // Allow requests without an Origin header:
      // Postman, curl, server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      // Allow only configured frontend domains.
      if (allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }

      console.warn("CORS BLOCKED ORIGIN:", origin);

      return callback(null, false);
    },

    // REQUIRED for HTTP-only cookies and refresh tokens.
    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Accept",
      "X-Requested-With",
    ],

    optionsSuccessStatus: 204,

    maxAge: 600,
  };

  // CORS must be registered before API routes and authentication.
  // This also handles OPTIONS preflight requests.
  app.use(cors(corsOptions));

  // ============================================
  // SECURITY & MIDDLEWARE
  // ============================================

  app.use(helmet());

  app.use(compression());

  app.use(morgan(env.isProd ? "combined" : "dev"));

  // ============================================
  // RAZORPAY WEBHOOK
  // ============================================

  // Webhook requires the original raw request body.
  // Keep this before express.json().
  app.use("/api/billing", webhookRouter);

  // ============================================
  // JSON BODY PARSER
  // ============================================

  app.use(express.json({ limit: "1mb" }));

  // ============================================
  // MAIN API ROUTER
  // ============================================

  const api = express.Router();

  // Health check
  api.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      res.json({
        status: "ok",
        database: "up",
        time: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Health check failed:", error);

      res.status(503).json({
        status: "degraded",
        database: "down",
        time: new Date().toISOString(),
      });
    }
  });

  // ============================================
  // PUBLIC ROUTES
  // ============================================

  api.use("/auth", authRoutes);

  // Marketing website, pricing and signup.
  api.use("/public", publicRoutes);

  // Billing handles its own authentication.
  api.use("/billing", billingRoutes);

  // ============================================
  // STORE AUTHENTICATION
  // ============================================

  // Everything below requires a valid store session.
  api.use(authenticate);

  api.use("/settings", settingsRoutes);
  api.use("/categories", categoryRoutes);
  api.use("/products", productRoutes);
  api.use("/transactions", transactionRoutes);
  api.use("/reports", reportRoutes);
  api.use("/users", userRoutes);

  // Notifications
  api.use("/notifications", notificationRoutes);

  // ============================================
  // PLATFORM ADMIN ROUTES
  // ============================================

  // Platform admin has a separate authentication system.
  // These routes must NOT use the store authenticate middleware.

  const platform = express.Router();

  platform.use("/auth", platformAuthRoutes);
  platform.use("/dashboard", platformDashboardRoutes);
  platform.use("/stores", platformStoreRoutes);
  platform.use("/search", platformSearchRoutes);
  platform.use("/follow-ups", platformFollowUpRoutes);
  platform.use("/users", platformUserRoutes);
  platform.use("/payments", platformPaymentRoutes);
  platform.use("/webhooks", platformWebhookRoutes);
  platform.use("/audit", platformAuditRoutes);
  platform.use("/account", platformAccountRoutes);
  platform.use("/team", platformTeamRoutes);
  platform.use("/plans", platformPlanRoutes);
  platform.use("/messages", platformMessageRoutes);
  platform.use("/inbox", platformInboxRoutes);
  platform.use("/reports", platformReportRoutes);
  platform.use("/settings", platformSettingsRoutes);
  platform.use("/health", platformHealthRoutes);

  // Platform API version prefix.
  app.use("/api/v1/platform", platform);

  // ============================================
  // MOUNT MAIN API
  // ============================================

  app.use("/api", api);

  // ============================================
  // ERROR HANDLING
  // ============================================

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
}
