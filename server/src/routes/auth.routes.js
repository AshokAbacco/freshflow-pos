import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { provisionOrganization, TRIAL_DAYS } from "../lib/store-template.js";
import { authenticate, signToken } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler, HttpError } from "../utils/http.js";
import { publicUser } from "../utils/serialize.js";

const router = Router();

// Compared against when the email is unknown, so response time doesn't reveal which accounts exist.
const TIMING_HASH = bcrypt.hashSync("freshflow-timing-guard", 10);

/*
 * Slows down credential stuffing against the sign-in form.
 *
 * The production limit is deliberately low. Outside production it is raised, because running the
 * test suites or restarting a dev server a few times otherwise locks you out of your own machine
 * for fifteen minutes — and there is no attacker to slow down on localhost. Override with
 * LOGIN_RATE_LIMIT if a deployment needs something different.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || (env.isProd ? 20 : 500),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many sign-in attempts. Wait 15 minutes and try again.",
    },
  },
});

/*
 * Each sign-up creates a whole store (organization, trial, 8 categories, 22 products), so it is
 * limited per IP to stop someone filling the database with junk stores.
 * Override with REGISTER_RATE_LIMIT.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.REGISTER_RATE_LIMIT) || (env.isProd ? 5 : 200),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many sign-ups from this network. Try again in an hour.",
    },
  },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(200),
});

const registerSchema = z.object({
  storeName: z
    .string()
    .trim()
    .min(2, "Enter your store name")
    .max(80, "Store name is too long"),
  name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: z.string().trim().max(300, "Address is too long").optional(),
});

const slugify = (text) =>
  text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "store";

/** A free organization slug: the store name, or the store name plus a short random suffix. */
async function freeSlug(storeName, forceSuffix = false) {
  const base = slugify(storeName);
  if (!forceSuffix) {
    const taken = await prisma.organization.findUnique({
      where: { slug: base },
      select: { id: true },
    });
    if (!taken) return base;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

const emailTaken = () =>
  new HttpError(
    409,
    "An account with this email already exists. Sign in instead.",
    "EMAIL_TAKEN",
  );

/*
 * Creates a new store and its first admin. The store starts with the standard category tree and
 * product catalog (at zero stock), neutral settings and a 30-day trial — see store-template.js.
 * Everything is created in one transaction, so a failure never leaves a half-built store.
 *
 * Answers on both /register and /signup, so the sign-up page works whichever path the
 * frontend's auth store calls. If you have an older sign-up handler on /signup in another
 * router, delete it: it creates stores without the starter catalog.
 */
router.post(
  ["/register", "/signup"],
  registerLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { storeName, name, email, password, phone, address } = req.body;

    if (
      await prisma.user.findUnique({ where: { email }, select: { id: true } })
    )
      throw emailTaken();

    // Hashed before the transaction opens, so bcrypt's ~250 ms doesn't hold a DB connection.
    const passwordHash = await bcrypt.hash(password, 12);

    let result;
    for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
      const slug = await freeSlug(storeName, attempt > 0);
      try {
        result = await prisma.$transaction(
          (tx) =>
            provisionOrganization(tx, {
              storeName,
              slug,
              adminName: name,
              adminEmail: email,
              passwordHash,
              phone: phone ?? null,
              address: address || null,
            }),
          { timeout: 15_000 },
        );
      } catch (err) {
        if (err?.code !== "P2002") throw err;
        // A unique constraint lost a race with another sign-up: either the same email was
        // registered a moment ago, or another store took this slug. Retry only the latter.
        if (
          await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          })
        )
          throw emailTaken();
      }
    }
    if (!result)
      throw new HttpError(
        503,
        "Could not create your store right now. Try again.",
        "REGISTER_FAILED",
      );

    const { organization, admin, catalog } = result;
    console.info(
      `[signup] store "${organization.name}" (${organization.slug}) created with ` +
        `${catalog.categoriesCreated} categories and ${catalog.productsCreated} products`,
    );
    res.status(201).json({
      token: signToken(admin),
      user: publicUser(admin),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      subscription: organization.subscription ?? null,
      // Shown on the sign-up success screen.
      setup: {
        categories: catalog.categoriesCreated,
        products: catalog.productsCreated,
        trialDays: TRIAL_DAYS,
      },
    });
  }),
);

router.post(
  "/login",
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash ?? TIMING_HASH,
    );

    if (!user || !passwordOk)
      throw new HttpError(
        401,
        "Email or password is incorrect",
        "INVALID_CREDENTIALS",
      );
    if (!user.isActive)
      throw new HttpError(
        403,
        "This account has been deactivated. Contact your store admin.",
        "ACCOUNT_DISABLED",
      );

    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, slug: true },
    });
    res.json({ token: signToken(user), user: publicUser(user), organization });
  }),
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user)
      throw new HttpError(401, "Sign in to continue", "UNAUTHENTICATED");
    res.json({
      user: publicUser(user),
      organization: req.organization
        ? {
            id: req.organization.id,
            name: req.organization.name,
            slug: req.organization.slug,
          }
        : null,
    });
  }),
);

export default router;
