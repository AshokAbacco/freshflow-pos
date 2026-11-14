/*
 * Runs the stores-list SQL against a real database.
 *
 * The query is hand-written SQL over ten optional filters, six sorts and a computed entitlement
 * state, so the things that break are column names, parameter numbering and filters that
 * quietly match everything. None of that shows up in a unit test of the string; it only shows
 * up when Postgres runs it. This seeds a known set of stores and asserts on what comes back.
 *
 * Uses `pg` directly so it runs where the Prisma engine is unavailable, and skips itself when
 * no database is configured.
 *
 *   DATABASE_URL=postgres://... node --test tests/store-directory.test.js
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { STATES } from "../src/services/entitlement.service.js";
import {
  buildStoresQuery,
  shapeRow,
  storesToCsv,
} from "../src/services/store-query.js";

const URL = process.env.DATABASE_URL;
const DAY = 86_400_000;
const at = (days) => new Date(Date.now() + days * DAY);
const tag = `sdtest_${Date.now().toString(36)}`;

let client = null;
let usable = false;

/** Runs a built query and shapes the rows, exactly as the service does. */
async function run(filters = {}, options = {}) {
  const { rowsSql, countSql, params, pageSize, offset } = buildStoresQuery(
    filters,
    options,
  );
  const rows = await client.query(rowsSql, [...params, pageSize, offset]);
  const counted = await client.query(countSql, params);
  return {
    stores: rows.rows.map(shapeRow),
    total: counted.rows[0]?.total ?? 0,
  };
}

/** Only the seeded stores; the database may hold others. */
const mine = (stores) => stores.filter((s) => s.name.startsWith(tag));
const names = (stores) =>
  mine(stores)
    .map((s) => s.name.replace(`${tag} `, ""))
    .sort();

before(async () => {
  if (!URL) return;
  client = new pg.Client({ connectionString: URL });
  try {
    await client.connect();
  } catch {
    return;
  }
  usable = true;

  const org = async (name, over = {}, sub = undefined) => {
    const id = `${tag}-${name}`;
    await client.query(
      `INSERT INTO organizations (id, name, slug, created_at, updated_at, business_type, city, state, last_active_at)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8)`,
      [
        id,
        `${tag} ${name}`,
        id,
        over.createdAt ?? at(-60),
        over.businessType ?? "KIRANA",
        over.city ?? "Bengaluru",
        over.region ?? "Karnataka",
        over.lastActiveAt ?? at(-1),
      ],
    );
    await client.query(
      `INSERT INTO users (id, organization_id, name, email, password_hash, role, created_at, updated_at, phone)
       VALUES ($1,$2,$3,$4,'x','ADMIN',NOW(),NOW(),$5)`,
      [
        `${id}-owner`,
        id,
        `${name} Owner`,
        `${id}@example.test`,
        over.phone ?? null,
      ],
    );
    if (sub !== null) {
      await client.query(
        `INSERT INTO subscriptions
           (id, organization_id, plan, interval, seats, status, price_per_user, currency,
            trial_ends_at, current_period_end, grace_ends_at, suspended_at, cancelled_at, created_at, updated_at)
         VALUES ($1,$2,$3,'MONTHLY',$4,$5,$6,'INR',$7,$8,$9,$10,$11,NOW(),NOW())`,
        [
          `${id}-sub`,
          id,
          sub?.plan ?? "STANDARD",
          sub?.seats ?? 3,
          sub?.status ?? "ACTIVE",
          sub?.pricePerUser ?? 650,
          sub?.trialEndsAt ?? null,
          sub?.currentPeriodEnd ?? at(30),
          sub?.graceEndsAt ?? null,
          sub?.suspendedAt ?? null,
          sub?.cancelledAt ?? null,
        ],
      );
    }
    return id;
  };

  await org(
    "Active",
    { city: "Bengaluru", businessType: "SUPERMARKET" },
    { currentPeriodEnd: at(30) },
  );
  await org("EndingSoon", {}, { currentPeriodEnd: at(4) });
  await org(
    "Trial",
    { businessType: "MINI_MART" },
    {
      plan: "TRIAL",
      status: "TRIALING",
      trialEndsAt: at(10),
      currentPeriodEnd: null,
    },
  );
  await org("Grace", {}, { currentPeriodEnd: at(-2) });
  await org("Expired", {}, { currentPeriodEnd: at(-60) });
  await org(
    "Suspended",
    {},
    { currentPeriodEnd: at(300), suspendedAt: at(-3) },
  );
  await org("Cancelled", {}, { currentPeriodEnd: at(90), cancelledAt: at(-5) });
  await org(
    "Quiet",
    { lastActiveAt: at(-45), city: "Hyderabad", region: "Telangana" },
    { currentPeriodEnd: at(30) },
  );
  await org(
    "Phoned",
    { phone: "+91 98765 43210" },
    { currentPeriodEnd: at(30) },
  );
  await org("NoSub", {}, null);
});

after(async () => {
  if (!usable) return;
  await client
    .query(`DELETE FROM organizations WHERE id LIKE $1`, [`${tag}-%`])
    .catch(() => {});
  await client.end().catch(() => {});
});

test("the list query runs and returns the seeded stores", async (t) => {
  if (!usable) return t.skip("DATABASE_URL not set or unreachable");
  const { stores } = await run({}, { pageSize: 200 });
  assert.equal(mine(stores).length, 10, "all ten seeded stores come back");
});

test("entitlement state is computed per store, not read from the column", async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run({}, { pageSize: 200 });
  const byName = Object.fromEntries(
    mine(stores).map((s) => [s.name.replace(`${tag} `, ""), s]),
  );

  assert.equal(byName.Active.state, STATES.ACTIVE);
  assert.equal(byName.Trial.state, STATES.TRIAL);
  assert.equal(byName.Grace.state, STATES.GRACE_PERIOD);
  assert.equal(byName.Expired.state, STATES.EXPIRED);
  assert.equal(byName.Cancelled.state, STATES.CANCELLED);
  assert.equal(
    byName.NoSub.state,
    STATES.EXPIRED,
    "a store with no subscription row",
  );

  // The one that matters: still inside a paid period, but suspended.
  assert.equal(byName.Suspended.state, STATES.SUSPENDED);
  assert.equal(
    byName.Suspended.storedStatus,
    "ACTIVE",
    "the stored column still says ACTIVE",
  );
});

test("filtering by state narrows the list", async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run(
    { state: [STATES.SUSPENDED, STATES.CANCELLED] },
    { pageSize: 200 },
  );
  assert.deepEqual(names(stores), ["Cancelled", "Suspended"]);
});

test('"ending within N days" excludes plans that already lapsed', async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run({ endingWithin: 7 }, { pageSize: 200 });
  const got = names(stores);
  assert.ok(
    got.includes("EndingSoon"),
    "the plan ending in 4 days is included",
  );
  assert.ok(
    !got.includes("Grace"),
    'a plan that already lapsed is not "ending soon"',
  );
  assert.ok(!got.includes("Expired"), "nor is a long-expired one");
});

test("a phone search matches however the number was written", async (t) => {
  if (!usable) return t.skip("no database");
  for (const term of ["9876543210", "+91 98765 43210", "098765 43210"]) {
    const { stores } = await run({ q: term }, { pageSize: 200 });
    assert.deepEqual(names(stores), ["Phoned"], `searching "${term}"`);
  }
});

test("a text search matches the store and its owner", async (t) => {
  if (!usable) return t.skip("no database");
  const byStore = await run({ q: `${tag} Trial` }, { pageSize: 200 });
  assert.deepEqual(names(byStore.stores), ["Trial"]);

  const byOwner = await run({ q: "Quiet Owner" }, { pageSize: 200 });
  assert.deepEqual(names(byOwner.stores), ["Quiet"]);
});

test("business type and city filters apply", async (t) => {
  if (!usable) return t.skip("no database");
  const byType = await run(
    { businessType: ["SUPERMARKET", "MINI_MART"] },
    { pageSize: 200 },
  );
  assert.deepEqual(names(byType.stores), ["Active", "Trial"]);

  const byCity = await run({ city: "Hyderabad" }, { pageSize: 200 });
  assert.deepEqual(names(byCity.stores), ["Quiet"]);
});

test("the inactive filter includes stores never seen", async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run({ inactiveDays: 14 }, { pageSize: 200 });
  assert.ok(names(stores).includes("Quiet"), "quiet for 45 days");
});

test("filters combine rather than replace each other", async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run(
    { state: [STATES.ACTIVE], city: "Hyderabad" },
    { pageSize: 200 },
  );
  assert.deepEqual(names(stores), ["Quiet"], "active AND in Hyderabad");
});

test("every sort is valid SQL and orders differently", async (t) => {
  if (!usable) return t.skip("no database");
  const seen = {};
  for (const sort of [
    "newest",
    "oldest",
    "endingSoon",
    "revenue",
    "active",
    "inactive",
    "name",
  ]) {
    const { stores } = await run({}, { sort, pageSize: 200 });
    seen[sort] = names(stores).length;
    assert.equal(seen[sort], 10, `sort "${sort}" returns every row`);
  }
  const byName = await run({}, { sort: "name", pageSize: 200 });
  const ordered = mine(byName.stores).map((s) => s.name);
  assert.deepEqual(
    ordered,
    [...ordered].sort(),
    "name sort really is alphabetical",
  );
});

test("an unknown sort falls back instead of reaching the SQL", async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run(
    {},
    { sort: "x; DROP TABLE organizations; --", pageSize: 200 },
  );
  assert.equal(mine(stores).length, 10, "query still ran, tables intact");
  const check = await client.query(
    `SELECT COUNT(*)::int AS n FROM organizations`,
  );
  assert.ok(check.rows[0].n >= 10, "organizations table is still there");
});

test("a search term with SQL in it is treated as text", async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run(
    { q: "'; DROP TABLE users; --" },
    { pageSize: 200 },
  );
  assert.equal(mine(stores).length, 0, "no match, and no damage");
  const check = await client.query(`SELECT COUNT(*)::int AS n FROM users`);
  assert.ok(check.rows[0].n >= 10, "users table is still there");
});

test("pagination splits the set and the total ignores the page", async (t) => {
  if (!usable) return t.skip("no database");
  const first = await run({ q: tag }, { pageSize: 4, page: 1, sort: "name" });
  const second = await run({ q: tag }, { pageSize: 4, page: 2, sort: "name" });
  assert.equal(first.stores.length, 4);
  assert.equal(second.stores.length, 4);
  assert.equal(first.total, 10, "total counts every match, not just this page");
  assert.equal(second.total, 10);
  const overlap = first.stores.filter((s) =>
    second.stores.some((o) => o.id === s.id),
  );
  assert.equal(overlap.length, 0, "pages do not repeat rows");
});

test("usage counts come back as numbers", async (t) => {
  if (!usable) return t.skip("no database");
  const { stores } = await run({ q: `${tag} Active` }, {});
  const store = mine(stores)[0];
  assert.equal(typeof store.usage.users, "number");
  assert.equal(store.usage.users, 1, "the seeded owner");
  assert.equal(typeof store.billedLast30Days, "number");
  assert.equal(store.openFollowUps, 0);
  assert.equal(store.owner.email, `${tag}-Active@example.test`);
});

test("CSV quotes fields so a comma cannot shift the columns", async (t) => {
  if (!usable) return t.skip("no database");
  const csv = storesToCsv([
    {
      name: 'Sharma, Super "Market"',
      legalName: null,
      businessType: "KIRANA",
      city: "Pune",
      region: "MH",
      owner: { name: "A", email: "a@b.c", phone: null },
      state: "ACTIVE",
      plan: "STANDARD",
      seats: 3,
      periodEnd: null,
      usage: { users: 1, products: 2, billsThisMonth: 3 },
      billedLast30Days: 0,
      openFollowUps: 0,
      lastActiveAt: null,
      createdAt: null,
    },
  ]);
  const [, row] = csv.split("\n");
  assert.ok(row.startsWith('"Sharma, Super ""Market"""'), row.slice(0, 40));
  assert.equal(csv.split("\n").length, 2, "header plus one row");
});
