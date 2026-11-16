import rateLimit from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import { MAX_SEATS, MIN_SEATS } from "../config/plans.js";
import {
  publicCatalogue,
  quoteFor,
  isSellable,
} from "../services/plan-catalogue.service.js";
import { signToken } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createOrganization } from "../services/organization.service.js";
import { describeSubscription } from "../services/billing.service.js";
import { asyncHandler, HttpError } from "../utils/http.js";
import { publicUser } from "../utils/serialize.js";

const router = Router();

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many sign-ups from this network. Try again later.",
    },
  },
});

router.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    // Database first, falling back to the hardcoded catalogue so the pricing page never goes
    // blank just because a migration is pending.
    res.json(await publicCatalogue());
  }),
);

router.get(
  "/quote",
  validate({
    query: z.object({
      plan: z.enum(["STANDARD", "CUSTOM"]),
      interval: z.enum(["MONTHLY", "YEARLY"]),
      seats: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { plan, interval, seats } = req.query;
    if (!(await isSellable(plan, interval))) {
      throw new HttpError(400, "That plan is not available", "UNKNOWN_PLAN");
    }
    res.json({ quote: await quoteFor({ plan, interval, seats }) });
  }),
);

const signupSchema = z.object({
  storeName: z.string().trim().min(2, "Enter your store name").max(80),
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, "Phone can only contain digits, spaces, + and -")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

/** Start a free trial. Returns a session so the new admin lands straight in the app. */
router.post(
  "/signup",
  signupLimiter,
  validate({ body: signupSchema }),
  asyncHandler(async (req, res) => {
    const { organization, user, subscription } = await createOrganization(
      req.body,
    );
    res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      subscription: describeSubscription(subscription, 1),
    });
  }),
);

export default router;
