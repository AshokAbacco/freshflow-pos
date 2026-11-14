/**
 * The audit trail.
 *
 * Every platform action that changes a store's money, access or users lands here with the
 * reason the operator typed. Two rules shape this file:
 *
 *   1. Writing an audit entry must never fail the action it describes. A logging outage is
 *      not a reason to leave a refund half-applied, so failures are swallowed and reported
 *      to stderr. Where the audit entry genuinely must be atomic with the change, pass the
 *      transaction client as `tx` and it is written inside it.
 *   2. Nothing secret goes in. `changes` is a small before/after summary, never a row dump,
 *      and a fixed deny-list strips anything that looks like a credential.
 */
import { prisma } from "../lib/prisma.js";

export const AUDIT = Object.freeze({
  LOGIN: "platform.login",
  LOGIN_FAILED: "platform.login_failed",
  LOGOUT: "platform.logout",
  SESSIONS_REVOKED: "platform.sessions_revoked",
  PASSWORD_RESET_REQUESTED: "platform.password_reset_requested",
  PASSWORD_RESET: "platform.password_reset",

  STORE_EXTENDED: "store.extended",
  STORE_PLAN_CHANGED: "store.plan_changed",
  STORE_SUSPENDED: "store.suspended",
  STORE_REACTIVATED: "store.reactivated",
  STORE_CANCELLED: "store.cancelled",

  STORE_USER_SIGNED_OUT: "store_user.signed_out",
  STORE_USER_RESET_LINK: "store_user.reset_link_sent",
  STORE_USER_DISABLED: "store_user.disabled",
  STORE_USER_ENABLED: "store_user.enabled",

  NOTE_ADDED: "note.added",
  NOTE_DELETED: "note.deleted",
  FOLLOWUP_CREATED: "followup.created",
  FOLLOWUP_CLOSED: "followup.closed",

  PAYMENT_REFUNDED: "payment.refunded",
  WEBHOOK_RETRIED: "webhook.retried",

  PLAN_CREATED: "plan.created",
  PLAN_UPDATED: "plan.updated",
  PLAN_RETIRED: "plan.retired",

  MESSAGE_SENT: "message.sent",
  SETTING_CHANGED: "setting.changed",
  ADMIN_CREATED: "platform_admin.created",
  ADMIN_UPDATED: "platform_admin.updated",
});

/** Keys never worth storing, however they arrive. */
const DENY = /pass|secret|token|hash|otp|signature|key|authorization|cookie/i;

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 3) return "[deep]";
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = DENY.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500)
    return `${value.slice(0, 500)}…`;
  return value;
}

/**
 * @param {object} params
 * @param {object} [params.req]            supplies actor, ip and user agent
 * @param {string} params.action           one of AUDIT
 * @param {string} [params.organizationId] the store affected, when there is one
 * @param {string} [params.targetType]     e.g. 'subscription', 'user', 'payment'
 * @param {string} [params.targetId]
 * @param {string} [params.reason]         defaults to req.actionReason
 * @param {object} [params.changes]        small before/after summary
 * @param {object} [params.actor]          for jobs: { label: 'cron:renewals' }
 * @param {object} [params.tx]             write inside this transaction instead
 */
export async function writeAudit({
  req,
  action,
  organizationId = null,
  targetType = null,
  targetId = null,
  reason = null,
  changes = null,
  actor = null,
  tx = null,
}) {
  const admin = req?.platformAdmin ?? null;
  const data = {
    actorAdminId: admin?.id ?? null,
    actorLabel: admin
      ? `${admin.name} <${admin.email}>`
      : (actor?.label ?? "system"),
    actorRole: admin?.role ?? actor?.role ?? null,
    action,
    organizationId,
    targetType,
    targetId,
    reason: reason ?? req?.actionReason ?? null,
    changes: changes ? sanitize(changes) : null,
    ip: req ? clientIp(req) : null,
    userAgent: req?.headers?.["user-agent"]?.slice(0, 300) ?? null,
  };

  // Inside a transaction the caller has chosen atomicity, so a failure should surface.
  if (tx) return tx.auditLog.create({ data });

  try {
    return await prisma.auditLog.create({ data });
  } catch (err) {
    // Never let the trail break the action it is describing.
    console.error(`[audit] could not record ${action}:`, err.message);
    return null;
  }
}

/** Honours X-Forwarded-For only when the deployment says it is behind a trusted proxy. */
export function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (req.app?.get?.("trust proxy") && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return (req.ip || req.socket?.remoteAddress || "").slice(0, 64) || null;
}

/**
 * Records a state change on a subscription, for the store page's timeline. Takes `tx` because
 * the history row and the subscription update have to land together: a timeline that disagrees
 * with the subscription it describes is worse than no timeline.
 */
export function writeSubscriptionEvent(
  tx,
  { organizationId, type, reason = null, req = null, ...rest },
) {
  const admin = req?.platformAdmin ?? null;
  return tx.subscriptionEvent.create({
    data: {
      organizationId,
      type,
      reason: reason ?? req?.actionReason ?? null,
      actorLabel: admin ? `${admin.name} <${admin.email}>` : "system",
      actorAdminId: admin?.id ?? null,
      ...rest,
    },
  });
}
