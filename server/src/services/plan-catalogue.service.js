/**
 * The one place that answers "what do we sell, and for how much".
 *
 * Before this existed there were two catalogues: the `plans` table, which the admin panel
 * edited, and the hardcoded objects in config/plans.js, which the pricing page, the quote
 * endpoint, the Razorpay order amount and the post-payment subscription all used. Raising a
 * price in the panel changed the panel and nothing else -- the shop was still quoted and
 * charged the old amount. Everything now resolves through here.
 *
 * config/plans.js stays as the fallback, which matters in two real situations: before the
 * plans migration has been run, and if the table is ever emptied. A pricing page that goes
 * blank because a migration is pending would be worse than one showing last week's prices.
 */
import {
  MAX_SEATS,
  MIN_SEATS,
  PLANS as STATIC_PLANS,
  TRIAL_DAYS,
  TRIAL_SEATS,
  monthsFor,
} from "../config/plans.js";
import { prisma } from "../lib/prisma.js";

/*
 * Plans change a few times a year and are read on every pricing page view and every checkout,
 * so they are cached briefly. Thirty seconds is short enough that an admin editing a price
 * sees it take effect while they are still looking at the page, and the write path clears the
 * cache anyway -- the TTL only covers changes made outside this process.
 */
const CACHE_MS = 30_000;
let cache = null;

export function invalidatePlanCache() {
  cache = null;
}

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

/** The shape every caller gets, whether it came from the database or the fallback. */
const fromRow = (row) => ({
  code: row.code,
  name: row.name,
  blurb: row.blurb ?? null,
  isPublic: row.isPublic,
  isActive: row.isActive && !row.retiredAt,
  features: Array.isArray(row.features) ? row.features : [],
  limits: {
    users: row.maxUsers ?? null,
    products: row.maxProducts ?? null,
    billsPerMonth: row.maxBillsPerMonth ?? null,
  },
  intervals: {
    MONTHLY: {
      listPrice: num(row.monthlyListPrice),
      price: num(row.monthlyPrice),
    },
    YEARLY: {
      listPrice: num(row.yearlyListPrice),
      price: num(row.yearlyPrice),
    },
  },
  currency: row.currency ?? "INR",
  source: "database",
});

const fromStatic = (tier) => {
  const p = STATIC_PLANS[tier];
  if (!p) return null;
  return {
    code: p.tier,
    name: p.name,
    blurb: p.blurb,
    // The trial is what a new signup gets, not something listed on the pricing page.
    isPublic: p.tier !== "TRIAL",
    isActive: true,
    features: p.features ?? [],
    limits: { users: null, products: null, billsPerMonth: null },
    intervals: {
      MONTHLY: { ...p.intervals.MONTHLY },
      YEARLY: { ...p.intervals.YEARLY },
    },
    currency: "INR",
    source: "fallback",
  };
};

/**
 * The trial as a plan row.
 *
 * config/plans.js has no TRIAL entry -- it expresses the trial as TRIAL_DAYS and TRIAL_SEATS
 * instead -- so without this the admin's plans screen showed two plans and left the operator
 * wondering where the free trial went. It is free, never public, and its real length lives in
 * the trialDays platform setting.
 */
const trialPlan = () => ({
  code: "TRIAL",
  name: "Trial",
  blurb: `${TRIAL_DAYS} days to try everything, no card needed.`,
  isPublic: false,
  isActive: true,
  features: [`Everything in Standard for ${TRIAL_DAYS} days`],
  limits: { users: TRIAL_SEATS, products: null, billsPerMonth: null },
  intervals: {
    MONTHLY: { listPrice: 0, price: 0 },
    YEARLY: { listPrice: 0, price: 0 },
  },
  currency: "INR",
  source: "fallback",
});

const staticCatalogue = () => [
  trialPlan(),
  ...Object.keys(STATIC_PLANS).map(fromStatic).filter(Boolean),
];

/**
 * Every plan, database first.
 *
 * A missing table is an expected state here, not an error: it just means the migration has
 * not been run yet. Anything else is rethrown, because a database that is up but refusing
 * this query should not quietly serve stale prices.
 */
export async function getPlans({ fresh = false } = {}) {
  if (!fresh && cache && cache.expires > Date.now()) return cache.value;

  let value;
  try {
    const rows = await prisma.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    value = rows.length
      ? { plans: rows.map(fromRow), source: "database" }
      : {
          plans: staticCatalogue(),
          source: "fallback",
          reason: "The plans table is empty.",
        };
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    value = {
      plans: staticCatalogue(),
      source: "fallback",
      reason:
        "The plans table does not exist yet — run the database migration.",
    };
  }

  cache = { value, expires: Date.now() + CACHE_MS };
  return value;
}

/**
 * Prisma reports a missing relation as P2021, and a client generated before the Plan model
 * existed has no `prisma.plan` at all, which surfaces as a TypeError. Both mean the same
 * thing to a reader: the migration has not been applied.
 */
function isMissingTable(err) {
  if (!err) return false;
  if (err.code === "P2021") return true;
  if (err instanceof TypeError && /undefined|not a function/i.test(err.message))
    return true;
  return /does not exist|relation .* does not exist/i.test(err.message ?? "");
}

export async function getPlan(code) {
  const { plans } = await getPlans();
  return plans.find((p) => p.code === code) ?? null;
}

/** Only what a shop can actually buy: active, public, and not the trial. */
export async function publicCatalogue() {
  const { plans, source, reason } = await getPlans();
  return {
    trial: { days: TRIAL_DAYS, seats: TRIAL_SEATS },
    currency: plans[0]?.currency ?? "INR",
    plans: plans
      .filter((p) => p.isActive && p.isPublic && p.code !== "TRIAL")
      .map((p) => ({
        tier: p.code,
        name: p.name,
        blurb: p.blurb,
        features: p.features,
        limits: p.limits,
        intervals: p.intervals,
      })),
    // Carried so the admin panel can say why it is showing what it is showing. The pricing
    // page ignores it.
    source,
    ...(reason ? { reason } : {}),
  };
}

/** True when this plan and interval can still be sold. */
export async function isSellable(code, interval) {
  const plan = await getPlan(code);
  return Boolean(plan && plan.isActive && plan.intervals?.[interval]);
}

/**
 * What a subscription costs right now.
 *
 * Same return shape as config/plans.js `quote()`, which it replaces at every call site, so
 * the billing code and the UI did not have to change around it.
 */
export async function quoteFor({ plan, interval, seats }) {
  const row = await getPlan(plan);
  if (!row || !row.intervals?.[interval]) {
    throw new Error(`Unknown plan ${plan}/${interval}`);
  }
  if (!row.isActive) {
    // Retired plans keep billing the stores already on them, but cannot be sold again.
    throw new Error(`Plan ${plan} is retired`);
  }

  const seatCount = Math.max(
    MIN_SEATS,
    Math.min(MAX_SEATS, Math.floor(Number(seats) || 0)),
  );
  const { price, listPrice } = row.intervals[interval];
  const months = monthsFor(interval);

  return {
    plan,
    interval,
    seats: seatCount,
    months,
    pricePerUser: price,
    listPricePerUser: listPrice,
    total: price * seatCount * months,
    listTotal: listPrice * seatCount * months,
    savings: (listPrice - price) * seatCount * months,
  };
}

/** The per-user, per-month rate to record on a subscription after a payment. */
export async function priceFor(plan, interval) {
  const row = await getPlan(plan);
  return row?.intervals?.[interval]?.price ?? 0;
}
