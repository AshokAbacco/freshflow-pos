/**
 * /api/v1/platform/reports
 *
 * How the business is actually doing.
 *
 * Every figure is computed from the rows, never from a cached counter, and the awkward ones
 * are defined in comments where they are worked out -- "churn" and "MRR" mean different
 * things to different people, and a number whose definition is implicit is a number nobody
 * can check.
 *
 * SUPPORT is refused: this is revenue.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  PLATFORM_ROLES,
  authenticatePlatform,
  rejectStoreToken,
  requirePlatformRole,
} from '../../middleware/platform-auth.js';
import { validate } from '../../middleware/validate.js';
import { entitlementStateSql } from '../../services/entitlement.service.js';

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);
router.use(requirePlatformRole(PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.FINANCE));

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

router.get(
  '/',
  validate({ query: z.object({ months: z.coerce.number().int().min(3).max(24).optional() }) }),
  async (req, res, next) => {
    try {
      const months = req.query.months ?? 12;
      const now = new Date();
      const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

      /*
       * Revenue by calendar month, from captured money rather than from what was charged:
       * COALESCE(amount_captured, amount) less refunds is what actually reached the bank.
       * date_trunc groups in the database's timezone, which is UTC here -- close enough for a
       * monthly figure, and stated so nobody reconciles it against an IST ledger to the rupee.
       */
      const revenue = await prisma.$queryRawUnsafe(
        `SELECT to_char(date_trunc('month', COALESCE(paid_at, created_at)), 'YYYY-MM') AS month,
                SUM(COALESCE(amount_captured, amount) - COALESCE(amount_refunded, 0))::float8 AS revenue,
                COUNT(*)::int AS payments
         FROM payments
         WHERE status = 'PAID' AND COALESCE(paid_at, created_at) >= $1
         GROUP BY 1 ORDER BY 1`,
        since,
      );

      const signups = await prisma.$queryRawUnsafe(
        `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS stores
         FROM organizations
         WHERE created_at >= $1
         GROUP BY 1 ORDER BY 1`,
        since,
      );

      /*
       * Churn: subscriptions cancelled in each month, against how many were live at the start
       * of it. Counting cancellations alone would make a good month look bad simply because
       * the platform grew.
       */
      const churn = await prisma.$queryRawUnsafe(
        `SELECT to_char(date_trunc('month', cancelled_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS cancelled
         FROM subscriptions
         WHERE cancelled_at IS NOT NULL AND cancelled_at >= $1
         GROUP BY 1 ORDER BY 1`,
        since,
      );

      /*
       * MRR from live subscriptions.
       *
       * No interval conversion is needed: price_per_user is already a per-user, per-MONTH
       * rate on both intervals -- the yearly plan's 550 is "550 a month, billed yearly", not
       * 550 a year. So seats x rate is the monthly figure either way.
       *
       * Only states that are genuinely paying count. A suspended, expired or cancelled store
       * is not revenue, however recently it paid.
       */
      const mrrRows = await prisma.$queryRawUnsafe(
        `SELECT SUM(s.price_per_user * s.seats)::float8 AS mrr,
                COUNT(*)::int AS paying
         FROM subscriptions s
         WHERE ${entitlementStateSql({ sub: 's' })} IN ('ACTIVE', 'PAST_DUE')`,
      );

      const byState = await prisma.$queryRawUnsafe(
        `SELECT ${entitlementStateSql({ sub: 's' })} AS state, COUNT(*)::int AS stores
         FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
         GROUP BY 1 ORDER BY 2 DESC`,
      );

      const byPlan = await prisma.$queryRawUnsafe(
        `SELECT s.plan::text AS plan, COUNT(*)::int AS stores,
                SUM(s.price_per_user * s.seats)::float8 AS monthly
         FROM subscriptions s
         WHERE ${entitlementStateSql({ sub: 's' })} IN ('ACTIVE', 'PAST_DUE')
         GROUP BY 1 ORDER BY 2 DESC`,
      );

      const topStores = await prisma.$queryRawUnsafe(
        `SELECT o.id, o.name, o.city,
                SUM(COALESCE(p.amount_captured, p.amount) - COALESCE(p.amount_refunded, 0))::float8 AS billed
         FROM payments p JOIN organizations o ON o.id = p.organization_id
         WHERE p.status = 'PAID' AND COALESCE(p.paid_at, p.created_at) >= $1
         GROUP BY o.id, o.name, o.city
         ORDER BY billed DESC NULLS LAST
         LIMIT 10`,
        since,
      );

      // One row per month across the window, so a month with no activity is a zero rather
      // than a gap the chart silently closes up.
      const labels = [];
      for (let i = 0; i < months; i += 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      const pick = (rows, key) => {
        const by = Object.fromEntries(rows.map((r) => [r.month, r]));
        return labels.map((m) => num(by[m]?.[key]));
      };

      return res.json({
        months: labels,
        revenue: pick(revenue, 'revenue'),
        payments: pick(revenue, 'payments'),
        signups: pick(signups, 'stores'),
        cancellations: pick(churn, 'cancelled'),
        mrr: num(mrrRows[0]?.mrr),
        payingStores: num(mrrRows[0]?.paying),
        byState: byState.map((r) => ({ state: r.state, stores: r.stores })),
        byPlan: byPlan.map((r) => ({ plan: r.plan, stores: r.stores, monthly: num(r.monthly) })),
        topStores: topStores.map((r) => ({
          id: r.id,
          name: r.name,
          city: r.city,
          billed: num(r.billed),
        })),
        generatedAt: now,
      });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
