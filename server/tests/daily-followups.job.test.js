/*
 * The nightly follow-up sweep.
 *
 * The thing that must hold is that running it twice changes nothing the second time. Cron
 * retries, two servers firing at midnight and a nervous operator clicking "run" are all
 * normal; a support desk waking up to four copies of every chase is not.
 *
 *   node --test --experimental-test-module-mocks tests/daily-followups.job.test.js
 */
import assert from "node:assert/strict";
import test, { before, beforeEach, mock } from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-jwt-secret-that-is-definitely-long-enough-32";
process.env.DATABASE_URL ||= "postgresql://postgres@127.0.0.1:5433/freshflow";
process.env.RAZORPAY_KEY_ID ||= "rzp_test_1234567890abcd";
process.env.RAZORPAY_KEY_SECRET ||= "testsecretvaluewithnoprefix1234";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "testwebhooksecretvaluelongenough";

const DAY = 86_400_000;
const NOW = new Date("2026-06-15T09:00:00.000Z");
const at = (d) => new Date(+NOW + d * DAY);

const db = { orgs: [], followUps: [], payments: [], settings: [], audits: [] };

const fakePrisma = {
  organization: { findMany: async () => db.orgs.map((o) => ({ ...o })) },
  payment: {
    findMany: async ({ where }) =>
      db.payments.filter(
        (p) =>
          p.status === where.status && +p.createdAt >= +where.createdAt.gte,
      ),
  },
  followUp: {
    create: async ({ data }) => {
      // Stands in for the unique index on autoKey.
      if (
        data.autoKey &&
        db.followUps.some((f) => f.autoKey === data.autoKey)
      ) {
        const err = new Error(
          "Unique constraint failed on the fields: (`auto_key`)",
        );
        err.code = "P2002";
        throw err;
      }
      const row = {
        id: `f-${db.followUps.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      db.followUps.push(row);
      return row;
    },
  },
  platformSetting: { findMany: async () => db.settings },
  auditLog: {
    create: async ({ data }) => {
      db.audits.push(data);
      return data;
    },
  },
};

let runDailyFollowUps;
let invalidateSettingsCache;

before(async () => {
  mock.module("../src/lib/prisma.js", { namedExports: { prisma: fakePrisma } });
  ({ runDailyFollowUps } = await import("../src/jobs/daily-followups.job.js"));
  ({ invalidateSettingsCache } =
    await import("../src/services/platform-settings.service.js"));
});

function seed() {
  db.orgs.length = 0;
  db.followUps.length = 0;
  db.payments.length = 0;
  db.settings.length = 0;
  db.audits.length = 0;
  invalidateSettingsCache();

  const sub = (over = {}) => ({
    status: "ACTIVE",
    plan: "STANDARD",
    interval: "MONTHLY",
    seats: 3,
    pricePerUser: 650,
    trialEndsAt: null,
    currentPeriodEnd: at(30),
    graceEndsAt: null,
    suspendedAt: null,
    suspendedReason: null,
    cancelledAt: null,
    ...over,
  });

  db.orgs.push(
    // Renews in 3 days -> inside the 7-day notice window
    {
      id: "o-soon",
      name: "Renews Soon",
      lastActiveAt: at(-1),
      subscription: sub({ currentPeriodEnd: at(3) }),
    },
    // Renews in 40 days -> outside it
    {
      id: "o-later",
      name: "Renews Later",
      lastActiveAt: at(-1),
      subscription: sub({ currentPeriodEnd: at(40) }),
    },
    // Trial ending in 2 days
    {
      id: "o-trial",
      name: "On Trial",
      lastActiveAt: at(-1),
      subscription: sub({
        status: "TRIALING",
        trialEndsAt: at(2),
        currentPeriodEnd: null,
      }),
    },
    // Lapsed 2 days ago -> in grace
    {
      id: "o-grace",
      name: "In Grace",
      lastActiveAt: at(-1),
      subscription: sub({ currentPeriodEnd: at(-2) }),
    },
    // Paying but silent for 30 days
    {
      id: "o-quiet",
      name: "Gone Quiet",
      lastActiveAt: at(-30),
      subscription: sub(),
    },
    // Suspended, and paid up -> nobody should chase this
    {
      id: "o-susp",
      name: "Suspended",
      lastActiveAt: at(-1),
      subscription: sub({
        status: "SUSPENDED",
        suspendedAt: at(-5),
        currentPeriodEnd: at(3),
      }),
    },
    // Cancelled, also renewing soon on paper
    {
      id: "o-canc",
      name: "Cancelled",
      lastActiveAt: at(-1),
      subscription: sub({
        status: "CANCELLED",
        cancelledAt: at(-5),
        currentPeriodEnd: at(3),
      }),
    },
  );

  db.payments.push(
    {
      id: "pay-1",
      organizationId: "o-soon",
      status: "FAILED",
      amount: 1950,
      failureReason: "Card declined by issuer",
      createdAt: at(-0.2),
    },
    {
      id: "pay-2",
      organizationId: "o-later",
      status: "FAILED",
      amount: 1300,
      failureReason: null,
      createdAt: at(-5),
    }, // too old
    {
      id: "pay-3",
      organizationId: "o-later",
      status: "PAID",
      amount: 1300,
      failureReason: null,
      createdAt: at(-0.1),
    },
  );
}

beforeEach(seed);

const keys = () => db.followUps.map((f) => f.autoKey);
const forOrg = (id) => db.followUps.filter((f) => f.organizationId === id);

test("an upcoming renewal is raised once, with the date in its key", async () => {
  await runDailyFollowUps({ now: NOW });
  const row = forOrg("o-soon").find((f) => f.type === "RENEWAL");
  assert.ok(row, "a renewal chase exists");
  assert.match(row.autoKey, /^RENEWAL:o-soon:2026-06-18$/, row.autoKey);
  assert.match(row.title, /Renewal due in 3 days/);
});

test("a renewal further out than the notice window is left alone", async () => {
  await runDailyFollowUps({ now: NOW });
  assert.equal(forOrg("o-later").filter((f) => f.type === "RENEWAL").length, 0);
});

test("an ending trial is chased with different wording", async () => {
  await runDailyFollowUps({ now: NOW });
  const row = forOrg("o-trial")[0];
  assert.match(row.title, /Trial ends in 2 days/);
  assert.equal(row.priority, "HIGH", "two days out is urgent");
});

test("a lapsed store inside grace is raised as high priority", async () => {
  await runDailyFollowUps({ now: NOW });
  const row = forOrg("o-grace").find((f) => f.autoKey.startsWith("LAPSED:"));
  assert.ok(row);
  assert.equal(row.priority, "HIGH");
  assert.match(row.title, /still selling/);
});

test("a store that has gone quiet is chased weekly, not daily", async () => {
  await runDailyFollowUps({ now: NOW });
  const row = forOrg("o-quiet").find((f) => f.autoKey.startsWith("QUIET:"));
  assert.ok(row);
  assert.match(row.title, /No activity for 30 days/);

  // The next day falls in the same week, so nothing new.
  const before = db.followUps.length;
  await runDailyFollowUps({ now: new Date(+NOW + DAY) });
  assert.equal(db.followUps.length, before, "same week, same chase");
});

test("suspended and cancelled stores are never chased", async () => {
  await runDailyFollowUps({ now: NOW });
  assert.equal(
    forOrg("o-susp").length,
    0,
    "somebody already decided about this one",
  );
  assert.equal(forOrg("o-canc").length, 0);
});

test("a recent failed payment is raised, an old one is not", async () => {
  await runDailyFollowUps({ now: NOW });
  const raised = db.followUps.filter((f) => f.type === "PAYMENT_FAILED");
  assert.equal(raised.length, 1);
  assert.equal(raised[0].autoKey, "PAYMENT_FAILED:pay-1");
  assert.match(raised[0].title, /Card declined by issuer/);
});

test("running twice changes nothing the second time", async () => {
  const first = await runDailyFollowUps({ now: NOW });
  const afterFirst = [...keys()].sort();

  const second = await runDailyFollowUps({ now: NOW });
  const afterSecond = [...keys()].sort();

  assert.deepEqual(afterSecond, afterFirst, "no duplicates");
  assert.equal(
    Object.values(second).reduce((t, n) => t + n, 0),
    0,
    "and it reports nothing new",
  );
  assert.ok(
    Object.values(first).reduce((t, n) => t + n, 0) > 0,
    "the first run did do something",
  );
});

test("the sweep is audited when it raises anything, and silent when it does not", async () => {
  await runDailyFollowUps({ now: NOW });
  assert.equal(db.audits.length, 1);
  assert.equal(db.audits[0].actorLabel, "cron:daily-followups");

  await runDailyFollowUps({ now: NOW });
  assert.equal(db.audits.length, 1, "a no-op run does not write an audit row");
});

test("the notice window comes from platform settings", async () => {
  // Widen it to 60 days: the store renewing in 40 now qualifies.
  db.settings.push({
    key: "renewalNoticeDays",
    value: 60,
    updatedBy: null,
    updatedAt: NOW,
  });
  invalidateSettingsCache();

  await runDailyFollowUps({ now: NOW });
  assert.equal(
    forOrg("o-later").filter((f) => f.type === "RENEWAL").length,
    1,
    "the configured window is honoured, not the hardcoded 7",
  );
});

test("the quiet threshold comes from platform settings too", async () => {
  db.settings.push({
    key: "inactiveAfterDays",
    value: 60,
    updatedBy: null,
    updatedAt: NOW,
  });
  invalidateSettingsCache();

  await runDailyFollowUps({ now: NOW });
  assert.equal(
    forOrg("o-quiet").filter((f) => f.autoKey.startsWith("QUIET:")).length,
    0,
    "30 days quiet no longer qualifies when the threshold is 60",
  );
});

test("a renewal chase is due before the plan actually lapses", async () => {
  await runDailyFollowUps({ now: NOW });
  const row = forOrg("o-soon").find((f) => f.type === "RENEWAL");
  const endsAt = +at(3);
  assert.ok(+row.dueAt < endsAt, "there is still time to act on it");
  assert.ok(+row.dueAt >= +NOW, "and it is not due in the past");
});
