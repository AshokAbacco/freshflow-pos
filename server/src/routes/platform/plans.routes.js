/**
 * /api/v1/platform/plans
 *
 * What the business sells.
 *
 * A plan is never deleted, only retired. Stores are paying against these records: removing a
 * plan someone is on would orphan their subscription and break their renewal. Retiring hides
 * it from the pricing page and from the change-plan picker while everything already sold on
 * it carries on untouched.
 *
 * Limits are null for unlimited, not a large number. "Unlimited bills" and "a million bills"
 * are different promises, and only one of them is what the pricing page says.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import {
  PLATFORM_ROLES,
  authenticatePlatform,
  rejectStoreToken,
  requirePlatformRole,
  requireReason,
} from "../../middleware/platform-auth.js";
import { validate } from "../../middleware/validate.js";
import { AUDIT, writeAudit } from "../../services/audit.service.js";
import {
  getPlans,
  invalidatePlanCache,
} from "../../services/plan-catalogue.service.js";
import { HttpError } from "../../utils/http.js";

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

const SUPER = PLATFORM_ROLES.SUPER_ADMIN;
const num = (v) => (v === null || v === undefined ? null : Number(v));

const shape = (p, inUse = 0) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  blurb: p.blurb,
  isActive: p.isActive,
  isPublic: p.isPublic,
  sortOrder: p.sortOrder,
  limits: {
    users: p.maxUsers,
    products: p.maxProducts,
    billsPerMonth: p.maxBillsPerMonth,
  },
  features: Array.isArray(p.features) ? p.features : [],
  pricing: {
    monthly: { listPrice: num(p.monthlyListPrice), price: num(p.monthlyPrice) },
    yearly: { listPrice: num(p.yearlyListPrice), price: num(p.yearlyPrice) },
  },
  currency: p.currency,
  retiredAt: p.retiredAt,
  createdAt: p.createdAt,
  /** How many live subscriptions sit on this plan. Retiring one with stores on it is fine;
   *  it just means the plan keeps billing them and stops being offered to anyone new. */
  storesOnPlan: inUse,
});

/** Subscription.plan is the PlanTier enum, which matches Plan.code for the seeded plans. */
async function usageByCode() {
  const rows = await prisma.subscription.groupBy({
    by: ["plan"],
    _count: { plan: true },
    where: { cancelledAt: null },
  });
  return Object.fromEntries(rows.map((r) => [r.plan, r._count.plan]));
}

router.get("/", async (_req, res, next) => {
  try {
    /*
     * A missing or empty plans table is a pending migration, not an error. Report it as such
     * with the fallback catalogue, so the page explains itself instead of showing nothing and
     * leaving the reader to guess.
     */
    let rows = [];
    let notice = null;
    try {
      rows = await prisma.plan.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (!rows.length) {
        notice =
          "No plans are stored yet, so the prices below come from config/plans.js. Run the database migration to manage them here.";
      }
    } catch (err) {
      if (
        !/P2021|does not exist|undefined/i.test(err.code || err.message || "")
      )
        throw err;
      notice =
        "The plans table does not exist yet. Run `npx prisma migrate deploy` and `npx prisma generate`, then reload. Until then the prices below come from config/plans.js.";
    }

    const inUse = await usageByCode();

    if (rows.length) {
      return res.json({
        plans: rows.map((p) => shape(p, inUse[p.code] ?? 0)),
        source: "database",
      });
    }

    /*
     * Read-only view of the fallback. getPlans, not publicCatalogue: the admin manages every
     * plan including the trial, which is deliberately not on the public pricing page. Filtering
     * to sellable plans here hid the trial from the only screen that is meant to show it.
     */
    const { plans: all } = await getPlans({ fresh: true });
    return res.json({
      source: "fallback",
      notice,
      plans: all.map((p) => ({
        id: null,
        code: p.code,
        name: p.name,
        blurb: p.blurb,
        isActive: p.isActive,
        isPublic: p.isPublic,
        sortOrder: 0,
        limits: p.limits,
        features: p.features,
        pricing: { monthly: p.intervals.MONTHLY, yearly: p.intervals.YEARLY },
        currency: p.currency,
        retiredAt: null,
        createdAt: null,
        storesOnPlan: inUse[p.code] ?? 0,
        editable: false,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

const planBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/, "Use capitals, digits and underscores")
    .optional(),
  name: z.string().trim().min(2).max(80),
  blurb: z.string().trim().max(400).nullable().optional(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  limits: z
    .object({
      users: z.coerce.number().int().min(1).max(100000).nullable().optional(),
      products: z.coerce
        .number()
        .int()
        .min(1)
        .max(10000000)
        .nullable()
        .optional(),
      billsPerMonth: z.coerce
        .number()
        .int()
        .min(1)
        .max(10000000)
        .nullable()
        .optional(),
    })
    .optional(),
  features: z.array(z.string().trim().max(200)).max(30).optional(),
  pricing: z
    .object({
      monthly: z.object({
        listPrice: z.coerce.number().min(0).max(1000000),
        price: z.coerce.number().min(0).max(1000000),
      }),
      yearly: z.object({
        listPrice: z.coerce.number().min(0).max(1000000),
        price: z.coerce.number().min(0).max(1000000),
      }),
    })
    .optional(),
  currency: z.string().trim().length(3).optional(),
});

/** Maps the API shape onto columns. */
function toColumns(body) {
  const data = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.blurb !== undefined) data.blurb = body.blurb || null;
  if (body.isPublic !== undefined) data.isPublic = body.isPublic;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.features !== undefined) data.features = body.features;
  if (body.currency !== undefined) data.currency = body.currency.toUpperCase();

  if (body.limits) {
    if ("users" in body.limits) data.maxUsers = body.limits.users ?? null;
    if ("products" in body.limits)
      data.maxProducts = body.limits.products ?? null;
    if ("billsPerMonth" in body.limits)
      data.maxBillsPerMonth = body.limits.billsPerMonth ?? null;
  }
  if (body.pricing) {
    data.monthlyListPrice = body.pricing.monthly.listPrice;
    data.monthlyPrice = body.pricing.monthly.price;
    data.yearlyListPrice = body.pricing.yearly.listPrice;
    data.yearlyPrice = body.pricing.yearly.price;
  }
  return data;
}

router.post(
  "/",
  requirePlatformRole(SUPER),
  validate({ body: planBody }),
  async (req, res, next) => {
    try {
      if (!req.body.code)
        throw new HttpError(400, "A plan needs a code", "CODE_REQUIRED");
      const existing = await prisma.plan.findUnique({
        where: { code: req.body.code },
      });
      if (existing)
        throw new HttpError(409, "A plan already uses that code", "CODE_TAKEN");

      const plan = await prisma.plan.create({
        data: { code: req.body.code, ...toColumns(req.body) },
      });

      invalidatePlanCache();

      await writeAudit({
        req,
        action: AUDIT.PLAN_CREATED,
        targetType: "plan",
        targetId: plan.id,
        reason: `Created plan ${plan.code}`,
        changes: { code: plan.code, name: plan.name },
      });

      return res.status(201).json({ plan: shape(plan) });
    } catch (err) {
      return next(err);
    }
  },
);

router.patch(
  "/:id",
  requirePlatformRole(SUPER),
  validate({ body: planBody.partial({ name: true }) }),
  async (req, res, next) => {
    try {
      const plan = await prisma.plan.findUnique({
        where: { id: req.params.id },
      });
      if (!plan) throw new HttpError(404, "No plan with that id", "NOT_FOUND");

      // The code is how subscriptions point at this plan; changing it would detach them.
      if (req.body.code && req.body.code !== plan.code) {
        throw new HttpError(
          409,
          "A plan code cannot change once stores are on it. Retire this plan and create a new one.",
          "CODE_IMMUTABLE",
        );
      }

      const data = toColumns(req.body);
      if (!Object.keys(data).length)
        throw new HttpError(400, "Nothing to change", "NO_CHANGE");

      const updated = await prisma.plan.update({
        where: { id: plan.id },
        data,
      });

      invalidatePlanCache();

      await writeAudit({
        req,
        action: AUDIT.PLAN_UPDATED,
        targetType: "plan",
        targetId: plan.id,
        reason: `Updated plan ${plan.code}`,
        changes: {
          priceFrom: num(plan.monthlyPrice),
          priceTo: num(updated.monthlyPrice),
          name:
            plan.name !== updated.name
              ? { from: plan.name, to: updated.name }
              : undefined,
        },
      });

      return res.json({ plan: shape(updated) });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * Retire (or un-retire) a plan. This is the closest thing to deleting one, and the reason is
 * required because it changes what the business sells.
 */
router.post(
  "/:id/retire",
  requirePlatformRole(SUPER),
  requireReason,
  validate({
    body: z.object({ retired: z.boolean().optional(), reason: z.string() }),
  }),
  async (req, res, next) => {
    try {
      const plan = await prisma.plan.findUnique({
        where: { id: req.params.id },
      });
      if (!plan) throw new HttpError(404, "No plan with that id", "NOT_FOUND");

      const retire = req.body.retired !== false;
      if (retire && plan.retiredAt) {
        throw new HttpError(
          409,
          "That plan is already retired",
          "ALREADY_RETIRED",
        );
      }
      if (!retire && !plan.retiredAt) {
        throw new HttpError(409, "That plan is not retired", "NOT_RETIRED");
      }

      const inUse = (await usageByCode())[plan.code] ?? 0;

      const updated = await prisma.plan.update({
        where: { id: plan.id },
        data: {
          retiredAt: retire ? new Date() : null,
          isActive: !retire,
          isPublic: retire ? false : plan.isPublic,
        },
      });

      invalidatePlanCache();

      await writeAudit({
        req,
        action: AUDIT.PLAN_RETIRED,
        targetType: "plan",
        targetId: plan.id,
        changes: { code: plan.code, retired: retire, storesStillOnIt: inUse },
      });

      return res.json({ plan: shape(updated, inUse), storesStillOnIt: inUse });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
