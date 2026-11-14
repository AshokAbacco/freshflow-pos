/**
 * GET /api/v1/platform/dashboard
 *
 * Every figure here is computed from the database. Nothing is hardcoded and nothing is
 * estimated, because a back-office number that is "roughly right" is worse than no number:
 * someone will act on it.
 *
 * The state counts come from evaluateEntitlement rather than the stored `status` column.
 * A subscription that lapsed an hour ago is lapsed whether or not the hourly job has run,
 * so counting the column would show stores as active that cannot actually sell.
 */
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import {
  authenticatePlatform,
  rejectStoreToken,
} from "../../middleware/platform-auth.js";
import {
  STATES,
  evaluateEntitlement,
} from "../../services/entitlement.service.js";

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

const DAY_MS = 86_400_000;
const since = (days) => new Date(Date.now() - days * DAY_MS);
const within = (days) => new Date(Date.now() + days * DAY_MS);
const money = (value) => Number(value ?? 0);

router.get("/", async (req, res, next) => {
  try {
    const now = new Date();

    const [
      organizations,
      payments,
      webhookFailures,
      latestSignups,
      latestPayments,
    ] = await Promise.all([
      /*
       * Loaded in full so entitlement can be evaluated per store. Fine at the scale this
       * panel is for; if the tenant count ever reaches the thousands, pre-compute these
       * counts in the hourly job and read them here instead.
       */
      prisma.organization.findMany({
        select: {
          id: true,
          createdAt: true,
          subscription: {
            select: {
              status: true,
              plan: true,
              seats: true,
              pricePerUser: true,
              interval: true,
              trialEndsAt: true,
              currentPeriodEnd: true,
              graceEndsAt: true,
              suspendedAt: true,
              suspendedReason: true,
              cancelledAt: true,
            },
          },
        },
      }),

      prisma.payment.findMany({
        where: { createdAt: { gte: since(30) } },
        select: {
          status: true,
          amount: true,
          amountCaptured: true,
          currency: true,
        },
      }),

      prisma.webhookEvent.count({
        where: { handled: false, receivedAt: { gte: since(1) } },
      }),

      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          city: true,
          createdAt: true,
          subscription: { select: { plan: true, status: true } },
        },
      }),

      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          plan: true,
          seats: true,
          createdAt: true,
          paidAt: true,
          organization: { select: { id: true, name: true } },
        },
      }),
    ]);

    const byState = Object.fromEntries(
      Object.values(STATES).map((s) => [s, 0]),
    );
    let mrr = 0;

    for (const org of organizations) {
      const { state } = evaluateEntitlement(org, org.subscription, now);
      byState[state] += 1;

      /*
       * Monthly recurring revenue. `pricePerUser` is already a per-user-per-month figure in
       * this schema -- a yearly plan simply charges twelve of them up front -- so the monthly
       * contribution is the same either way and the interval does not enter into it.
       * Only states that are actually paying count.
       */
      const sub = org.subscription;
      if (
        sub &&
        (state === STATES.ACTIVE ||
          state === STATES.PAST_DUE ||
          state === STATES.GRACE_PERIOD)
      ) {
        mrr += money(sub.pricePerUser) * (sub.seats ?? 0);
      }
    }

    const paid = payments.filter((p) => p.status === "PAID");
    const revenue30d = paid.reduce(
      (sum, p) => sum + money(p.amountCaptured ?? p.amount),
      0,
    );

    const [expiring3, expiring7, expiring15] = await Promise.all(
      [3, 7, 15].map((days) =>
        prisma.subscription.count({
          where: {
            currentPeriodEnd: { gte: now, lte: within(days) },
            status: { in: ["ACTIVE", "PAST_DUE", "TRIALING"] },
            suspendedAt: null,
            cancelledAt: null,
          },
        }),
      ),
    );

    const [signupsToday, signups7d, signups30d] = await Promise.all(
      [1, 7, 30].map((days) =>
        prisma.organization.count({
          where: { createdAt: { gte: since(days) } },
        }),
      ),
    );

    // SUPPORT may see how the platform is doing but not what it earns.
    const seesMoney = req.platformAdmin.role !== "SUPPORT";

    return res.json({
      stores: {
        total: organizations.length,
        byState,
      },
      signups: {
        today: signupsToday,
        last7Days: signups7d,
        last30Days: signups30d,
      },
      expiring: {
        in3Days: expiring3,
        in7Days: expiring7,
        in15Days: expiring15,
      },
      payments: {
        failedLast30Days: payments.filter((p) => p.status === "FAILED").length,
        webhookFailuresLast24h: webhookFailures,
        ...(seesMoney
          ? {
              revenueLast30Days: Math.round(revenue30d * 100) / 100,
              mrr: Math.round(mrr * 100) / 100,
            }
          : {}),
      },
      latestSignups: latestSignups.map((o) => ({
        id: o.id,
        name: o.name,
        city: o.city,
        createdAt: o.createdAt,
        plan: o.subscription?.plan ?? null,
        status: o.subscription?.status ?? null,
      })),
      latestPayments: seesMoney
        ? latestPayments.map((p) => ({
            id: p.id,
            store: p.organization?.name ?? "Unknown store",
            storeId: p.organization?.id ?? null,
            amount: money(p.amount),
            currency: p.currency,
            status: p.status,
            plan: p.plan,
            seats: p.seats,
            at: p.paidAt ?? p.createdAt,
          }))
        : [],
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
