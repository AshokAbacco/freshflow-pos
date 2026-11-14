/**
 * Runs the stores-list and search queries.
 *
 * The SQL itself lives in store-query.js, which holds no database client so it can be tested
 * against a real Postgres without the Prisma engine. This module is the thin part that
 * executes it and is re-exported for convenience, so routes import one place.
 */
import { prisma } from "../lib/prisma.js";
// Imported as well as re-exported below: `export ... from` creates no local binding, so
// MAX_PAGE_SIZE would be undefined inside this module without this line.
import { MAX_PAGE_SIZE, buildStoresQuery, shapeRow } from "./store-query.js";

export {
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  SORT_KEYS,
  buildStoresQuery,
  shapeRow,
  storesToCsv,
} from "./store-query.js";

/** Only the last ten digits are compared, matching lib phone.js and the users phone index. */
const PHONE_DIGITS = `RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g'), 10)`;

const toNumber = (value) =>
  value === null || value === undefined ? null : Number(value);

export async function listStores(filters = {}, options = {}) {
  const { rowsSql, countSql, params, page, pageSize, sort } = buildStoresQuery(
    filters,
    options,
  );

  const [rows, counted] = await Promise.all([
    prisma.$queryRawUnsafe(rowsSql, ...params, pageSize, (page - 1) * pageSize),
    prisma.$queryRawUnsafe(countSql, ...params),
  ]);

  return {
    stores: rows.map(shapeRow),
    total: counted[0]?.total ?? 0,
    page,
    pageSize,
    sort,
  };
}

/** Every matching store, for CSV export. Capped so one click cannot pull a million rows. */
export async function listStoresForExport(filters = {}, options = {}) {
  const { stores } = await listStores(filters, {
    ...options,
    page: 1,
    pageSize: MAX_PAGE_SIZE,
  });
  return stores;
}

/**
 * Universal search across stores, people and payment references.
 *
 * Grouped rather than merged, because "Sri Lakshmi" meaning a store and "Sri Lakshmi" meaning
 * its owner are different answers to the same question and the operator has to pick.
 */
export async function universalSearch(term, { limit = 5 } = {}) {
  const q = String(term ?? "").trim();
  if (q.length < 2) return { stores: [], users: [], payments: [] };

  const like = `%${q}%`;
  const digits = q.replace(/\D/g, "");
  const capped = Math.min(10, Math.max(1, limit));

  const [stores, users, payments] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT o.id, o.name, o.city, o.business_type
       FROM organizations o
       WHERE o.name ILIKE $1 OR o.legal_name ILIKE $1 OR o.city ILIKE $1
       ORDER BY o.name ASC LIMIT $2`,
      like,
      capped,
    ),

    digits.length >= 4
      ? prisma.$queryRawUnsafe(
          `SELECT u.id, u.name, u.email, u.phone, u.role,
                  o.id AS organization_id, o.name AS organization_name
           FROM users u JOIN organizations o ON o.id = u.organization_id
           WHERE u.name ILIKE $1 OR u.email ILIKE $1
              OR ${PHONE_DIGITS} LIKE $2
           ORDER BY u.name ASC LIMIT $3`,
          like,
          `%${digits.slice(-10)}`,
          capped,
        )
      : prisma.$queryRawUnsafe(
          `SELECT u.id, u.name, u.email, u.phone, u.role,
                  o.id AS organization_id, o.name AS organization_name
           FROM users u JOIN organizations o ON o.id = u.organization_id
           WHERE u.name ILIKE $1 OR u.email ILIKE $1
           ORDER BY u.name ASC LIMIT $2`,
          like,
          capped,
        ),

    // Razorpay references are opaque strings; an exact-prefix match is what a support person
    // pasting one from an email actually wants.
    prisma.$queryRawUnsafe(
      `SELECT p.id, p.razorpay_order_id, p.razorpay_payment_id, p.amount, p.currency,
              p.status, p.created_at, o.id AS organization_id, o.name AS organization_name
       FROM payments p JOIN organizations o ON o.id = p.organization_id
       WHERE p.razorpay_order_id ILIKE $1 OR p.razorpay_payment_id ILIKE $1
       ORDER BY p.created_at DESC LIMIT $2`,
      `${q}%`,
      capped,
    ),
  ]);

  return {
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      businessType: s.business_type,
    })),
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      storeId: u.organization_id,
      storeName: u.organization_name,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      orderId: p.razorpay_order_id,
      paymentId: p.razorpay_payment_id,
      amount: toNumber(p.amount),
      currency: p.currency,
      status: p.status,
      createdAt: p.created_at,
      storeId: p.organization_id,
      storeName: p.organization_name,
    })),
  };
}
