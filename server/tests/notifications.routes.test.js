/*
 * The store side of messaging, and the plan catalogue that now feeds both pricing and billing.
 *
 * The failure that matters most here is cross-tenant leakage: one shop being able to read or
 * reply to another shop's message. Every path is exercised against a second organisation's
 * rows to prove it cannot.
 *
 *   node --test --experimental-test-module-mocks tests/notifications.routes.test.js
 */
import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before, mock } from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-jwt-secret-that-is-definitely-long-enough-32";
process.env.DATABASE_URL ||= "postgresql://postgres@127.0.0.1:5433/freshflow";
process.env.RAZORPAY_KEY_ID ||= "rzp_test_1234567890abcd";
process.env.RAZORPAY_KEY_SECRET ||= "testsecretvaluewithnoprefix1234";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "testwebhooksecretvaluelongenough";

const db = {
  messages: [],
  recipients: [],
  replies: [],
  plans: [],
  sub: null,
  failedPayment: null,
};

const copy = (r) => (r ? { ...r } : null);
const msgOf = (id) => db.messages.find((m) => m.id === id) ?? null;

/** Only the operators these routes actually use. */
function matches(row, where) {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "message") {
      const m = msgOf(row.messageId);
      const want = cond.is ?? cond;
      if (!m || !matches(m, want)) return false;
      continue;
    }
    const value = row[key];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
    } else if (cond && typeof cond === "object" && "not" in cond) {
      if (
        cond.not === null
          ? value === null || value === undefined
          : value === cond.not
      )
        return false;
    } else if (value !== cond) return false;
  }
  return true;
}

const withMessage = (r) => ({ ...r, message: copy(msgOf(r.messageId)) });

const fakePrisma = {
  platformMessageRecipient: {
    findMany: async ({ where, take = 50 }) =>
      db.recipients
        .filter((r) => matches(r, where))
        .sort((a, b) => +b.createdAt - +a.createdAt)
        .slice(0, take)
        .map(withMessage),
    count: async ({ where }) =>
      db.recipients.filter((r) => matches(r, where)).length,
    findUnique: async ({ where }) => {
      const r = db.recipients.find((x) => x.id === where.id);
      return r ? withMessage(r) : null;
    },
    update: async ({ where, data }) => {
      const r = db.recipients.find((x) => x.id === where.id);
      Object.assign(r, data);
      return withMessage(r);
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const r of db.recipients) {
        if (!matches(r, where)) continue;
        Object.assign(r, data);
        count += 1;
      }
      return { count };
    },
  },
  storeMessageReply: {
    create: async ({ data }) => {
      const row = {
        id: `rep-${db.replies.length + 1}`,
        handledAt: null,
        createdAt: new Date(),
        ...data,
      };
      db.replies.push(row);
      return row;
    },
    findMany: async ({ where, take = 50 }) =>
      db.replies
        .filter((r) => r.organizationId === where.organizationId)
        .slice(0, take),
  },
  plan: {
    findMany: async () => db.plans.map(copy),
  },
  organization: {
    findUnique: async ({ where }) =>
      where.id === "o1" ? { id: "o1", lastActiveAt: new Date() } : null,
  },
  subscription: {
    findUnique: async () => (db.sub ? { ...db.sub } : null),
  },
  payment: {
    findFirst: async () => (db.failedPayment ? { ...db.failedPayment } : null),
  },
  platformSetting: { findMany: async () => [] },
};

let server;
let base;

before(async () => {
  mock.module("../src/lib/prisma.js", { namedExports: { prisma: fakePrisma } });

  const express = (await import("express")).default;
  const notifications = (await import("../src/routes/notifications.routes.js"))
    .default;

  const app = express();
  app.use(express.json());
  // Stands in for `authenticate`: the real middleware sets exactly these fields.
  app.use((req, _res, next) => {
    req.user = {
      id: req.headers["x-user"] ?? "u1",
      name: req.headers["x-name"] ?? "Ravi Kumar",
      role: "ADMIN",
      organizationId: req.headers["x-org"] ?? "o1",
    };
    next();
  });
  app.use("/notifications", notifications);
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.name === "ZodError" ? 400 : 500);
    res
      .status(status)
      .json({ error: { code: err.code || "ERROR", message: err.message } });
  });

  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => (server ? server.close(r) : r())));

function seed() {
  db.messages.length = 0;
  db.recipients.length = 0;
  db.replies.length = 0;
  db.plans.length = 0;
  // A healthy store by default; individual tests move it into the state they care about.
  db.sub = {
    status: "ACTIVE",
    plan: "STANDARD",
    interval: "MONTHLY",
    seats: 3,
    pricePerUser: 650,
    trialEndsAt: null,
    currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000),
    graceEndsAt: null,
    suspendedAt: null,
    suspendedReason: null,
    cancelledAt: null,
  };
  db.failedPayment = null;

  const ago = (d) => new Date(Date.now() - d * 86_400_000);
  db.messages.push(
    {
      id: "m1",
      subject: "Scheduled maintenance",
      body: "Offline 2am Sunday.",
      status: "SENT",
      sentAt: ago(2),
    },
    {
      id: "m2",
      subject: "New scanner support",
      body: "Connect any USB scanner.",
      status: "SENT",
      sentAt: ago(5),
    },
    {
      id: "m3",
      subject: "Still writing this",
      body: "Not finished.",
      status: "DRAFT",
      sentAt: null,
    },
  );
  db.recipients.push(
    {
      id: "rc1",
      messageId: "m1",
      organizationId: "o1",
      readAt: null,
      createdAt: ago(2),
    },
    {
      id: "rc2",
      messageId: "m2",
      organizationId: "o1",
      readAt: ago(4),
      createdAt: ago(5),
    },
    {
      id: "rc3",
      messageId: "m3",
      organizationId: "o1",
      readAt: null,
      createdAt: ago(0),
    },
    {
      id: "rc4",
      messageId: "m1",
      organizationId: "o2",
      readAt: null,
      createdAt: ago(2),
    },
  );
  db.plans.push(
    {
      id: "p1",
      code: "STANDARD",
      name: "Standard",
      blurb: null,
      isActive: true,
      isPublic: true,
      sortOrder: 10,
      maxUsers: null,
      maxProducts: null,
      maxBillsPerMonth: null,
      features: ["a"],
      retiredAt: null,
      monthlyListPrice: 900,
      monthlyPrice: 700,
      yearlyListPrice: 700,
      yearlyPrice: 600,
      currency: "INR",
      createdAt: ago(100),
    },
    {
      id: "p2",
      code: "RETIRED_ONE",
      name: "Old",
      blurb: null,
      isActive: false,
      isPublic: false,
      sortOrder: 90,
      maxUsers: 2,
      maxProducts: 100,
      maxBillsPerMonth: 500,
      features: [],
      retiredAt: ago(30),
      monthlyListPrice: 400,
      monthlyPrice: 350,
      yearlyListPrice: 350,
      yearlyPrice: 300,
      currency: "INR",
      createdAt: ago(300),
    },
  );
}

async function call(
  path,
  { method = "GET", body, org = "o1", user = "u1", name = "Ravi Kumar" } = {},
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-org": org,
      "x-user": user,
      "x-name": name,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/* ------------------------------------------------------------- what a shop sees */

test("a store sees messages addressed to it", async () => {
  seed();
  const res = await call("/notifications");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.notifications.map((n) => n.subject).sort(), [
    "New scanner support",
    "Scheduled maintenance",
  ]);
});

test("an unsent draft is never shown to the shop", async () => {
  // The admin is still wording it; it is not a message yet.
  seed();
  const res = await call("/notifications");
  assert.ok(
    !res.json.notifications.some((n) => n.subject === "Still writing this"),
  );
  assert.equal(
    res.json.unread,
    1,
    "and the draft is not counted as unread either",
  );
});

test("the unread count has its own endpoint for the badge", async () => {
  seed();
  const res = await call("/notifications/unread-count");
  assert.equal(res.status, 200);
  assert.equal(res.json.unread, 1);
});

test("unreadOnly narrows the list", async () => {
  seed();
  const res = await call("/notifications?unreadOnly=true");
  assert.equal(res.json.notifications.length, 1);
  assert.equal(res.json.notifications[0].subject, "Scheduled maintenance");
});

test("one store cannot see another store’s messages", async () => {
  seed();
  const res = await call("/notifications", { org: "o2" });
  assert.equal(res.json.notifications.length, 1, "only its own copy");
  const ids = res.json.notifications.map((n) => n.id);
  assert.ok(!ids.includes("rc1"), "not the other shop’s recipient row");
});

/* -------------------------------------------------------------------- reading */

test("opening a message marks it read, once", async () => {
  seed();
  const first = await call("/notifications/rc1/read", { method: "POST" });
  assert.equal(first.status, 200);
  const readAt = db.recipients.find((r) => r.id === "rc1").readAt;
  assert.ok(readAt);

  await call("/notifications/rc1/read", { method: "POST" });
  assert.equal(
    +db.recipients.find((r) => r.id === "rc1").readAt,
    +readAt,
    "re-opening does not move the timestamp",
  );
});

test("a store cannot mark another store’s message read", async () => {
  seed();
  const res = await call("/notifications/rc4/read", {
    method: "POST",
    org: "o1",
  });
  assert.equal(
    res.status,
    404,
    "not found rather than forbidden: it is not theirs to know about",
  );
  assert.equal(db.recipients.find((r) => r.id === "rc4").readAt, null);
});

test("mark-all-read only touches this store", async () => {
  seed();
  const res = await call("/notifications/read-all", { method: "POST" });
  assert.equal(res.status, 200);
  assert.equal(db.recipients.find((r) => r.id === "rc1").readAt !== null, true);
  assert.equal(
    db.recipients.find((r) => r.id === "rc4").readAt,
    null,
    "the other shop is untouched",
  );
});

/* -------------------------------------------------------------------- writing */

test("a reply reaches the platform inbox with the real author", async () => {
  seed();
  const res = await call("/notifications/rc1/reply", {
    method: "POST",
    body: { body: "The scale stopped connecting after the update." },
    name: "Ravi Kumar",
  });
  assert.equal(res.status, 201);

  const reply = db.replies.at(-1);
  assert.equal(reply.organizationId, "o1");
  assert.equal(reply.messageId, "m1");
  assert.equal(reply.authorLabel, "Ravi Kumar");
  assert.equal(
    reply.handledAt,
    null,
    "lands unhandled, which is what the inbox lists",
  );
});

test("the author cannot be spoofed through the body", async () => {
  seed();
  await call("/notifications/rc1/reply", {
    method: "POST",
    body: {
      body: "Pretending to be someone else",
      authorLabel: "The Owner",
      organizationId: "o2",
    },
    name: "Ravi Kumar",
  });
  const reply = db.replies.at(-1);
  assert.equal(
    reply.authorLabel,
    "Ravi Kumar",
    "taken from the session, not the payload",
  );
  assert.equal(reply.organizationId, "o1", "and so is the store");
});

test("replying counts as reading", async () => {
  seed();
  await call("/notifications/rc1/reply", {
    method: "POST",
    body: { body: "Noted, thank you" },
  });
  assert.ok(db.recipients.find((r) => r.id === "rc1").readAt);
});

test("a store cannot reply to another store’s message", async () => {
  seed();
  const res = await call("/notifications/rc4/reply", {
    method: "POST",
    body: { body: "Not mine" },
  });
  assert.equal(res.status, 404);
  assert.equal(db.replies.length, 0);
});

test("an empty reply is refused", async () => {
  seed();
  assert.equal(
    (
      await call("/notifications/rc1/reply", {
        method: "POST",
        body: { body: " " },
      })
    ).status,
    400,
  );
});

test("a shop can start a conversation without a message to answer", async () => {
  seed();
  const res = await call("/notifications/contact", {
    method: "POST",
    body: { body: "How do I add a second till?" },
  });
  assert.equal(res.status, 201);
  assert.equal(db.replies.at(-1).messageId, null, "no parent message");
  assert.equal(db.replies.at(-1).organizationId, "o1");
});

test("a shop sees only its own sent replies", async () => {
  seed();
  await call("/notifications/contact", {
    method: "POST",
    body: { body: "Mine" },
  });
  await call("/notifications/contact", {
    method: "POST",
    body: { body: "Theirs" },
    org: "o2",
  });

  const res = await call("/notifications/replies");
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.replies.map((r) => r.body),
    ["Mine"],
  );
});

/* ------------------------------------------------------------- plan catalogue */

test("the catalogue serves database prices, not the hardcoded file", async () => {
  seed();
  const { getPlans, invalidatePlanCache, quoteFor } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  const { plans, source } = await getPlans({ fresh: true });
  assert.equal(source, "database");
  const standard = plans.find((p) => p.code === "STANDARD");
  assert.equal(
    standard.intervals.MONTHLY.price,
    700,
    "the edited price, not the file’s 650",
  );

  const quote = await quoteFor({
    plan: "STANDARD",
    interval: "MONTHLY",
    seats: 3,
  });
  assert.equal(quote.pricePerUser, 700);
  assert.equal(quote.total, 2100, "what the customer is actually charged");
});

test("a yearly quote multiplies by twelve months", async () => {
  seed();
  const { invalidatePlanCache, quoteFor } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  const quote = await quoteFor({
    plan: "STANDARD",
    interval: "YEARLY",
    seats: 2,
  });
  assert.equal(quote.months, 12);
  assert.equal(quote.pricePerUser, 600, "per user per month");
  assert.equal(quote.total, 14400, "600 x 2 x 12");
  assert.equal(quote.savings, 2400, "(700 - 600) x 2 x 12");
});

test("a retired plan cannot be quoted or sold", async () => {
  seed();
  const { invalidatePlanCache, isSellable, quoteFor } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  assert.equal(await isSellable("RETIRED_ONE", "MONTHLY"), false);
  await assert.rejects(
    () => quoteFor({ plan: "RETIRED_ONE", interval: "MONTHLY", seats: 1 }),
    /retired/,
  );
  assert.equal(await isSellable("STANDARD", "MONTHLY"), true);
});

test("the public catalogue hides retired, private and trial plans", async () => {
  seed();
  const { invalidatePlanCache, publicCatalogue } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  const cat = await publicCatalogue();
  assert.deepEqual(
    cat.plans.map((p) => p.tier),
    ["STANDARD"],
  );
  assert.equal(cat.plans[0].intervals.MONTHLY.price, 700);
});

test("an empty plans table falls back to the file rather than showing nothing", async () => {
  seed();
  db.plans.length = 0;
  const { invalidatePlanCache, publicCatalogue } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  const cat = await publicCatalogue();
  assert.equal(cat.source, "fallback");
  assert.ok(
    cat.plans.length >= 2,
    "the pricing page still has something to show",
  );
  assert.ok(cat.reason.includes("empty"), cat.reason);
});

test("a missing plans table is treated as a pending migration, not a crash", async () => {
  seed();
  const original = fakePrisma.plan.findMany;
  fakePrisma.plan.findMany = async () => {
    const err = new Error(
      "The table `public.plans` does not exist in the current database.",
    );
    err.code = "P2021";
    throw err;
  };

  const { invalidatePlanCache, publicCatalogue } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  const cat = await publicCatalogue();
  assert.equal(cat.source, "fallback");
  assert.match(cat.reason, /migration/i, "and it says what to do about it");

  fakePrisma.plan.findMany = original;
  invalidatePlanCache();
});

test("a real database error is not swallowed as a missing table", async () => {
  seed();
  const original = fakePrisma.plan.findMany;
  fakePrisma.plan.findMany = async () => {
    throw new Error("connection terminated unexpectedly");
  };

  const { getPlans, invalidatePlanCache } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  await assert.rejects(
    () => getPlans({ fresh: true }),
    /connection terminated/,
    "a broken database must not quietly serve fallback prices",
  );

  fakePrisma.plan.findMany = original;
  invalidatePlanCache();
});

/* ------------------------------------------------------------------- alerts */

const DAY_MS = 86_400_000;
const inDays = (n) => new Date(Date.now() + n * DAY_MS);

test("a healthy store gets no alerts", async () => {
  seed();
  const res = await call("/notifications");
  assert.deepEqual(res.json.alerts, []);
});

test("a trial about to end is flagged, with somewhere to go", async () => {
  seed();
  db.sub = {
    ...db.sub,
    status: "TRIALING",
    trialEndsAt: inDays(2),
    currentPeriodEnd: null,
  };

  const res = await call("/notifications");
  const alert = res.json.alerts.find((a) => a.key === "trial-ending");
  assert.ok(alert, "the trial ending is surfaced");
  assert.equal(alert.tone, "urgent", "two days out is urgent");
  assert.match(alert.title, /2 days/);
  assert.equal(alert.action.to, "/app/billing");
});

test("a trial with weeks left is not nagged about", async () => {
  seed();
  db.sub = {
    ...db.sub,
    status: "TRIALING",
    trialEndsAt: inDays(20),
    currentPeriodEnd: null,
  };
  const res = await call("/notifications");
  assert.equal(res.json.alerts.length, 0);
});

test("a lapsed plan inside grace says how long is left and that it still works", async () => {
  seed();
  db.sub = { ...db.sub, currentPeriodEnd: inDays(-2) };

  const res = await call("/notifications");
  const alert = res.json.alerts.find((a) => a.key === "grace");
  assert.ok(alert);
  assert.equal(alert.tone, "urgent");
  assert.match(alert.body, /still take bills/);
});

test("an expired plan says data is safe, which is the actual worry", async () => {
  seed();
  db.sub = { ...db.sub, currentPeriodEnd: inDays(-60) };

  const res = await call("/notifications");
  const alert = res.json.alerts.find((a) => a.key === "expired");
  assert.ok(alert);
  assert.match(alert.body, /still here|exported/);
});

test("a suspension shows the reason the platform gave", async () => {
  seed();
  db.sub = {
    ...db.sub,
    status: "SUSPENDED",
    suspendedAt: inDays(-1),
    suspendedReason: "chargeback under review",
  };

  const res = await call("/notifications");
  const alert = res.json.alerts.find((a) => a.key === "suspended");
  assert.ok(alert);
  assert.match(alert.body, /chargeback under review/);
  assert.equal(
    alert.action,
    undefined,
    "there is nothing the shop can click to fix it",
  );
});

test("a recent failed payment is raised with the issuer’s reason", async () => {
  seed();
  db.failedPayment = {
    id: "pay-9",
    failureReason: "Card declined by issuer",
    createdAt: inDays(-1),
  };

  const res = await call("/notifications");
  const alert = res.json.alerts.find((a) =>
    a.key.startsWith("payment-failed:"),
  );
  assert.ok(alert);
  assert.match(alert.body, /Card declined by issuer/);
});

test("alerts are computed, so paying makes them disappear with nothing to clean up", async () => {
  seed();
  db.sub = { ...db.sub, currentPeriodEnd: inDays(-2) };
  assert.equal((await call("/notifications")).json.alerts.length, 1);

  // The shop renews.
  db.sub = { ...db.sub, currentPeriodEnd: inDays(30) };
  assert.equal(
    (await call("/notifications")).json.alerts.length,
    0,
    "no stale notice left behind",
  );
});

test("the badge counts alerts as well as unread messages", async () => {
  seed();
  db.sub = { ...db.sub, currentPeriodEnd: inDays(-2) };

  const res = await call("/notifications/unread-count");
  assert.equal(res.json.unread, 1, "one unread message");
  assert.equal(res.json.urgent, 1, "one alert needing attention");
  assert.equal(res.json.total, 2, "the bell shows both");
});

test("an informational alert does not make the bell shout", async () => {
  seed();
  // Renewing in 6 days is worth saying, not worth alarming anyone.
  db.sub = { ...db.sub, currentPeriodEnd: inDays(6) };

  const res = await call("/notifications/unread-count");
  const alerts = (await call("/notifications")).json.alerts;
  assert.equal(alerts[0].key, "renewal-due");
  assert.equal(alerts[0].tone, "info");
  assert.equal(
    res.json.urgent,
    0,
    "informational alerts are not counted as urgent",
  );
});

/* ------------------------------------------------------- the trial as a plan */

test("the admin catalogue includes the trial, the pricing page does not", async () => {
  // The trial is a real plan the admin manages; it is just not something to sell on a
  // pricing page. Filtering it out of both was why it went missing from the plans screen.
  seed();
  db.plans.push({
    id: "p-trial",
    code: "TRIAL",
    name: "Trial",
    blurb: null,
    isActive: true,
    isPublic: false,
    sortOrder: 0,
    maxUsers: 3,
    maxProducts: null,
    maxBillsPerMonth: null,
    features: [],
    retiredAt: null,
    monthlyListPrice: 0,
    monthlyPrice: 0,
    yearlyListPrice: 0,
    yearlyPrice: 0,
    currency: "INR",
    createdAt: new Date(),
  });

  const { getPlans, invalidatePlanCache, publicCatalogue } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  const { plans } = await getPlans({ fresh: true });
  assert.ok(
    plans.some((p) => p.code === "TRIAL"),
    "the admin sees it",
  );

  invalidatePlanCache();
  const pub = await publicCatalogue();
  assert.ok(
    !pub.plans.some((p) => p.tier === "TRIAL"),
    "the pricing page does not",
  );
});

test("the trial still appears when the plans table is empty", async () => {
  // config/plans.js has no TRIAL entry at all, so the fallback has to synthesise one or the
  // admin screen shows two plans and leaves the operator hunting for the free trial.
  seed();
  db.plans.length = 0;

  const { getPlans, invalidatePlanCache } =
    await import("../src/services/plan-catalogue.service.js");
  invalidatePlanCache();

  const { plans, source } = await getPlans({ fresh: true });
  assert.equal(source, "fallback");

  const trial = plans.find((p) => p.code === "TRIAL");
  assert.ok(trial, "synthesised from TRIAL_DAYS");
  assert.equal(trial.isPublic, false, "but still not on the pricing page");
  assert.equal(trial.intervals.MONTHLY.price, 0, "and free");
  assert.match(trial.blurb, /\d+ days/, trial.blurb);
});
