/**
 * /api/v1/platform/settings  and  /api/v1/platform/health
 *
 * Settings are the handful of numbers that change how the platform behaves -- how long the
 * grace period runs, how many days before a renewal to raise a follow-up. They are stored as
 * rows rather than environment variables so changing one does not need a redeploy, and every
 * change is audited because they alter what happens to paying customers.
 *
 * Only keys in the schema below can be written. A settings endpoint that accepts any key is a
 * way to write arbitrary JSON into the database.
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
import { AUDIT, writeAudit } from '../../services/audit.service.js';
import { DEFAULT_GRACE_DAYS } from '../../services/entitlement.service.js';
import { HttpError } from '../../utils/http.js';

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

/**
 * The only settings that exist. Each says what it does in words the person changing it will
 * read, because "graceDays: 7" on its own does not tell you that it decides whether a shop
 * can still take money tomorrow.
 */
export const SETTING_SCHEMA = {
  graceDays: {
    label: 'Grace period',
    help: 'How many days a store can keep selling after its plan lapses, before it stops.',
    unit: 'days',
    type: 'number',
    min: 0,
    max: 90,
    default: DEFAULT_GRACE_DAYS,
  },
  renewalNoticeDays: {
    label: 'Renewal follow-up',
    help: 'How many days before a plan ends to raise a follow-up to chase it.',
    unit: 'days',
    type: 'number',
    min: 1,
    max: 90,
    default: 7,
  },
  inactiveAfterDays: {
    label: 'Counts as quiet',
    help: 'A store with no activity for this long is treated as quiet and shows in that filter.',
    unit: 'days',
    type: 'number',
    min: 1,
    max: 365,
    default: 14,
  },
  trialDays: {
    label: 'Trial length',
    help: 'How long a new store gets before it has to pay. Only affects stores signing up from now on.',
    unit: 'days',
    type: 'number',
    min: 1,
    max: 180,
    default: 30,
  },
  supportEmail: {
    label: 'Support email',
    help: 'Shown to stores in the app when they need help.',
    type: 'string',
    maxLength: 190,
    default: '',
  },
  supportPhone: {
    label: 'Support phone',
    help: 'Shown to stores in the app when they need help.',
    type: 'string',
    maxLength: 32,
    default: '',
  },
};

router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.platformSetting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return res.json({
      settings: Object.entries(SETTING_SCHEMA).map(([key, meta]) => ({
        key,
        ...meta,
        // A setting that has never been written reports the default and says so, rather than
        // showing a blank that looks like it means zero.
        value: key in stored ? stored[key] : meta.default,
        isDefault: !(key in stored),
        updatedAt: rows.find((r) => r.key === key)?.updatedAt ?? null,
        updatedBy: rows.find((r) => r.key === key)?.updatedBy ?? null,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.patch(
  '/',
  requirePlatformRole(PLATFORM_ROLES.SUPER_ADMIN),
  validate({ body: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])) }),
  async (req, res, next) => {
    try {
      const entries = Object.entries(req.body);
      if (!entries.length) throw new HttpError(400, 'Nothing to change', 'NO_CHANGE');

      const changes = {};
      for (const [key, raw] of entries) {
        const meta = SETTING_SCHEMA[key];
        // Refusing unknown keys is the whole reason this endpoint has a schema.
        if (!meta) throw new HttpError(400, `"${key}" is not a platform setting`, 'UNKNOWN_SETTING');

        let value = raw;
        if (meta.type === 'number') {
          value = Number(raw);
          if (!Number.isFinite(value)) {
            throw new HttpError(400, `${meta.label} must be a number`, 'BAD_VALUE');
          }
          if (value < meta.min || value > meta.max) {
            throw new HttpError(
              400,
              `${meta.label} must be between ${meta.min} and ${meta.max} ${meta.unit ?? ''}`.trim(),
              'BAD_VALUE',
            );
          }
          value = Math.trunc(value);
        } else {
          value = String(raw ?? '');
          if (meta.maxLength && value.length > meta.maxLength) {
            throw new HttpError(400, `${meta.label} is too long`, 'BAD_VALUE');
          }
        }
        changes[key] = value;
      }

      const label = `${req.platformAdmin.name} <${req.platformAdmin.email}>`;
      await prisma.$transaction(
        Object.entries(changes).map(([key, value]) =>
          prisma.platformSetting.upsert({
            where: { key },
            create: { key, value, updatedBy: label },
            update: { value, updatedBy: label },
          }),
        ),
      );

      await writeAudit({
        req,
        action: AUDIT.SETTING_CHANGED,
        targetType: 'platform_setting',
        reason: `Changed ${Object.keys(changes).join(', ')}`,
        changes,
      });

      return res.json({ ok: true, changed: changes });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;

/* -------------------------------------------------------------- system health */

export const healthRouter = Router();
healthRouter.use(rejectStoreToken, authenticatePlatform);

/**
 * Is anything broken right now?
 *
 * Deliberately a small number of checks that each mean something concrete, rather than a wall
 * of green ticks. Each one names what is wrong and how many, so it can be acted on without
 * opening a database client.
 */
healthRouter.get('/', async (_req, res, next) => {
  try {
    const now = new Date();
    const dayAgo = new Date(+now - 86_400_000);
    const weekAgo = new Date(+now - 7 * 86_400_000);

    const started = Date.now();
    await prisma.$queryRawUnsafe('SELECT 1');
    const dbLatencyMs = Date.now() - started;

    const [
      unhandledWebhooks,
      recentWebhookFailures,
      paidWithoutCapture,
      overdueFollowUps,
      storesNoSubscription,
      failedLogins24h,
      lockedAdmins,
      unreadReplies,
    ] = await Promise.all([
      prisma.webhookEvent.count({ where: { handled: false } }),
      prisma.webhookEvent.count({ where: { handled: false, receivedAt: { gte: dayAgo } } }),
      prisma.payment.count({ where: { status: 'PAID', amountCaptured: null } }),
      prisma.followUp.count({ where: { status: 'OPEN', dueAt: { lt: now } } }),
      prisma.organization.count({ where: { subscription: { is: null } } }),
      prisma.auditLog.count({ where: { action: 'platform.login_failed', createdAt: { gte: dayAgo } } }),
      prisma.platformAdmin.count({ where: { lockedUntil: { gt: now } } }),
      prisma.storeMessageReply.count({ where: { handledAt: null } }),
    ]);

    /** A check is bad when it needs someone to do something, not when a number is non-zero. */
    const checks = [
      {
        key: 'database',
        label: 'Database',
        ok: dbLatencyMs < 500,
        detail: `Responded in ${dbLatencyMs}ms`,
      },
      {
        key: 'webhooks',
        label: 'Razorpay webhooks',
        ok: recentWebhookFailures === 0,
        detail: unhandledWebhooks
          ? `${unhandledWebhooks} unprocessed (${recentWebhookFailures} in the last 24 hours)`
          : 'All callbacks processed',
        link: '/platform/webhooks',
      },
      {
        key: 'capture',
        label: 'Payment capture',
        ok: paidWithoutCapture === 0,
        detail: paidWithoutCapture
          ? `${paidWithoutCapture} marked paid with nothing captured`
          : 'Every paid charge captured in full',
        link: '/platform/payments?mismatched=true',
      },
      {
        key: 'followups',
        label: 'Follow-ups',
        ok: overdueFollowUps === 0,
        detail: overdueFollowUps ? `${overdueFollowUps} overdue` : 'Nothing overdue',
        link: '/platform/follow-ups?overdue=true',
      },
      {
        key: 'inbox',
        label: 'Store replies',
        ok: unreadReplies === 0,
        detail: unreadReplies ? `${unreadReplies} waiting for an answer` : 'Inbox clear',
        link: '/platform/inbox',
      },
      {
        key: 'subscriptions',
        label: 'Subscriptions',
        ok: storesNoSubscription === 0,
        detail: storesNoSubscription
          ? `${storesNoSubscription} stores have no subscription row and cannot sell`
          : 'Every store has a subscription',
      },
      {
        key: 'signin',
        label: 'Platform sign-in',
        // A handful of typos is normal; a burst is worth looking at.
        ok: failedLogins24h < 20 && lockedAdmins === 0,
        detail:
          lockedAdmins > 0
            ? `${lockedAdmins} account${lockedAdmins === 1 ? '' : 's'} locked out`
            : `${failedLogins24h} failed sign-ins in the last 24 hours`,
      },
    ];

    const [stores, activeStores, bills7d] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { lastActiveAt: { gte: weekAgo } } }),
      prisma.transaction.count({ where: { status: 'COMPLETED', soldAt: { gte: weekAgo } } }),
    ]);

    return res.json({
      ok: checks.every((c) => c.ok),
      checks,
      scale: { stores, activeStores, billsLast7Days: bills7d },
      checkedAt: now,
    });
  } catch (err) {
    return next(err);
  }
});
