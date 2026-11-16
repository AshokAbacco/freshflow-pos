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
  if (env.trustProxy) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests and non-browser clients send no Origin header.
        if (!origin || env.corsOrigins.includes(origin))
          return callback(null, true);
        return callback(null, false);
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(morgan(env.isProd ? "combined" : "dev"));

  // The Razorpay webhook is signed over the exact bytes of the request, so it must be
  // mounted with its own raw-body parser before the JSON parser touches anything.
  app.use("/api/billing", webhookRouter);

  app.use(express.json({ limit: "1mb" }));

  const api = express.Router();

  api.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: "ok",
        database: "up",
        time: new Date().toISOString(),
      });
    } catch {
      res
        .status(503)
        .json({
          status: "degraded",
          database: "down",
          time: new Date().toISOString(),
        });
    }
  });

  api.use("/auth", authRoutes);
  // Marketing site, pricing and sign-up: no session required.
  api.use("/public", publicRoutes);
  // Billing handles its own authentication (the webhook above is public).
  api.use("/billing", billingRoutes);

  // Everything below requires a valid session; each router declares which roles may use it.
  api.use(authenticate);
  api.use("/settings", settingsRoutes);
  api.use("/categories", categoryRoutes);
  api.use("/products", productRoutes);
  api.use("/transactions", transactionRoutes);
  api.use("/reports", reportRoutes);
  api.use("/users", userRoutes);
  // Where platform messages actually reach the shop.
  api.use("/notifications", notificationRoutes);

  /*
   * The platform panel is a separate API surface under its own version prefix. It does NOT
   * sit behind the store `authenticate` middleware above: platform staff are not store users,
   * and a store token must never reach these routes.
   */
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
  app.use("/api/v1/platform", platform);

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
