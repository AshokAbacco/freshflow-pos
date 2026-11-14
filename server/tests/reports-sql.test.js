/*
 * The reports SQL, against a real database, with numbers worked out by hand.
 *
 * These are aggregations over money. A wrong one does not throw -- it returns a plausible
 * figure that somebody then quotes in a board meeting. So this seeds a set of payments and
 * subscriptions whose totals are known on paper, runs the real queries, and asserts the
 * arithmetic.
 *
 * Uses `pg` directly so it runs where the Prisma engine is unavailable, and skips when no
 * database is configured.
 *
 *   DATABASE_URL=postgres://... node --test tests/reports-sql.test.js
 */
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';
import { entitlementStateSql } from '../src/services/entitlement.service.js';

const URL = process.env.DATABASE_URL;
const DAY = 86_400_000;
const at = (d) => new Date(Date.now() + d * DAY);
const tag = `rpt_${Date.now().toString(36)}`;

let client = null;
let usable = false;

before(async () => {
  if (!URL) return;
  client = new pg.Client({ connectionString: URL });
  try {
    await client.connect();
  } catch {
    return;
  }
  usable = true;

  const org = async (name, over = {}) => {
    const id = `${tag}-${name}`;
    await client.query(
      `INSERT INTO organizations (id,name,slug,created_at,updated_at,business_type,city,state,last_active_at)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,'Karnataka',$7)`,
      [id, `${tag} ${name}`, id, over.createdAt ?? at(-40), over.businessType ?? 'KIRANA',
       over.city ?? 'Bengaluru', over.lastActiveAt ?? at(-1)],
    );
    return id;
  };

  const sub = (orgId, over = {}) =>
    client.query(
      `INSERT INTO subscriptions
         (id,organization_id,plan,interval,seats,status,price_per_user,currency,
          trial_ends_at,current_period_end,grace_ends_at,suspended_at,cancelled_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'INR',$8,$9,NULL,$10,$11,NOW(),NOW())`,
      [`${orgId}-sub`, orgId, over.plan ?? 'STANDARD', over.interval ?? 'MONTHLY',
       over.seats ?? 3, over.status ?? 'ACTIVE', over.pricePerUser ?? 650,
       over.trialEndsAt ?? null, over.currentPeriodEnd ?? at(30),
       over.suspendedAt ?? null, over.cancelledAt ?? null],
    );

  const pay = (orgId, over = {}) =>
    client.query(
      `INSERT INTO payments
         (id,organization_id,plan,interval,seats,amount,amount_captured,amount_refunded,
          currency,status,razorpay_order_id,paid_at,created_at,updated_at)
       VALUES ($1,$2,'STANDARD','MONTHLY',3,$3,$4,$5,'INR',$6,$7,$8,$8,NOW())`,
      [`${orgId}-pay-${over.n ?? 1}`, orgId, over.amount ?? 1950,
       over.captured === undefined ? (over.amount ?? 1950) : over.captured,
       over.refunded ?? 0, over.status ?? 'PAID',
       `order_${orgId}_${over.n ?? 1}`, over.paidAt ?? at(-5)],
    );

  /*
   * The fixture, with the arithmetic stated:
   *
   *   Paying   ACTIVE,  650 x 3 = 1950/month
   *   Yearly   ACTIVE,  550 x 4 = 2200/month  (yearly rate is already per month)
   *   PastDue  PAST_DUE, in date, 650 x 2 = 1300/month -- still counts, still owed
   *   Susp     suspended while paid up -- NOT revenue
   *   Gone     cancelled -- NOT revenue
   *                                   MRR = 1950 + 2200 + 1300 = 5450
   */
  const paying = await org('Paying');
  await sub(paying, { seats: 3, pricePerUser: 650 });
  const yearly = await org('Yearly');
  await sub(yearly, { seats: 4, pricePerUser: 550, interval: 'YEARLY' });
  const pastDue = await org('PastDue');
  await sub(pastDue, { seats: 2, pricePerUser: 650, status: 'PAST_DUE' });
  const susp = await org('Susp');
  await sub(susp, { seats: 9, pricePerUser: 650, suspendedAt: at(-2) });
  const gone = await org('Gone');
  await sub(gone, { seats: 5, pricePerUser: 650, cancelledAt: at(-10) });

  /*
   * Payments:
   *   Paying   1950 captured in full                        -> 1950
   *   Yearly   2200 charged, 2000 captured, 500 refunded     -> 1500   (captured less refund)
   *   PastDue  1300 FAILED                                  -> ignored
   *                                        collected total  =  3450
   */
  await pay(paying, { amount: 1950, n: 1 });
  await pay(yearly, { amount: 2200, captured: 2000, refunded: 500, n: 1 });
  await pay(pastDue, { amount: 1300, captured: null, status: 'FAILED', n: 1 });
});

after(async () => {
  if (!usable) return;
  await client.query(`DELETE FROM organizations WHERE id LIKE $1`, [`${tag}-%`]).catch(() => {});
  await client.end().catch(() => {});
});

const mine = (sql) => sql;

test('MRR counts paying states only, and treats a yearly rate as monthly', async (t) => {
  if (!usable) return t.skip('no database');
  const { rows } = await client.query(
    mine(`SELECT SUM(s.price_per_user * s.seats)::float8 AS mrr, COUNT(*)::int AS paying
          FROM subscriptions s
          JOIN organizations o ON o.id = s.organization_id
          WHERE o.id LIKE $1 AND ${entitlementStateSql({ sub: 's' })} IN ('ACTIVE','PAST_DUE')`),
    [`${tag}-%`],
  );
  assert.equal(rows[0].mrr, 5450, '1950 + 2200 + 1300');
  assert.equal(rows[0].paying, 3, 'suspended and cancelled are not revenue');
});

test('revenue is captured money less refunds, not what was charged', async (t) => {
  if (!usable) return t.skip('no database');
  const { rows } = await client.query(
    `SELECT SUM(COALESCE(amount_captured, amount) - COALESCE(amount_refunded, 0))::float8 AS revenue,
            COUNT(*)::int AS payments
     FROM payments WHERE status = 'PAID' AND organization_id LIKE $1`,
    [`${tag}-%`],
  );
  assert.equal(rows[0].revenue, 3450, '1950 + (2000 captured - 500 refunded)');
  assert.equal(rows[0].payments, 2, 'the failed payment is not counted');
});

test('revenue groups into calendar months without losing a payment', async (t) => {
  if (!usable) return t.skip('no database');
  const { rows } = await client.query(
    `SELECT to_char(date_trunc('month', COALESCE(paid_at, created_at)), 'YYYY-MM') AS month,
            SUM(COALESCE(amount_captured, amount) - COALESCE(amount_refunded, 0))::float8 AS revenue
     FROM payments WHERE status = 'PAID' AND organization_id LIKE $1
     GROUP BY 1 ORDER BY 1`,
    [`${tag}-%`],
  );
  const total = rows.reduce((t2, r) => t2 + r.revenue, 0);
  assert.equal(total, 3450, 'the months add back up to the whole');
});

test('stores are bucketed by computed state, not the stored column', async (t) => {
  if (!usable) return t.skip('no database');
  const { rows } = await client.query(
    `SELECT ${entitlementStateSql({ sub: 's' })} AS state, COUNT(*)::int AS stores
     FROM organizations o LEFT JOIN subscriptions s ON s.organization_id = o.id
     WHERE o.id LIKE $1 GROUP BY 1`,
    [`${tag}-%`],
  );
  const by = Object.fromEntries(rows.map((r) => [r.state, r.stores]));
  assert.equal(by.ACTIVE, 2, 'Paying and Yearly');
  assert.equal(by.PAST_DUE, 1);
  assert.equal(by.SUSPENDED, 1, 'suspended even though it is paid up');
  assert.equal(by.CANCELLED, 1);
});

test('the plan breakdown sums the monthly value per plan', async (t) => {
  if (!usable) return t.skip('no database');
  const { rows } = await client.query(
    `SELECT s.plan::text AS plan, COUNT(*)::int AS stores,
            SUM(s.price_per_user * s.seats)::float8 AS monthly
     FROM subscriptions s JOIN organizations o ON o.id = s.organization_id
     WHERE o.id LIKE $1 AND ${entitlementStateSql({ sub: 's' })} IN ('ACTIVE','PAST_DUE')
     GROUP BY 1`,
    [`${tag}-%`],
  );
  const standard = rows.find((r) => r.plan === 'STANDARD');
  assert.equal(standard.stores, 3);
  assert.equal(standard.monthly, 5450);
});

test('top stores ranks by money that actually landed', async (t) => {
  if (!usable) return t.skip('no database');
  const { rows } = await client.query(
    `SELECT o.name,
            SUM(COALESCE(p.amount_captured, p.amount) - COALESCE(p.amount_refunded, 0))::float8 AS billed
     FROM payments p JOIN organizations o ON o.id = p.organization_id
     WHERE p.status = 'PAID' AND o.id LIKE $1
     GROUP BY o.id, o.name ORDER BY billed DESC NULLS LAST LIMIT 10`,
    [`${tag}-%`],
  );
  assert.equal(rows[0].name, `${tag} Paying`, '1950 beats the refunded 1500');
  assert.equal(rows[0].billed, 1950);
  assert.equal(rows[1].billed, 1500, 'captured less refunded, not the 2200 charged');
});

test('every audience filter is valid SQL and selects the right stores', async (t) => {
  if (!usable) return t.skip('no database');
  const base = `SELECT o.id FROM organizations o
                LEFT JOIN subscriptions s ON s.organization_id = o.id
                WHERE o.id LIKE $1`;

  const byState = await client.query(
    `${base} AND ${entitlementStateSql({ sub: 's' })} = ANY($2)`,
    [`${tag}-%`, ['SUSPENDED', 'CANCELLED']],
  );
  assert.equal(byState.rows.length, 2);

  const byType = await client.query(`${base} AND o.business_type::text = ANY($2)`, [
    `${tag}-%`, ['KIRANA'],
  ]);
  assert.equal(byType.rows.length, 5, 'all five seeded stores are kirana');

  const byCity = await client.query(`${base} AND LOWER(o.city) = LOWER($2)`, [
    `${tag}-%`, 'bengaluru',
  ]);
  assert.equal(byCity.rows.length, 5, 'city match ignores case');

  const quiet = await client.query(
    `${base} AND (o.last_active_at IS NULL OR o.last_active_at < NOW() - ($2 || ' days')::interval)`,
    [`${tag}-%`, '14'],
  );
  assert.equal(quiet.rows.length, 0, 'all were active yesterday');
});

test('a plan row prices a subscription the same way the catalogue did', async (t) => {
  if (!usable) return t.skip('no database');
  const { rows } = await client.query(
    `SELECT code, monthly_price::float8 AS monthly, yearly_price::float8 AS yearly
     FROM plans WHERE code IN ('STANDARD','CUSTOM') ORDER BY code`,
  );
  const by = Object.fromEntries(rows.map((r) => [r.code, r]));
  assert.equal(by.STANDARD.monthly, 650, 'matches config/plans.js');
  assert.equal(by.STANDARD.yearly, 550);
  assert.equal(by.CUSTOM.monthly, 1000);
  assert.equal(by.CUSTOM.yearly, 800);
});
