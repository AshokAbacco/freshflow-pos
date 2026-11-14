/**
 * /api/v1/platform/stores
 *
 * Reading a store is open to every platform role. Changing one -- extending, moving plan,
 * suspending, reactivating, cancelling -- is SUPER_ADMIN only, always needs a written reason,
 * and always lands in both the audit log and the store's subscription timeline.
 *
 * Nothing here can touch a store's bills, stock or customers. Support staff get visibility,
 * not the ability to edit a shop's trading records.
 */
import { Router } from 'express';
import { z } from 'zod';
import { PLANS, MAX_SEATS, MIN_SEATS } from '../../config/plans.js';
import { prisma } from '../../lib/prisma.js';
import {
  PLATFORM_ROLES,
  authenticatePlatform,
  rejectStoreToken,
  requirePlatformRole,
  requireReason,
} from '../../middleware/platform-auth.js';
import { validate } from '../../middleware/validate.js';
import { AUDIT, writeAudit, writeSubscriptionEvent } from '../../services/audit.service.js';
import {
  STATES,
  checkUsageFitsLimits,
  evaluateEntitlement,
} from '../../services/entitlement.service.js';
import { SORT_KEYS, listStores, listStoresForExport, storesToCsv } from '../../services/store-directory.service.js';
import { HttpError } from '../../utils/http.js';

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

const SUPER = PLATFORM_ROLES.SUPER_ADMIN;
const FINANCE = PLATFORM_ROLES.FINANCE;
const DAY_MS = 86_400_000;

const listSchema = {
  query: z.object({
    q: z.string().trim().max(120).optional(),
    state: z.union([z.string(), z.array(z.string())]).optional(),
    plan: z.union([z.string(), z.array(z.string())]).optional(),
    businessType: z.union([z.string(), z.array(z.string())]).optional(),
    endingWithin: z.coerce.number().int().min(1).max(365).optional(),
    inactiveDays: z.coerce.number().int().min(1).max(3650).optional(),
    city: z.string().trim().max(80).optional(),
    region: z.string().trim().max(80).optional(),
    joinedFrom: z.string().datetime().optional(),
    joinedTo: z.string().datetime().optional(),
    hasOpenFollowUps: z.enum(['true', 'false']).optional(),
    sort: z.enum(SORT_KEYS).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
    format: z.enum(['json', 'csv']).optional(),
  }),
};

router.get('/', validate(listSchema), async (req, res, next) => {
  try {
    const { format, sort, page, pageSize, ...filters } = req.query;

    if (format === 'csv') {
      // The export carries owner names, emails and phone numbers out of the system, so it is
      // not something a support login should be able to do unsupervised.
      if (![SUPER, FINANCE].includes(req.platformAdmin.role)) {
        throw new HttpError(403, 'Exporting the store list needs a super admin or finance role', 'FORBIDDEN');
      }
      const stores = await listStoresForExport(filters, { sort });
      await writeAudit({
        req,
        action: 'stores.exported',
        reason: 'CSV export',
        changes: { rows: stores.length, filters },
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="stores-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(storesToCsv(stores));
    }

    const result = await listStores(filters, { sort, page, pageSize });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

/** Loads a store with everything the detail page shows, or 404s. */
async function loadStore(id) {
  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      subscription: true,
      settings: true,
    },
  });
  if (!organization) throw new HttpError(404, 'No store with that id', 'NOT_FOUND');
  return organization;
}

router.get('/:id', async (req, res, next) => {
  try {
    const organization = await loadStore(req.params.id);
    const entitlement = evaluateEntitlement(organization, organization.subscription, new Date());

    const [users, products, billsThisMonth, payments, timeline, notes, followUps] = await Promise.all([
      prisma.user.count({ where: { organizationId: organization.id, isActive: true } }),
      prisma.product.count({ where: { organizationId: organization.id, isActive: true } }),
      prisma.transaction.count({
        where: {
          organizationId: organization.id,
          status: 'COMPLETED',
          soldAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      prisma.payment.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.subscriptionEvent.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.tenantNote.findMany({
        where: { organizationId: organization.id },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      prisma.followUp.findMany({
        where: { organizationId: organization.id, status: 'OPEN' },
        orderBy: { dueAt: 'asc' },
        include: { assignee: { select: { id: true, name: true } } },
      }),
    ]);

    const seats = organization.subscription?.seats ?? 0;

    return res.json({
      store: {
        id: organization.id,
        name: organization.name,
        legalName: organization.legalName,
        businessType: organization.businessType,
        city: organization.city,
        region: organization.state,
        createdAt: organization.createdAt,
        lastActiveAt: organization.lastActiveAt,
        gstin: organization.settings?.gstin ?? null,
        address: organization.settings?.address ?? null,
        phone: organization.settings?.phone ?? null,
      },
      entitlement: {
        state: entitlement.state,
        canWrite: entitlement.canWrite,
        reason: entitlement.reason,
        daysLeft: entitlement.daysLeft,
        periodEnd: entitlement.periodEnd,
        graceEndsAt: entitlement.graceEndsAt,
      },
      subscription: organization.subscription
        ? {
            plan: organization.subscription.plan,
            interval: organization.subscription.interval,
            seats,
            pricePerUser: Number(organization.subscription.pricePerUser),
            currency: organization.subscription.currency,
            storedStatus: organization.subscription.status,
            trialEndsAt: organization.subscription.trialEndsAt,
            currentPeriodEnd: organization.subscription.currentPeriodEnd,
            graceEndsAt: organization.subscription.graceEndsAt,
            suspendedAt: organization.subscription.suspendedAt,
            suspendedReason: organization.subscription.suspendedReason,
            cancelledAt: organization.subscription.cancelledAt,
            lastPaymentAt: organization.subscription.lastPaymentAt,
          }
        : null,
      usage: {
        users,
        seats,
        seatsLeft: Math.max(0, seats - users),
        products,
        billsThisMonth,
      },
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        amountCaptured: p.amountCaptured === null ? null : Number(p.amountCaptured),
        amountRefunded: Number(p.amountRefunded),
        currency: p.currency,
        status: p.status,
        method: p.method,
        plan: p.plan,
        interval: p.interval,
        seats: p.seats,
        orderId: p.razorpayOrderId,
        paymentId: p.razorpayPaymentId,
        failureReason: p.failureReason,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      timeline,
      notes,
      followUps,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/users', async (req, res, next) => {
  try {
    await loadStore(req.params.id);
    const users = await prisma.user.findMany({
      where: { organizationId: req.params.id },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/activity', async (req, res, next) => {
  try {
    await loadStore(req.params.id);
    const entries = await prisma.auditLog.findMany({
      where: { organizationId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Number(req.query.limit) || 100),
      select: {
        id: true, action: true, actorLabel: true, actorRole: true,
        reason: true, changes: true, targetType: true, createdAt: true,
      },
    });
    return res.json({ entries });
  } catch (err) {
    return next(err);
  }
});

// ------------------------------------------------------------------ notes

router.post(
  '/:id/notes',
  validate({ body: z.object({ body: z.string().trim().min(1).max(4000), pinned: z.boolean().optional() }) }),
  async (req, res, next) => {
    try {
      await loadStore(req.params.id);
      const note = await prisma.tenantNote.create({
        data: {
          organizationId: req.params.id,
          authorAdminId: req.platformAdmin.id,
          authorLabel: `${req.platformAdmin.name} <${req.platformAdmin.email}>`,
          body: req.body.body,
          pinned: Boolean(req.body.pinned),
        },
      });
      await writeAudit({
        req,
        action: AUDIT.NOTE_ADDED,
        organizationId: req.params.id,
        targetType: 'note',
        targetId: note.id,
        reason: 'Internal note',
      });
      return res.status(201).json({ note });
    } catch (err) {
      return next(err);
    }
  },
);

router.delete('/:id/notes/:noteId', async (req, res, next) => {
  try {
    const note = await prisma.tenantNote.findUnique({ where: { id: req.params.noteId } });
    if (!note || note.organizationId !== req.params.id) {
      throw new HttpError(404, 'No such note on this store', 'NOT_FOUND');
    }
    // Support staff may tidy up their own notes; only a super admin may remove someone else's.
    if (note.authorAdminId !== req.platformAdmin.id && req.platformAdmin.role !== SUPER) {
      throw new HttpError(403, 'Only a super admin can delete another person’s note', 'FORBIDDEN');
    }
    await prisma.tenantNote.delete({ where: { id: note.id } });
    await writeAudit({
      req,
      action: AUDIT.NOTE_DELETED,
      organizationId: req.params.id,
      targetType: 'note',
      targetId: note.id,
      reason: 'Internal note removed',
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------- actions
//
// Each of these changes what a shop can do, so every one is SUPER_ADMIN, needs a reason, and
// writes the subscription event and the subscription row in the same transaction -- a timeline
// that disagrees with the subscription it describes is worse than no timeline at all.

const requireSub = (organization) => {
  if (!organization.subscription) {
    throw new HttpError(409, 'This store has no subscription to change', 'NO_SUBSCRIPTION');
  }
  return organization.subscription;
};

router.post(
  '/:id/extend',
  requirePlatformRole(SUPER),
  requireReason,
  validate({ body: z.object({ days: z.coerce.number().int().min(1).max(365), reason: z.string() }) }),
  async (req, res, next) => {
    try {
      const organization = await loadStore(req.params.id);
      const sub = requireSub(organization);
      const { days } = req.body;

      /*
       * Extend from whichever is later: the current end, or now. Extending from a date that
       * has already passed would silently give less time than asked for -- "+7 days" on a plan
       * that ended a fortnight ago would still leave it expired.
       */
      const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
      const nextEnd = new Date(+base + days * DAY_MS);
      const onTrial = sub.status === 'TRIALING';

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.subscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodEnd: nextEnd,
            ...(onTrial ? { trialEndsAt: nextEnd } : {}),
            // An extension is a decision to keep the store trading, so the lapse window goes.
            graceEndsAt: null,
            status: onTrial ? 'TRIALING' : 'ACTIVE',
          },
        });
        await writeSubscriptionEvent(tx, {
          organizationId: organization.id,
          type: 'EXTENDED',
          req,
          fromStatus: sub.status,
          toStatus: next.status,
          periodEnd: nextEnd,
        });
        return next;
      });

      await writeAudit({
        req,
        action: AUDIT.STORE_EXTENDED,
        organizationId: organization.id,
        targetType: 'subscription',
        targetId: sub.id,
        changes: { days, from: sub.currentPeriodEnd, to: nextEnd },
      });

      return res.json({ subscription: updated });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/:id/change-plan',
  requirePlatformRole(SUPER),
  requireReason,
  validate({
    body: z.object({
      plan: z.enum(['TRIAL', 'STANDARD', 'CUSTOM']),
      interval: z.enum(['MONTHLY', 'YEARLY']).optional(),
      seats: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS).optional(),
      reason: z.string(),
    }),
  }),
  async (req, res, next) => {
    try {
      const organization = await loadStore(req.params.id);
      const sub = requireSub(organization);
      const { plan, interval = sub.interval, seats = sub.seats } = req.body;

      /*
       * The store must fit the plan it is being moved to, on every limit that plan sets --
       * seats first, then whatever the Plan row caps. A null limit means unlimited and is
       * skipped by checkUsageFitsLimits.
       */
      const [activeUsers, products, billsThisMonth, planRow] = await Promise.all([
        prisma.user.count({ where: { organizationId: organization.id, isActive: true } }),
        prisma.product.count({ where: { organizationId: organization.id, isActive: true } }),
        prisma.transaction.count({
          where: {
            organizationId: organization.id,
            status: 'COMPLETED',
            soldAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        }),
        prisma.plan.findUnique({ where: { code: plan } }),
      ]);

      if (planRow && (planRow.retiredAt || !planRow.isActive)) {
        throw new HttpError(
          409,
          `${planRow.name} is retired and cannot be sold. Pick a current plan.`,
          'PLAN_RETIRED',
        );
      }

      const limits = {
        users: seats,
        products: planRow?.maxProducts ?? null,
        billsPerMonth: planRow?.maxBillsPerMonth ?? null,
      };
      const fit = checkUsageFitsLimits(
        { users: activeUsers, products, billsPerMonth: billsThisMonth },
        limits,
      );
      if (!fit.ok) {
        const worst = fit.violations[0];
        const WORDING = {
          users: `${activeUsers} active staff accounts and that plan allows ${seats}. Deactivate someone first, or choose more seats`,
          products: `${products} products and that plan allows ${limits.products}`,
          billsPerMonth: `${billsThisMonth} bills this month and that plan allows ${limits.billsPerMonth}`,
        };
        throw new HttpError(
          409,
          `This store has ${WORDING[worst.key] ?? `more ${worst.key} than that plan allows`}.`,
          'USAGE_EXCEEDS_PLAN',
          { violations: fit.violations },
        );
      }

      /*
       * Price comes from the Plan row when there is one, falling back to the hardcoded
       * catalogue so a database without the plans migration still prices correctly.
       */
      const pricePerUser = planRow
        ? Number(interval === 'YEARLY' ? planRow.yearlyPrice : planRow.monthlyPrice)
        : (PLANS[plan]?.intervals?.[interval]?.price ?? 0);

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.subscription.update({
          where: { id: sub.id },
          data: { plan, interval, seats, pricePerUser },
        });
        await writeSubscriptionEvent(tx, {
          organizationId: organization.id,
          type: 'PLAN_CHANGED',
          req,
          fromPlan: sub.plan,
          toPlan: plan,
          fromStatus: sub.status,
          toStatus: next.status,
        });
        return next;
      });

      await writeAudit({
        req,
        action: AUDIT.STORE_PLAN_CHANGED,
        organizationId: organization.id,
        targetType: 'subscription',
        targetId: sub.id,
        changes: {
          plan: { from: sub.plan, to: plan },
          interval: { from: sub.interval, to: interval },
          seats: { from: sub.seats, to: seats },
        },
      });

      return res.json({ subscription: updated });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/:id/suspend',
  requirePlatformRole(SUPER),
  requireReason,
  validate({ body: z.object({ reason: z.string() }) }),
  async (req, res, next) => {
    try {
      const organization = await loadStore(req.params.id);
      const sub = requireSub(organization);
      if (sub.suspendedAt) throw new HttpError(409, 'This store is already suspended', 'ALREADY_SUSPENDED');

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.subscription.update({
          where: { id: sub.id },
          data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: req.actionReason },
        });
        await writeSubscriptionEvent(tx, {
          organizationId: organization.id,
          type: 'SUSPENDED',
          req,
          fromStatus: sub.status,
          toStatus: 'SUSPENDED',
        });
        return next;
      });

      await writeAudit({
        req,
        action: AUDIT.STORE_SUSPENDED,
        organizationId: organization.id,
        targetType: 'subscription',
        targetId: sub.id,
        changes: { from: sub.status },
      });

      return res.json({ subscription: updated });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/:id/reactivate',
  requirePlatformRole(SUPER),
  requireReason,
  validate({ body: z.object({ reason: z.string() }) }),
  async (req, res, next) => {
    try {
      const organization = await loadStore(req.params.id);
      const sub = requireSub(organization);
      if (!sub.suspendedAt && sub.status !== 'SUSPENDED') {
        throw new HttpError(409, 'This store is not suspended', 'NOT_SUSPENDED');
      }

      const updated = await prisma.$transaction(async (tx) => {
        const cleared = await tx.subscription.update({
          where: { id: sub.id },
          data: { suspendedAt: null, suspendedReason: null, status: 'ACTIVE' },
        });
        /*
         * Lifting the suspension does not grant time. The entitlement engine decides what the
         * store can actually do from its dates, so a reactivated store whose plan lapsed while
         * it was suspended comes back as expired, not active.
         */
        const settled = evaluateEntitlement(organization, { ...cleared }, new Date());
        const next =
          settled.state === STATES.ACTIVE
            ? cleared
            : await tx.subscription.update({
                where: { id: sub.id },
                data: { status: settled.state === STATES.TRIAL ? 'TRIALING' : settled.state === STATES.GRACE_PERIOD ? 'GRACE_PERIOD' : 'EXPIRED' },
              });

        await writeSubscriptionEvent(tx, {
          organizationId: organization.id,
          type: 'REACTIVATED',
          req,
          fromStatus: 'SUSPENDED',
          toStatus: next.status,
        });
        return next;
      });

      await writeAudit({
        req,
        action: AUDIT.STORE_REACTIVATED,
        organizationId: organization.id,
        targetType: 'subscription',
        targetId: sub.id,
        changes: { suspendedSince: sub.suspendedAt, nowStatus: updated.status },
      });

      return res.json({ subscription: updated });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/:id/cancel',
  requirePlatformRole(SUPER),
  requireReason,
  validate({ body: z.object({ reason: z.string() }) }),
  async (req, res, next) => {
    try {
      const organization = await loadStore(req.params.id);
      const sub = requireSub(organization);
      if (sub.cancelledAt) throw new HttpError(409, 'This store is already cancelled', 'ALREADY_CANCELLED');

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.subscription.update({
          where: { id: sub.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        await writeSubscriptionEvent(tx, {
          organizationId: organization.id,
          type: 'CANCELLED',
          req,
          fromStatus: sub.status,
          toStatus: 'CANCELLED',
        });
        return next;
      });

      await writeAudit({
        req,
        action: AUDIT.STORE_CANCELLED,
        organizationId: organization.id,
        targetType: 'subscription',
        targetId: sub.id,
        changes: { from: sub.status },
      });

      return res.json({ subscription: updated });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
