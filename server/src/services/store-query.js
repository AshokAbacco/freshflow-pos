/**
 * SQL for the stores list, with no database client in sight.
 *
 * Written as raw SQL rather than through Prisma's query builder for one reason: the list
 * filters and sorts by entitlement state, which is a computed window (grace depends on a
 * date arithmetic Prisma cannot express in `where`). Evaluating it in JavaScript would mean
 * fetching every tenant before paginating, so the page numbers would be wrong as soon as a
 * filter was applied.
 *
 * Every value is parameterised. The only interpolated fragments are the entitlement CASE
 * (built from this codebase's own column names) and a sort clause chosen from a fixed map,
 * so nothing a caller sends reaches the SQL text.
 *
 * Kept free of the Prisma client on purpose: that makes the queries testable against a real
 * Postgres with any driver, which is how tests/store-directory.test.js checks them.
 * store-directory.service.js executes what this builds.
 */
import {
  DEFAULT_GRACE_DAYS,
  FILTERABLE_STATES,
  entitlementStateSql,
} from "./entitlement.service.js";

export const PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Sorts the list offers. Whitelisted: the key is what the API accepts, the value is SQL. */
const SORTS = {
  newest: "x.created_at DESC NULLS LAST",
  oldest: "x.created_at ASC NULLS LAST",
  endingSoon: "x.period_end ASC NULLS LAST",
  revenue: "x.billed_30d DESC NULLS LAST",
  active: "x.last_active_at DESC NULLS LAST",
  inactive: "x.last_active_at ASC NULLS FIRST",
  name: "x.name ASC",
};
export const SORT_KEYS = Object.keys(SORTS);

const BUSINESS_TYPES = [
  "SUPERMARKET",
  "KIRANA",
  "MINI_MART",
  "HYPERMARKET",
  "WHOLESALE",
  "OTHER",
];
const PLANS = ["TRIAL", "STANDARD", "CUSTOM"];

/** Only the last ten digits are compared, matching lib phone.js and the users phone index. */
const PHONE_DIGITS = `RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g'), 10)`;

function innerSelect(graceDays) {
  const state = entitlementStateSql({ sub: "s", graceDays });
  return `
    SELECT
      o.id,
      o.name,
      o.legal_name,
      o.business_type,
      o.city,
      o.state      AS region,
      o.created_at,
      o.last_active_at,
      ${state}     AS state,
      s.plan,
      s.seats,
      s.interval,
      s.price_per_user,
      s.currency,
      s.status     AS stored_status,
      s.current_period_end AS period_end,
      s.trial_ends_at,
      s.grace_ends_at,
      s.suspended_at,
      s.suspended_reason,
      s.cancelled_at,
      owner.name   AS owner_name,
      owner.email  AS owner_email,
      owner.phone  AS owner_phone,
      (SELECT COUNT(*) FROM users u
         WHERE u.organization_id = o.id AND u.is_active) AS user_count,
      (SELECT COUNT(*) FROM products p
         WHERE p.organization_id = o.id AND p.is_active) AS product_count,
      (SELECT COUNT(*) FROM transactions t
         WHERE t.organization_id = o.id
           AND t.status = 'COMPLETED'
           AND t.sold_at >= DATE_TRUNC('month', NOW())) AS bills_this_month,
      (SELECT COALESCE(SUM(COALESCE(pay.amount_captured, pay.amount)), 0) FROM payments pay
         WHERE pay.organization_id = o.id
           AND pay.status = 'PAID'
           AND pay.created_at >= NOW() - INTERVAL '30 days') AS billed_30d,
      (SELECT COUNT(*) FROM follow_ups f
         WHERE f.organization_id = o.id AND f.status = 'OPEN') AS open_follow_ups
    FROM organizations o
    LEFT JOIN subscriptions s ON s.organization_id = o.id
    /*
     * The owner is the longest-standing admin. A LATERAL join rather than a correlated
     * subquery per column, so all three fields come from the same person.
     */
    LEFT JOIN LATERAL (
      SELECT u.name, u.email, u.phone
      FROM users u
      WHERE u.organization_id = o.id AND u.role = 'ADMIN'
      ORDER BY u.created_at ASC
      LIMIT 1
    ) owner ON TRUE
  `;
}

/**
 * Builds the WHERE clause and its parameters.
 * @returns {{clause: string, params: any[]}}
 */
function buildFilters(filters, startIndex = 1) {
  const where = [];
  const params = [];
  let i = startIndex;
  const add = (sql, value) => {
    where.push(sql.replace("?", `$${i}`));
    params.push(value);
    i += 1;
  };

  const q = String(filters.q ?? "").trim();
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    /*
     * One term, several places it might match: the store, the owner, or -- when it looks
     * like a phone number -- any staff member's number by its last ten digits.
     */
    const parts = [
      `x.name ILIKE $${i}`,
      `x.legal_name ILIKE $${i}`,
      `x.city ILIKE $${i}`,
      `x.owner_name ILIKE $${i}`,
      `x.owner_email ILIKE $${i}`,
    ];
    params.push(like);
    i += 1;

    if (digits.length >= 4) {
      parts.push(`EXISTS (
        SELECT 1 FROM users u
        WHERE u.organization_id = x.id
          AND ${PHONE_DIGITS} LIKE $${i}
      )`);
      params.push(`%${digits.slice(-10)}`);
      i += 1;
    }
    where.push(`(${parts.join(" OR ")})`);
  }

  const states = (
    Array.isArray(filters.state) ? filters.state : [filters.state]
  )
    .filter(Boolean)
    .filter((s) => FILTERABLE_STATES.includes(s));
  if (states.length) add("x.state = ANY(?)", states);

  const plans = (Array.isArray(filters.plan) ? filters.plan : [filters.plan])
    .filter(Boolean)
    .filter((p) => PLANS.includes(p));
  if (plans.length) add("x.plan = ANY(?)", plans);

  const types = (
    Array.isArray(filters.businessType)
      ? filters.businessType
      : [filters.businessType]
  )
    .filter(Boolean)
    .filter((t) => BUSINESS_TYPES.includes(t));
  if (types.length) add("x.business_type::text = ANY(?)", types);

  const endingWithin = Number(filters.endingWithin);
  if (Number.isFinite(endingWithin) && endingWithin > 0) {
    // Only plans that have not already lapsed: "ending within 7 days" is a warning, not a list
    // of things that already ended.
    where.push(
      `x.period_end >= NOW() AND x.period_end <= NOW() + ($${i} * INTERVAL '1 day')`,
    );
    params.push(endingWithin);
    i += 1;
  }

  if (filters.city) add("x.city ILIKE ?", String(filters.city));
  if (filters.region) add("x.region ILIKE ?", String(filters.region));
  if (filters.joinedFrom)
    add("x.created_at >= ?", new Date(filters.joinedFrom));
  if (filters.joinedTo) add("x.created_at <= ?", new Date(filters.joinedTo));

  const inactiveDays = Number(filters.inactiveDays);
  if (Number.isFinite(inactiveDays) && inactiveDays > 0) {
    // A store that has never been seen counts as inactive, matching isInactive().
    where.push(
      `(x.last_active_at IS NULL OR x.last_active_at < NOW() - ($${i} * INTERVAL '1 day'))`,
    );
    params.push(inactiveDays);
    i += 1;
  }

  if (
    filters.hasOpenFollowUps === true ||
    filters.hasOpenFollowUps === "true"
  ) {
    where.push("x.open_follow_ups > 0");
  }

  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const toNumber = (value) =>
  value === null || value === undefined ? null : Number(value);

export function shapeRow(r) {
  return {
    id: r.id,
    name: r.name,
    legalName: r.legal_name,
    businessType: r.business_type,
    city: r.city,
    region: r.region,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
    state: r.state,
    storedStatus: r.stored_status,
    owner: r.owner_email
      ? { name: r.owner_name, email: r.owner_email, phone: r.owner_phone }
      : null,
    plan: r.plan,
    seats: toNumber(r.seats),
    interval: r.interval,
    pricePerUser: toNumber(r.price_per_user),
    currency: r.currency ?? "INR",
    periodEnd: r.period_end,
    trialEndsAt: r.trial_ends_at,
    graceEndsAt: r.grace_ends_at,
    suspendedAt: r.suspended_at,
    suspendedReason: r.suspended_reason,
    cancelledAt: r.cancelled_at,
    usage: {
      users: toNumber(r.user_count) ?? 0,
      products: toNumber(r.product_count) ?? 0,
      billsThisMonth: toNumber(r.bills_this_month) ?? 0,
    },
    billedLast30Days: toNumber(r.billed_30d) ?? 0,
    openFollowUps: toNumber(r.open_follow_ups) ?? 0,
  };
}

/**
 * One page of stores, plus the total matching the same filters.
 *
 * @param {object} filters   see buildFilters
 * @param {object} [options] { page, pageSize, sort, graceDays }
 */
export function buildStoresQuery(filters = {}, options = {}) {
  const graceDays = Number.isFinite(options.graceDays)
    ? options.graceDays
    : DEFAULT_GRACE_DAYS;
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(options.pageSize) || PAGE_SIZE),
  );
  const orderBy = SORTS[options.sort] ?? SORTS.newest;

  const inner = innerSelect(graceDays);
  const { clause, params } = buildFilters(filters);

  return {
    rowsSql: `
    SELECT * FROM (${inner}) x
    ${clause}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    countSql: `SELECT COUNT(*)::int AS total FROM (${inner}) x ${clause}`,
    params,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    sort: SORTS[options.sort] ? options.sort : "newest",
  };
}

/** Rows to CSV. Quotes every field, so a store name with a comma cannot shift the columns. */
export function storesToCsv(stores) {
  const headers = [
    "Store",
    "Legal name",
    "Business type",
    "City",
    "State",
    "Owner",
    "Owner email",
    "Owner phone",
    "Access state",
    "Plan",
    "Seats",
    "Plan ends",
    "Users",
    "Products",
    "Bills this month",
    "Billed last 30 days",
    "Open follow-ups",
    "Last active",
    "Joined",
  ];
  const cell = (v) => {
    if (v === null || v === undefined) return '""';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(cell).join(",")];
  for (const s of stores) {
    lines.push(
      [
        s.name,
        s.legalName,
        s.businessType,
        s.city,
        s.region,
        s.owner?.name,
        s.owner?.email,
        s.owner?.phone,
        s.state,
        s.plan,
        s.seats,
        s.periodEnd,
        s.usage.users,
        s.usage.products,
        s.usage.billsThisMonth,
        s.billedLast30Days,
        s.openFollowUps,
        s.lastActiveAt,
        s.createdAt,
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}
