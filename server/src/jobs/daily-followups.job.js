/**
 * Raises the follow-ups the support desk works from.
 *
 * The Follow-ups page tells the operator that renewals and failed payments appear here
 * automatically. Until this job existed that was not true: the list only ever held what
 * somebody typed in by hand, so a renewal nobody happened to notice was simply missed.
 *
 * Safe to run as often as you like. Every row carries an `autoKey` with a unique index, so a
 * second run — a retry, an overlapping cron, two servers both firing at midnight — creates
 * nothing new. That is why the key includes the date it is about rather than the date it ran:
 * the same renewal on the same day is the same chase.
 *
 * Run it from cron, a scheduler, or by hand:
 *
 *     node src/jobs/daily-followups.job.js
 */
import { prisma } from "../lib/prisma.js";
import { AUDIT, writeAudit } from "../services/audit.service.js";
import {
  STATES,
  evaluateEntitlement,
} from "../services/entitlement.service.js";
import { getPlatformSettings } from "../services/platform-settings.service.js";

const DAY_MS = 86_400_000;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Creates one follow-up unless its key already exists.
 * @returns {Promise<boolean>} true when a row was actually created
 */
async function raise({
  organizationId,
  autoKey,
  title,
  type,
  priority,
  dueAt,
}) {
  try {
    await prisma.followUp.create({
      data: {
        organizationId,
        autoKey,
        title,
        type,
        priority,
        dueAt,
        status: "OPEN",
      },
    });
    return true;
  } catch (err) {
    // P2002 is the unique index on autoKey doing its job: this chase already exists.
    if (err?.code === "P2002") return false;
    throw err;
  }
}

export async function runDailyFollowUps({
  now = new Date(),
  log = () => {},
} = {}) {
  const settings = await getPlatformSettings({ fresh: true });
  const created = { renewals: 0, failedPayments: 0, quiet: 0, lapsed: 0 };

  const organizations = await prisma.organization.findMany({
    include: { subscription: true },
  });

  for (const org of organizations) {
    const entitlement = evaluateEntitlement(org, org.subscription, now, {
      graceDays: settings.graceDays,
    });

    // A suspended or cancelled store is not something to chase; somebody already decided.
    if (
      entitlement.state === STATES.SUSPENDED ||
      entitlement.state === STATES.CANCELLED
    )
      continue;

    const endsAt =
      org.subscription?.currentPeriodEnd ??
      org.subscription?.trialEndsAt ??
      null;

    /* 1. Renewals coming up inside the notice window. */
    if (endsAt) {
      const daysLeft = Math.ceil((new Date(endsAt).getTime() - +now) / DAY_MS);
      if (daysLeft > 0 && daysLeft <= settings.renewalNoticeDays) {
        const onTrial = entitlement.state === STATES.TRIAL;
        const made = await raise({
          organizationId: org.id,
          autoKey: `RENEWAL:${org.id}:${dayKey(endsAt)}`,
          title: onTrial
            ? `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — convert them`
            : `Renewal due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          type: "RENEWAL",
          priority: daysLeft <= 2 ? "HIGH" : "NORMAL",
          // Due a day before it lapses, so there is still time to do something about it.
          dueAt: new Date(Math.max(+now, new Date(endsAt).getTime() - DAY_MS)),
        });
        if (made) created.renewals += 1;
      }
    }

    /* 2. Already lapsed and inside grace — the most valuable call of the day. */
    if (entitlement.state === STATES.GRACE_PERIOD) {
      const made = await raise({
        organizationId: org.id,
        autoKey: `LAPSED:${org.id}:${dayKey(endsAt ?? now)}`,
        title: "Plan has lapsed — in grace, still selling",
        type: "RENEWAL",
        priority: "HIGH",
        dueAt: now,
      });
      if (made) created.lapsed += 1;
    }

    /* 3. Gone quiet: paying but not actually using it, which is how churn starts. */
    const lastActive = org.lastActiveAt
      ? new Date(org.lastActiveAt).getTime()
      : null;
    const quietFor =
      lastActive === null ? null : Math.floor((+now - lastActive) / DAY_MS);
    const paying =
      entitlement.state === STATES.ACTIVE ||
      entitlement.state === STATES.PAST_DUE;
    if (paying && quietFor !== null && quietFor >= settings.inactiveAfterDays) {
      const made = await raise({
        organizationId: org.id,
        // Keyed to the week, so a shop that stays quiet is chased weekly, not daily.
        autoKey: `QUIET:${org.id}:${dayKey(+now - (+now % (7 * DAY_MS)))}`,
        title: `No activity for ${quietFor} days — check they are still trading`,
        type: "SUPPORT_ISSUE",
        priority: "NORMAL",
        dueAt: now,
      });
      if (made) created.quiet += 1;
    }
  }

  /* 4. Payments that failed since yesterday. */
  const failed = await prisma.payment.findMany({
    where: { status: "FAILED", createdAt: { gte: new Date(+now - DAY_MS) } },
    select: {
      id: true,
      organizationId: true,
      amount: true,
      failureReason: true,
      createdAt: true,
    },
  });

  for (const payment of failed) {
    const made = await raise({
      organizationId: payment.organizationId,
      // Keyed to the payment, so one failed charge is chased once however often this runs.
      autoKey: `PAYMENT_FAILED:${payment.id}`,
      title: payment.failureReason
        ? `Payment failed — ${payment.failureReason}`
        : "Payment failed",
      type: "PAYMENT_FAILED",
      priority: "HIGH",
      dueAt: now,
    });
    if (made) created.failedPayments += 1;
  }

  const total = Object.values(created).reduce((t, n) => t + n, 0);

  if (total > 0) {
    await writeAudit({
      actor: { label: "cron:daily-followups" },
      action: AUDIT.FOLLOWUP_CREATED,
      targetType: "follow_up",
      reason: "Daily follow-up sweep",
      changes: created,
    });
  }

  log(
    `daily-followups: ${total} raised (${created.renewals} renewals, ${created.lapsed} lapsed, ` +
      `${created.failedPayments} failed payments, ${created.quiet} quiet)`,
  );
  return created;
}

// Running the file directly is the supported way to drive this from cron.
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  runDailyFollowUps({ log: console.log })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("daily-followups failed:", err);
      process.exit(1);
    });
}
