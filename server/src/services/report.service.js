import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { bucketsFor, comparePeriods } from '../utils/dates.js';

const tz = () => env.reportTimezone;

/**
 * SQL predicate: t.sold_at falls on local dates [from, to] in the report timezone.
 * sold_at is stored as UTC `timestamp(3)`, so convert local midnight → timestamptz → naive UTC.
 * Bounds are computed in Postgres (not JS) so they stay index-friendly and DST-correct.
 */
function inPeriod(from, to, column = Prisma.sql`t.sold_at`) {
  return Prisma.sql`(${column} >= ((${from}::date)::timestamp AT TIME ZONE ${tz()}::text AT TIME ZONE 'UTC')
    AND ${column} < (((${to}::date) + 1)::timestamp AT TIME ZONE ${tz()}::text AT TIME ZONE 'UTC'))`;
}

/** UTC instants for a local-date period, for use with the regular Prisma query builder. */
export async function periodBounds(from, to) {
  const [row] = await prisma.$queryRaw`
    SELECT ((${from}::date)::timestamp AT TIME ZONE ${tz()}::text) AS "start",
           (((${to}::date) + 1)::timestamp AT TIME ZONE ${tz()}::text) AS "end"`;
  return { start: new Date(row.start), end: new Date(row.end) };
}

async function kpis(from, to) {
  const [[totals], [volume]] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS orders,
             COALESCE(SUM(t.grand_total), 0)::float8 AS revenue,
             COALESCE(SUM(t.taxable_amount), 0)::float8 AS "netSales",
             COALESCE(SUM(t.item_discount + t.bill_discount), 0)::float8 AS discounts,
             COALESCE(SUM(t.tax_total), 0)::float8 AS tax
      FROM transactions t
      WHERE t.status = 'COMPLETED' AND ${inPeriod(from, to)}`,
    prisma.$queryRaw`
      SELECT COALESCE(SUM(i.quantity) FILTER (WHERE NOT i.sold_by_weight), 0)::float8 AS units,
             COALESCE(SUM(i.quantity) FILTER (WHERE i.sold_by_weight), 0)::float8 AS "weightKg"
      FROM transaction_items i
      JOIN transactions t ON t.id = i.transaction_id
      WHERE t.status = 'COMPLETED' AND ${inPeriod(from, to)}`,
  ]);
  return { ...totals, ...volume, avgBasket: totals.orders ? totals.revenue / totals.orders : 0 };
}

async function series(from, to, granularity) {
  const rows = await prisma.$queryRaw`
    SELECT to_char(date_trunc(${granularity}::text, (t.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz()}::text),
                   'YYYY-MM-DD"T"HH24:00') AS bucket,
           SUM(t.grand_total)::float8 AS revenue,
           COUNT(*)::int AS orders
    FROM transactions t
    WHERE t.status = 'COMPLETED' AND ${inPeriod(from, to)}
    GROUP BY 1
    ORDER BY 1`;
  const byKey = new Map(rows.map((r) => [r.bucket, r]));
  return bucketsFor(from, to, granularity).map((b) => ({
    key: b.key,
    label: b.label,
    revenue: byKey.get(b.key)?.revenue ?? 0,
    orders: byKey.get(b.key)?.orders ?? 0,
  }));
}

async function paymentSplit(from, to) {
  const rows = await prisma.$queryRaw`
    SELECT t.payment_method::text AS method, COUNT(*)::int AS orders, SUM(t.grand_total)::float8 AS revenue
    FROM transactions t
    WHERE t.status = 'COMPLETED' AND ${inPeriod(from, to)}
    GROUP BY 1`;
  return ['UPI', 'CASH', 'CARD'].map((method) => {
    const row = rows.find((r) => r.method === method);
    return { method, orders: row?.orders ?? 0, revenue: row?.revenue ?? 0 };
  });
}

async function inventorySnapshot() {
  const [row] = await prisma.$queryRaw`
    SELECT COALESCE(SUM(GREATEST(p.stock, 0) * p.price), 0)::float8 AS value,
           COUNT(*)::int AS skus,
           COUNT(*) FILTER (WHERE p.stock <= 0)::int AS "outOfStock",
           COUNT(*) FILTER (WHERE p.stock > 0 AND p.stock <= p.low_stock_threshold)::int AS "lowStock"
    FROM products p
    WHERE p.is_active`;
  return row;
}

export async function overviewReport(from, to) {
  const period = comparePeriods(from, to);
  const [current, previous, curSeries, prevSeries, curSplit, prevSplit, inventory] = await Promise.all([
    kpis(period.from, period.to),
    kpis(period.prevFrom, period.prevTo),
    series(period.from, period.to, period.granularity),
    series(period.prevFrom, period.prevTo, period.granularity),
    paymentSplit(period.from, period.to),
    paymentSplit(period.prevFrom, period.prevTo),
    inventorySnapshot(),
  ]);
  return {
    period,
    timezone: tz(),
    kpis: { current, previous },
    series: { current: curSeries, previous: prevSeries },
    paymentSplit: { current: curSplit, previous: prevSplit },
    inventory,
  };
}

/**
 * Sales + stock per category for the period and the previous period. Returns every category
 * (built for 1,000+ rows); `level=top` rolls sub-categories into their department.
 */
export async function categoryReport(from, to, level = 'leaf') {
  const period = comparePeriods(from, to);
  const cur = inPeriod(period.from, period.to);
  const prev = inPeriod(period.prevFrom, period.prevTo);
  const group = level === 'top' ? Prisma.sql`COALESCE(c.parent_id, c.id)` : Prisma.sql`c.id`;
  const levelFilter =
    level === 'top'
      ? Prisma.sql`c.parent_id IS NULL`
      : Prisma.sql`NOT EXISTS (SELECT 1 FROM categories ch WHERE ch.parent_id = c.id)`;

  const rows = await prisma.$queryRaw`
    WITH sales AS (
      SELECT ${group} AS category_id,
             SUM(i.net_amount) FILTER (WHERE ${cur})::float8 AS cur_revenue,
             SUM(i.net_amount) FILTER (WHERE ${prev})::float8 AS prev_revenue,
             SUM(i.quantity) FILTER (WHERE ${cur} AND NOT i.sold_by_weight)::float8 AS cur_units,
             SUM(i.quantity) FILTER (WHERE ${cur} AND i.sold_by_weight)::float8 AS cur_weight,
             COUNT(DISTINCT i.transaction_id) FILTER (WHERE ${cur})::int AS cur_orders
      FROM transaction_items i
      JOIN transactions t ON t.id = i.transaction_id
      JOIN categories c ON c.id = i.category_id
      WHERE t.status = 'COMPLETED' AND (${cur} OR ${prev})
      GROUP BY 1
    ),
    stock AS (
      SELECT ${group} AS category_id,
             COUNT(*)::int AS skus,
             SUM(GREATEST(p.stock, 0) * p.price)::float8 AS stock_value,
             COUNT(*) FILTER (WHERE p.stock <= p.low_stock_threshold)::int AS low_stock
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.is_active
      GROUP BY 1
    )
    SELECT c.id, c.name, c.icon, pc.name AS "parentName",
           COALESCE(s.cur_revenue, 0)::float8 AS revenue,
           COALESCE(s.prev_revenue, 0)::float8 AS "prevRevenue",
           COALESCE(s.cur_units, 0)::float8 AS units,
           COALESCE(s.cur_weight, 0)::float8 AS "weightKg",
           COALESCE(s.cur_orders, 0)::int AS orders,
           COALESCE(k.skus, 0)::int AS skus,
           COALESCE(k.stock_value, 0)::float8 AS "stockValue",
           COALESCE(k.low_stock, 0)::int AS "lowStock"
    FROM categories c
    LEFT JOIN categories pc ON pc.id = c.parent_id
    LEFT JOIN sales s ON s.category_id = c.id
    LEFT JOIN stock k ON k.category_id = c.id
    WHERE ${levelFilter}
    ORDER BY revenue DESC, c.name ASC`;

  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  const prevTotal = rows.reduce((sum, r) => sum + r.prevRevenue, 0);
  return { period, level, totals: { revenue: total, prevRevenue: prevTotal, categories: rows.length }, rows };
}

const PRODUCT_SORTS = {
  revenue: Prisma.sql`revenue DESC, p.name ASC`,
  units: Prisma.sql`quantity DESC, p.name ASC`,
  growth: Prisma.sql`(COALESCE(s.cur_revenue, 0) - COALESCE(s.prev_revenue, 0)) DESC, p.name ASC`,
  stock: Prisma.sql`p.stock ASC, p.name ASC`,
  name: Prisma.sql`p.name ASC`,
};

/** Itemised sales performance with remaining stock, paginated server-side. */
export async function productReport({ from, to, q = '', sort = 'revenue', page = 1, pageSize = 25 }) {
  const period = comparePeriods(from, to);
  const cur = inPeriod(period.from, period.to);
  const prev = inPeriod(period.prevFrom, period.prevTo);
  const search = q.trim();
  const orderBy = PRODUCT_SORTS[sort] ?? PRODUCT_SORTS.revenue;
  const offset = (page - 1) * pageSize;

  const rows = await prisma.$queryRaw`
    WITH sales AS (
      SELECT i.product_id,
             SUM(i.net_amount) FILTER (WHERE ${cur}) AS cur_revenue,
             SUM(i.net_amount) FILTER (WHERE ${prev}) AS prev_revenue,
             SUM(i.quantity) FILTER (WHERE ${cur}) AS cur_qty
      FROM transaction_items i
      JOIN transactions t ON t.id = i.transaction_id
      WHERE t.status = 'COMPLETED' AND (${cur} OR ${prev})
      GROUP BY 1
    )
    SELECT p.id, p.code, p.name, p.unit, p.sold_by_weight AS "soldByWeight",
           p.price::float8 AS price, p.stock::float8 AS stock,
           p.low_stock_threshold::float8 AS "lowStockThreshold", p.is_active AS "isActive",
           c.name AS "categoryName",
           COALESCE(s.cur_revenue, 0)::float8 AS revenue,
           COALESCE(s.prev_revenue, 0)::float8 AS "prevRevenue",
           COALESCE(s.cur_qty, 0)::float8 AS quantity,
           COUNT(*) OVER()::int AS "totalCount"
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN sales s ON s.product_id = p.id
    WHERE (p.is_active OR s.product_id IS NOT NULL)
      AND (${search}::text = '' OR p.name ILIKE ${`%${search}%`}::text OR p.code = ${search}::text OR p.barcode = ${search}::text)
    ORDER BY ${orderBy}
    LIMIT ${pageSize}::int OFFSET ${offset}::int`;

  const total = rows[0]?.totalCount ?? 0;
  return {
    period,
    page,
    pageSize,
    total,
    rows: rows.map(({ totalCount, ...r }) => r),
  };
}
