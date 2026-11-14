/**
 * What a store is allowed to do right now.
 *
 * This is the one place that answers that question. It is a pure function of (organization,
 * subscription, now) so it can be called on every store API request without a query, and so
 * its behaviour can be tested without a database. A cron job moves the stored status along for
 * reporting, but no request ever trusts that stored status on its own: a subscription that
 * lapsed a minute ago is lapsed, whether or not the hourly job has run yet.
 *
 * Precedence is deliberate and is the part worth not breaking:
 *
 *   SUSPENDED  >  CANCELLED  >  time-based states
 *
 * A platform suspension outranks everything, including a successful payment. If a store is
 * suspended for abuse and then pays, it stays suspended until a SUPER_ADMIN reactivates it --
 * otherwise paying would be a way to undo moderation.
 */

export const STATES = Object.freeze({
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  GRACE_PERIOD: "GRACE_PERIOD",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
  CANCELLED: "CANCELLED",
});

/** States in which the store may still create bills and records. */
const WRITABLE = new Set([
  STATES.TRIAL,
  STATES.ACTIVE,
  STATES.PAST_DUE,
  STATES.GRACE_PERIOD,
]);

export const DEFAULT_GRACE_DAYS = 7;

const DAY_MS = 86_400_000;

const toDate = (value) =>
  value instanceof Date ? value : value ? new Date(value) : null;
const isFuture = (date, now) =>
  date instanceof Date && !Number.isNaN(+date) && +date > +now;

/** Whole days from now until `date`, rounded up, floored at 0. 0 means "today or already past". */
function daysUntil(date, now) {
  const d = toDate(date);
  if (!d || Number.isNaN(+d)) return null;
  return Math.max(0, Math.ceil((+d - +now) / DAY_MS));
}

/**
 * @param {object|null} organization
 * @param {object|null} subscription
 * @param {Date} now
 * @param {object} [options]
 * @param {number} [options.graceDays] platform default, overridden by subscription.graceEndsAt
 * @param {(subscription: object|null) => object} [options.resolvePlan]
 *        Returns { plan, limits, features } for the subscription's tier. Injected so this stays
 *        pure: today it comes from config/plans.js, and from the Plan table once that exists.
 */
export function evaluateEntitlement(
  organization,
  subscription,
  now = new Date(),
  options = {},
) {
  const at = toDate(now) ?? new Date();
  const graceDays = Number.isFinite(options.graceDays)
    ? options.graceDays
    : DEFAULT_GRACE_DAYS;
  const plan = options.resolvePlan
    ? options.resolvePlan(subscription)
    : emptyPlan(subscription);

  const base = {
    plan: plan.plan ?? subscription?.plan ?? null,
    seats: subscription?.seats ?? 0,
    limits: plan.limits ?? {},
    features: plan.features ?? {},
    periodEnd: toDate(subscription?.currentPeriodEnd),
    trialEndsAt: toDate(subscription?.trialEndsAt),
    graceEndsAt: null,
    daysLeft: null,
  };

  // A store with no subscription row at all has never started a trial. Treat it as expired
  // rather than throwing: the renewal page has to stay reachable.
  if (!subscription) {
    return decide(STATES.EXPIRED, "This store has no subscription yet.", base);
  }

  // 1. Suspension wins, however it was recorded.
  if (subscription.status === "SUSPENDED" || subscription.suspendedAt) {
    return decide(
      STATES.SUSPENDED,
      subscription.suspendedReason
        ? `This store is suspended: ${subscription.suspendedReason}`
        : "This store has been suspended by the platform.",
      base,
    );
  }

  // 2. Cancellation is terminal for writes.
  if (subscription.status === "CANCELLED" || subscription.cancelledAt) {
    return decide(
      STATES.CANCELLED,
      "This store’s subscription has been cancelled.",
      base,
    );
  }

  // 3. Trial, while it lasts.
  if (subscription.status === "TRIALING" && isFuture(base.trialEndsAt, at)) {
    return decide(STATES.TRIAL, null, {
      ...base,
      daysLeft: daysUntil(base.trialEndsAt, at),
    });
  }

  // 4. Inside a paid period.
  if (isFuture(base.periodEnd, at)) {
    const daysLeft = daysUntil(base.periodEnd, at);
    // A failed renewal attempt while paid time remains: still working, but worth chasing.
    if (subscription.status === "PAST_DUE") {
      return decide(STATES.PAST_DUE, "The last payment attempt failed.", {
        ...base,
        daysLeft,
      });
    }
    return decide(STATES.ACTIVE, null, { ...base, daysLeft });
  }

  // 5. Past the end of the paid period or the trial: grace, then expiry.
  const lapsedAt = base.periodEnd ?? base.trialEndsAt;
  const graceEndsAt =
    toDate(subscription.graceEndsAt) ??
    (lapsedAt ? new Date(+lapsedAt + graceDays * DAY_MS) : null);

  if (isFuture(graceEndsAt, at)) {
    return decide(
      STATES.GRACE_PERIOD,
      "This store’s subscription has lapsed and is in its grace period.",
      {
        ...base,
        graceEndsAt,
        daysLeft: daysUntil(graceEndsAt, at),
      },
    );
  }

  return decide(STATES.EXPIRED, "This store’s subscription has ended.", {
    ...base,
    graceEndsAt,
    daysLeft: 0,
  });
}

function decide(state, reason, rest) {
  const canWrite = WRITABLE.has(state);
  return {
    state,
    canWrite,
    // Reads stay open in every state, so past bills, reports, data export and the renewal
    // page are always reachable. An expired store must still be able to get its data out.
    canRead: true,
    reason: reason ?? null,
    ...rest,
  };
}

function emptyPlan(subscription) {
  return { plan: subscription?.plan ?? null, limits: {}, features: {} };
}

/**
 * Which stored SubscriptionStatus corresponds to an evaluated state, for the hourly job that
 * keeps the column in step with reality. TRIAL maps back to TRIALING because that is what the
 * existing enum calls it.
 */
export function statusForState(state) {
  switch (state) {
    case STATES.TRIAL:
      return "TRIALING";
    case STATES.ACTIVE:
      return "ACTIVE";
    case STATES.PAST_DUE:
      return "PAST_DUE";
    case STATES.GRACE_PERIOD:
      return "GRACE_PERIOD";
    case STATES.EXPIRED:
      return "EXPIRED";
    case STATES.SUSPENDED:
      return "SUSPENDED";
    case STATES.CANCELLED:
      return "CANCELLED";
    default:
      return "EXPIRED";
  }
}

/**
 * Would moving to `limits` strand this store above its new plan?
 *
 * Used by the platform's change-plan action: moving a store with three outlets onto a
 * one-outlet plan has to be refused before it happens, not discovered afterwards.
 *
 * @param {object} usage   e.g. { outlets: 3, counters: 4, users: 9, products: 1200 }
 * @param {object} limits  same keys; a missing key or null means unlimited
 * @returns {{ok: boolean, violations: Array<{key: string, usage: number, limit: number}>}}
 */
export function checkUsageFitsLimits(usage = {}, limits = {}) {
  const violations = [];
  for (const [key, limit] of Object.entries(limits)) {
    if (limit === null || limit === undefined) continue;
    if (typeof limit !== "number" || !Number.isFinite(limit)) continue;
    const used = Number(usage[key] ?? 0);
    if (used > limit) violations.push({ key, usage: used, limit });
  }
  return { ok: violations.length === 0, violations };
}

/** Has this store gone quiet? Drives the "inactive 14+ days" filter and follow-up job. */
export function isInactive(organization, now = new Date(), thresholdDays = 14) {
  const last = toDate(organization?.lastActiveAt);
  if (!last) return true;
  return +now - +last > thresholdDays * DAY_MS;
}

/* ===========================================================================
 * The same decision, in SQL.
 *
 * The stores list has to filter and sort tens of thousands of rows by entitlement state, which
 * means the database has to know the rule too -- evaluating it in JavaScript would mean
 * fetching every row before paginating, and the page counts would be wrong.
 *
 * Two copies of a rule is exactly how rules drift, so they live side by side in this file and
 * tests/entitlement-sql.test.js runs both against the same rows and asserts they agree. If you
 * change evaluateEntitlement above, change this with it and the test will tell you if you miss
 * a case.
 * =========================================================================== */

/**
 * A SQL CASE expression returning the same state string as evaluateEntitlement.
 *
 * @param {object} [options]
 * @param {string} [options.sub]       alias of the subscriptions row (left-joined, may be null)
 * @param {number} [options.graceDays] platform default, used when grace_ends_at is not set
 * @param {string} [options.now]       SQL expression for "now", so tests can pin the clock
 */
export function entitlementStateSql({
  sub = "s",
  graceDays = DEFAULT_GRACE_DAYS,
  now = "NOW()",
} = {}) {
  const days = Number.isFinite(graceDays)
    ? Math.max(0, Math.trunc(graceDays))
    : DEFAULT_GRACE_DAYS;
  // `days` is coerced to an integer above, so it is safe to inline; every other value here is
  // a column name from this function's own options.
  const graceEnd = `COALESCE(${sub}.grace_ends_at, COALESCE(${sub}.current_period_end, ${sub}.trial_ends_at) + INTERVAL '${days} days')`;

  return `CASE
    WHEN ${sub}.id IS NULL THEN '${STATES.EXPIRED}'
    WHEN ${sub}.status = 'SUSPENDED' OR ${sub}.suspended_at IS NOT NULL THEN '${STATES.SUSPENDED}'
    WHEN ${sub}.status = 'CANCELLED' OR ${sub}.cancelled_at IS NOT NULL THEN '${STATES.CANCELLED}'
    WHEN ${sub}.status = 'TRIALING' AND ${sub}.trial_ends_at > ${now} THEN '${STATES.TRIAL}'
    WHEN ${sub}.current_period_end > ${now} AND ${sub}.status = 'PAST_DUE' THEN '${STATES.PAST_DUE}'
    WHEN ${sub}.current_period_end > ${now} THEN '${STATES.ACTIVE}'
    WHEN ${graceEnd} > ${now} THEN '${STATES.GRACE_PERIOD}'
    ELSE '${STATES.EXPIRED}'
  END`;
}

/** Every state the stores list may be filtered by. */
export const FILTERABLE_STATES = Object.freeze(Object.values(STATES));
