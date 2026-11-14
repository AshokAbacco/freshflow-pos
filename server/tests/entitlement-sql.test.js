/*
 * Proves the SQL form of the entitlement rule agrees with the JavaScript one.
 *
 * The stores list filters by entitlement state in the database, so the rule exists twice: once
 * in evaluateEntitlement() and once in entitlementStateSql(). Two copies of a rule drift. This
 * builds a row for every branch and every boundary, runs both against it, and fails if they
 * ever disagree.
 *
 * Talks to Postgres with `pg` directly rather than Prisma, so it runs even where the Prisma
 * engine is unavailable. Skips itself when no database is configured.
 *
 *   DATABASE_URL=postgres://... node --test tests/entitlement-sql.test.js
 */
import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  DEFAULT_GRACE_DAYS,
  STATES,
  entitlementStateSql,
  evaluateEntitlement,
} from "../src/services/entitlement.service.js";

const URL = process.env.DATABASE_URL;
const DAY_MS = 86_400_000;

/** A fixed clock, so "in 2 days" means the same thing to both implementations. */
const NOW = new Date("2026-06-15T10:00:00.000Z");
const at = (days) => new Date(+NOW + days * DAY_MS);

/*
 * One row per branch of the rule, plus the boundaries either side of each cutover, because
 * off-by-one at a boundary is the failure that actually happens.
 */
const CASES = [
  ["no subscription at all", null, STATES.EXPIRED],

  [
    "suspended by status",
    { status: "SUSPENDED", currentPeriodEnd: at(300) },
    STATES.SUSPENDED,
  ],
  [
    "suspended by timestamp, still paid",
    { status: "ACTIVE", currentPeriodEnd: at(300), suspendedAt: at(-1) },
    STATES.SUSPENDED,
  ],
  [
    "suspension outranks a running trial",
    { status: "TRIALING", trialEndsAt: at(20), suspendedAt: at(-1) },
    STATES.SUSPENDED,
  ],

  [
    "cancelled by status",
    { status: "CANCELLED", currentPeriodEnd: at(45) },
    STATES.CANCELLED,
  ],
  [
    "cancelled by timestamp",
    { status: "ACTIVE", currentPeriodEnd: at(45), cancelledAt: at(-2) },
    STATES.CANCELLED,
  ],

  [
    "trial with days left",
    { status: "TRIALING", trialEndsAt: at(4) },
    STATES.TRIAL,
  ],
  [
    "trial ending in an hour",
    { status: "TRIALING", trialEndsAt: new Date(+NOW + 3_600_000) },
    STATES.TRIAL,
  ],
  [
    "trial that ended an hour ago falls to grace",
    { status: "TRIALING", trialEndsAt: new Date(+NOW - 3_600_000) },
    STATES.GRACE_PERIOD,
  ],
  [
    "trial long past grace",
    { status: "TRIALING", trialEndsAt: at(-40) },
    STATES.EXPIRED,
  ],

  [
    "paid and in date",
    { status: "ACTIVE", currentPeriodEnd: at(10) },
    STATES.ACTIVE,
  ],
  [
    "paid, expiring within the hour",
    { status: "ACTIVE", currentPeriodEnd: new Date(+NOW + 3_600_000) },
    STATES.ACTIVE,
  ],
  [
    "failed payment but paid time remains",
    { status: "PAST_DUE", currentPeriodEnd: at(5) },
    STATES.PAST_DUE,
  ],

  [
    "lapsed an hour ago is in grace",
    { status: "ACTIVE", currentPeriodEnd: new Date(+NOW - 3_600_000) },
    STATES.GRACE_PERIOD,
  ],
  [
    "lapsed, one day inside grace",
    { status: "ACTIVE", currentPeriodEnd: at(-(DEFAULT_GRACE_DAYS - 1)) },
    STATES.GRACE_PERIOD,
  ],
  [
    "lapsed, one day past grace",
    { status: "ACTIVE", currentPeriodEnd: at(-(DEFAULT_GRACE_DAYS + 1)) },
    STATES.EXPIRED,
  ],
  [
    "past due and past grace",
    { status: "PAST_DUE", currentPeriodEnd: at(-(DEFAULT_GRACE_DAYS + 1)) },
    STATES.EXPIRED,
  ],

  [
    "explicit graceEndsAt extends a long-lapsed plan",
    { status: "ACTIVE", currentPeriodEnd: at(-30), graceEndsAt: at(3) },
    STATES.GRACE_PERIOD,
  ],
  [
    "explicit graceEndsAt already past",
    { status: "ACTIVE", currentPeriodEnd: at(-30), graceEndsAt: at(-1) },
    STATES.EXPIRED,
  ],
];

const full = (over) =>
  over && {
    status: "ACTIVE",
    plan: "STANDARD",
    seats: 3,
    currentPeriodEnd: null,
    trialEndsAt: null,
    graceEndsAt: null,
    suspendedAt: null,
    suspendedReason: null,
    cancelledAt: null,
    ...over,
  };

test("the SQL rule and the JavaScript rule agree on every branch", async (t) => {
  if (!URL) return t.skip("DATABASE_URL not set");

  const client = new pg.Client({ connectionString: URL });
  try {
    await client.connect();
  } catch (err) {
    return t.skip(`no database: ${err.message}`);
  }

  const schema = `ent_sql_${Date.now().toString(36)}`;
  try {
    // A scratch schema, so this never touches real rows and cleans up after itself.
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`
      CREATE TABLE "${schema}".subs (
        id TEXT PRIMARY KEY,
        label TEXT,
        status TEXT,
        trial_ends_at TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ
      )`);

    const rows = CASES.map(([label, over], i) => [
      String(i),
      label,
      full(over),
    ]);

    for (const [id, label, sub] of rows) {
      if (!sub) continue;
      await client.query(
        `INSERT INTO "${schema}".subs
           (id, label, status, trial_ends_at, current_period_end, grace_ends_at, suspended_at, cancelled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          label,
          sub.status,
          sub.trialEndsAt,
          sub.currentPeriodEnd,
          sub.graceEndsAt,
          sub.suspendedAt,
          sub.cancelledAt,
        ],
      );
    }

    // The same fixed clock both sides, so the comparison is about the rule, not timing.
    const caseSql = entitlementStateSql({
      sub: "s",
      now: `TIMESTAMPTZ '${NOW.toISOString()}'`,
    });
    const { rows: fromSql } = await client.query(
      `SELECT s.id, s.label, ${caseSql} AS state FROM "${schema}".subs s ORDER BY s.id::int`,
    );

    const sqlById = new Map(fromSql.map((r) => [r.id, r.state]));
    const disagreements = [];

    for (const [id, label, sub] of rows) {
      const expected = CASES[Number(id)][2];
      const fromJs = evaluateEntitlement({}, sub, NOW).state;

      // Both implementations must match each other AND the stated expectation.
      assert.equal(fromJs, expected, `JavaScript rule, "${label}"`);

      if (sub) {
        const sqlState = sqlById.get(id);
        if (sqlState !== fromJs) {
          disagreements.push(
            `"${label}": SQL says ${sqlState}, JavaScript says ${fromJs}`,
          );
        }
      }
    }

    assert.deepEqual(
      disagreements,
      [],
      `SQL and JavaScript disagree:\n  ${disagreements.join("\n  ")}`,
    );

    // A null subscription is the left-join case: no row, so the CASE must still say EXPIRED.
    const { rows: nullJoin } = await client.query(
      `SELECT ${entitlementStateSql({ sub: "s", now: `TIMESTAMPTZ '${NOW.toISOString()}'` })} AS state
       FROM (SELECT NULL::TEXT AS id, NULL::TEXT AS status, NULL::TIMESTAMPTZ AS trial_ends_at,
                    NULL::TIMESTAMPTZ AS current_period_end, NULL::TIMESTAMPTZ AS grace_ends_at,
                    NULL::TIMESTAMPTZ AS suspended_at, NULL::TIMESTAMPTZ AS cancelled_at) s`,
    );
    assert.equal(
      nullJoin[0].state,
      STATES.EXPIRED,
      "a store with no subscription row",
    );
  } finally {
    await client
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => {});
    await client.end().catch(() => {});
  }
});
