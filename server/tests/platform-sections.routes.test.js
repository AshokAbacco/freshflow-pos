/*
 * Follow-ups, Users, Payments, Webhooks and the Audit log, through real Express routers.
 *
 * Prisma is replaced with an in-memory double; the routers, auth middleware, zod schemas and
 * role gates are the real ones. The failures worth catching here are the quiet ones: a snooze
 * that leaves a chase still overdue, disabling a shop's last owner, and SUPPORT being able to
 * read the payment rail.
 *
 *   node --test --experimental-test-module-mocks tests/platform-sections.routes.test.js
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

const DAY = 86_400_000;
const at = (d) => new Date(Date.now() + d * DAY);

const admins = {
  "sess-super": {
    id: "adm-super",
    name: "Super",
    email: "super@ff.test",
    role: "SUPER_ADMIN",
    isActive: true,
    totpEnabled: false,
  },
  "sess-support": {
    id: "adm-support",
    name: "Support",
    email: "support@ff.test",
    role: "SUPPORT",
    isActive: true,
    totpEnabled: false,
  },
  "sess-finance": {
    id: "adm-finance",
    name: "Finance",
    email: "finance@ff.test",
    role: "FINANCE",
    isActive: true,
    totpEnabled: false,
  },
};

const db = {
  followUps: [],
  users: [],
  payments: [],
  webhooks: [],
  audits: [],
  orgs: [],
  platformAdmins: [],
};

/** Minimal `where` evaluation: equality, nested one level, OR, and the operators used here. */
function matches(row, where, ctx = {}) {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!cond.some((c) => matches(row, c, ctx))) return false;
      continue;
    }
    const value = row[key];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
    } else if (cond instanceof Date) {
      if (+value !== +cond) return false;
    } else if (typeof cond === "object") {
      if ("contains" in cond) {
        const hay = String(value ?? "");
        const needle = String(cond.contains);
        const hit =
          cond.mode === "insensitive"
            ? hay.toLowerCase().includes(needle.toLowerCase())
            : hay.includes(needle);
        if (!hit) return false;
      } else if ("not" in cond) {
        if (value === cond.not) return false;
      } else if (
        "lt" in cond ||
        "gte" in cond ||
        "lte" in cond ||
        "gt" in cond
      ) {
        const v = +value;
        if ("lt" in cond && !(v < +cond.lt)) return false;
        if ("gt" in cond && !(v > +cond.gt)) return false;
        if ("gte" in cond && !(v >= +cond.gte)) return false;
        if ("lte" in cond && !(v <= +cond.lte)) return false;
      } else if ("in" in cond) {
        if (!cond.in.includes(value)) return false;
      } else {
        // A nested relation filter, e.g. { organization: { name: { contains } } }
        const nested = ctx[key]?.(row);
        if (!nested || !matches(nested, cond, ctx)) return false;
      }
    } else if (value !== cond) return false;
  }
  return true;
}

const orgOf = (row) => db.orgs.find((o) => o.id === row.organizationId) ?? null;
const adminById = (id) => db.platformAdmins.find((a) => a.id === id) ?? null;

const withRelations = (row) => ({
  ...row,
  organization: orgOf(row),
  assignee: row.assigneeId ? adminById(row.assigneeId) : null,
  createdBy: row.createdById ? adminById(row.createdById) : null,
});

const table = (list, relate = (r) => r) => ({
  findMany: async ({ where, skip = 0, take = 1000 } = {}) =>
    list
      .filter((r) => matches(r, where, { organization: orgOf }))
      .slice(skip, skip + take)
      .map(relate),
  count: async ({ where } = {}) =>
    list.filter((r) => matches(r, where, { organization: orgOf })).length,
  findUnique: async ({ where }) => {
    const r = list.find((x) => x.id === where.id);
    return r ? relate(r) : null;
  },
  create: async ({ data }) => {
    const row = {
      id: `new-${list.length + 1}`,
      createdAt: new Date(),
      ...data,
    };
    list.push(row);
    return relate(row);
  },
  update: async ({ where, data }) => {
    const i = list.findIndex((x) => x.id === where.id);
    list[i] = { ...list[i], ...data };
    return relate(list[i]);
  },
});

const fakePrisma = {
  platformSession: {
    findUnique: async ({ where }) => {
      const admin = admins[where.id];
      return admin
        ? {
            id: where.id,
            adminId: admin.id,
            revokedAt: null,
            expiresAt: at(1),
            admin,
          }
        : null;
    },
  },
  followUp: table(db.followUps, withRelations),
  user: table(db.users, (u) => ({ ...u, organization: orgOf(u) })),
  payment: {
    ...table(db.payments, (p) => ({ ...p, organization: orgOf(p) })),
    aggregate: async ({ where }) => {
      const rows = db.payments.filter((r) =>
        matches(r, where, { organization: orgOf }),
      );
      return {
        _count: rows.length,
        _sum: {
          amount: rows.reduce((t, r) => t + Number(r.amount), 0),
          amountRefunded: rows.reduce(
            (t, r) => t + Number(r.amountRefunded ?? 0),
            0,
          ),
        },
      };
    },
  },
  webhookEvent: table(db.webhooks),
  auditLog: {
    ...table(db.audits),
    create: async ({ data }) => {
      const row = {
        id: `aud-${db.audits.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      db.audits.push(row);
      return row;
    },
    groupBy: async () => {
      const counts = new Map();
      for (const a of db.audits)
        counts.set(a.action, (counts.get(a.action) ?? 0) + 1);
      return [...counts].map(([action, n]) => ({
        action,
        _count: { action: n },
      }));
    },
  },
  organization: {
    findUnique: async ({ where }) =>
      db.orgs.find((o) => o.id === where.id) ?? null,
    findMany: async ({ where }) =>
      db.orgs.filter((o) =>
        where?.id?.in ? where.id.in.includes(o.id) : true,
      ),
  },
  platformAdmin: {
    findUnique: async ({ where }) => adminById(where.id),
  },
  $transaction: async (fn) => fn(fakePrisma),

  /*
   * Stands in for the phone-digit lookup, normalising the same way the SQL does. The real
   * statement runs against users_phone_digits_idx; what matters here is that "+91 98765 43210"
   * and "9876543210" resolve to the same user.
   */
  $queryRawUnsafe: async (sql, ...params) => {
    if (/FROM users/.test(sql) && /REGEXP_REPLACE/.test(sql)) {
      const wanted = String(params[0]);
      return db.users
        .filter(
          (u) =>
            String(u.phone ?? "")
              .replace(/\D/g, "")
              .slice(-10) === wanted,
        )
        .map((u) => ({ id: u.id }));
    }
    return [];
  },
};

let server;
let base;
let signToken;

before(async () => {
  mock.module("../src/lib/prisma.js", { namedExports: { prisma: fakePrisma } });

  const express = (await import("express")).default;
  const followUps = (await import("../src/routes/platform/followups.routes.js"))
    .default;
  const users = (await import("../src/routes/platform/users.routes.js"))
    .default;
  const payments = await import("../src/routes/platform/payments.routes.js");
  const audit = (await import("../src/routes/platform/audit.routes.js"))
    .default;
  const { signPlatformAccessToken } =
    await import("../src/services/platform-auth.service.js");
  signToken = (s) => signPlatformAccessToken(admins[s], s);

  const app = express();
  app.use(express.json());
  app.use("/follow-ups", followUps);
  app.use("/users", users);
  app.use("/payments", payments.default);
  app.use("/webhooks", payments.webhookRouter);
  app.use("/audit", audit);
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
  db.followUps.length = 0;
  db.users.length = 0;
  db.payments.length = 0;
  db.webhooks.length = 0;
  db.audits.length = 0;
  db.orgs.length = 0;
  db.platformAdmins.length = 0;

  db.platformAdmins.push(
    { id: "adm-super", name: "Super", email: "super@ff.test", isActive: true },
    {
      id: "adm-support",
      name: "Support",
      email: "support@ff.test",
      isActive: true,
    },
    {
      id: "adm-gone",
      name: "Left The Company",
      email: "gone@ff.test",
      isActive: false,
    },
  );
  db.orgs.push(
    {
      id: "o1",
      name: "Sri Lakshmi Stores",
      city: "Bengaluru",
      businessType: "SUPERMARKET",
    },
    {
      id: "o2",
      name: "Anand Kirana",
      city: "Hyderabad",
      businessType: "KIRANA",
    },
  );
  db.users.push(
    {
      id: "u1",
      organizationId: "o1",
      name: "Ravi Kumar",
      email: "ravi@x.test",
      phone: "+91 98765 43210",
      role: "ADMIN",
      isActive: true,
      lastLoginAt: at(-1),
      createdAt: at(-90),
    },
    {
      id: "u2",
      organizationId: "o1",
      name: "Priya",
      email: "priya@x.test",
      phone: null,
      role: "CASHIER",
      isActive: true,
      lastLoginAt: at(-2),
      createdAt: at(-80),
    },
    {
      id: "u3",
      organizationId: "o2",
      name: "Anand Rao",
      email: "anand@x.test",
      phone: null,
      role: "ADMIN",
      isActive: true,
      lastLoginAt: null,
      createdAt: at(-30),
    },
    {
      id: "u4",
      organizationId: "o2",
      name: "Second Owner",
      email: "second@x.test",
      phone: null,
      role: "ADMIN",
      isActive: true,
      lastLoginAt: null,
      createdAt: at(-20),
    },
  );
  db.followUps.push(
    {
      id: "f1",
      organizationId: "o1",
      title: "Chase the lapsed renewal",
      type: "RENEWAL",
      status: "OPEN",
      priority: "HIGH",
      dueAt: at(-5),
      assigneeId: "adm-super",
      createdById: "adm-super",
      result: null,
      autoKey: "RENEWAL:o1:2026-11-01",
      closedAt: null,
      createdAt: at(-10),
    },
    {
      id: "f2",
      organizationId: "o2",
      title: "Onboarding call",
      type: "ONBOARDING",
      status: "OPEN",
      priority: "NORMAL",
      dueAt: at(3),
      assigneeId: null,
      createdById: "adm-support",
      result: null,
      autoKey: null,
      closedAt: null,
      createdAt: at(-2),
    },
    {
      id: "f3",
      organizationId: "o1",
      title: "Old closed one",
      type: "OTHER",
      status: "DONE",
      priority: "LOW",
      dueAt: at(-20),
      assigneeId: "adm-super",
      createdById: "adm-super",
      result: "Sorted",
      autoKey: null,
      closedAt: at(-19),
      createdAt: at(-25),
    },
  );
  db.payments.push(
    {
      id: "p1",
      organizationId: "o1",
      plan: "STANDARD",
      interval: "MONTHLY",
      seats: 5,
      amount: 3250,
      amountCaptured: 3250,
      amountRefunded: 0,
      currency: "INR",
      status: "PAID",
      method: "upi",
      razorpayOrderId: "order_AAA",
      razorpayPaymentId: "pay_AAA",
      razorpaySignature: "sig",
      failureReason: null,
      paidAt: at(-3),
      createdAt: at(-3),
    },
    {
      id: "p2",
      organizationId: "o2",
      plan: "STANDARD",
      interval: "MONTHLY",
      seats: 2,
      amount: 1300,
      amountCaptured: null,
      amountRefunded: 0,
      currency: "INR",
      status: "PAID",
      method: "card",
      razorpayOrderId: "order_BBB",
      razorpayPaymentId: "pay_BBB",
      razorpaySignature: null,
      failureReason: null,
      paidAt: at(-6),
      createdAt: at(-6),
    },
    {
      id: "p3",
      organizationId: "o2",
      plan: "STANDARD",
      interval: "MONTHLY",
      seats: 2,
      amount: 1300,
      amountCaptured: null,
      amountRefunded: 0,
      currency: "INR",
      status: "FAILED",
      method: "card",
      razorpayOrderId: "order_CCC",
      razorpayPaymentId: null,
      razorpaySignature: null,
      failureReason: "Card declined by issuer",
      paidAt: null,
      createdAt: at(-7),
    },
  );
  db.webhooks.push(
    {
      id: "w1",
      eventId: "evt_1",
      event: "payment.captured",
      orderId: "order_AAA",
      paymentId: "pay_AAA",
      payload: '{"ok":true}',
      handled: true,
      error: null,
      receivedAt: at(-3),
    },
    {
      id: "w2",
      eventId: "evt_2",
      event: "payment.failed",
      orderId: "order_CCC",
      paymentId: null,
      payload: "not json at all",
      handled: false,
      error: "Signature mismatch",
      receivedAt: at(-7),
    },
  );
  db.audits.push(
    {
      id: "a1",
      action: "store.extended",
      actorLabel: "Super <super@ff.test>",
      actorRole: "SUPER_ADMIN",
      actorAdminId: "adm-super",
      organizationId: "o1",
      targetType: "subscription",
      targetId: "sub-1",
      reason: "Paid by bank transfer NEFT4471",
      changes: {},
      ip: "1.2.3.4",
      createdAt: at(-1),
    },
    {
      id: "a2",
      action: "store.suspended",
      actorLabel: "Super <super@ff.test>",
      actorRole: "SUPER_ADMIN",
      actorAdminId: "adm-super",
      organizationId: "gone-store",
      targetType: "subscription",
      targetId: "sub-9",
      reason: "Fraud",
      changes: {},
      ip: null,
      createdAt: at(-2),
    },
  );
}

async function call(
  path,
  { session = "sess-super", method = "GET", body } = {},
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${signToken(session)}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/* ---------------------------------------------------------------- follow-ups */

test("follow-ups default to the open ones", async () => {
  seed();
  const res = await call("/follow-ups");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.followUps.map((f) => f.id).sort(), ["f1", "f2"]);
});

test("overdue is computed from the clock, not stored", async () => {
  seed();
  const res = await call("/follow-ups");
  const byId = Object.fromEntries(res.json.followUps.map((f) => [f.id, f]));
  assert.equal(byId.f1.overdue, true, "due five days ago");
  assert.equal(byId.f2.overdue, false, "due in three days");
});

test("every role can work the follow-up list", async () => {
  seed();
  for (const s of ["sess-super", "sess-support", "sess-finance"]) {
    assert.equal((await call("/follow-ups", { session: s })).status, 200, s);
  }
});

test("the overdue and mine filters narrow correctly", async () => {
  seed();
  assert.deepEqual(
    (await call("/follow-ups?overdue=true")).json.followUps.map((f) => f.id),
    ["f1"],
  );
  assert.deepEqual(
    (await call("/follow-ups?assignee=me")).json.followUps.map((f) => f.id),
    ["f1"],
  );
  assert.deepEqual(
    (await call("/follow-ups?assignee=unassigned")).json.followUps.map(
      (f) => f.id,
    ),
    ["f2"],
  );
});

test("the counts behind the badge add up", async () => {
  seed();
  const res = await call("/follow-ups/counts");
  assert.equal(res.json.open, 2);
  assert.equal(res.json.overdue, 1);
  assert.equal(res.json.mine, 1, "assigned to the signed-in admin");
});

test("creating a follow-up needs a real store", async () => {
  seed();
  const res = await call("/follow-ups", {
    method: "POST",
    body: {
      organizationId: "nope",
      title: "Call them",
      dueAt: at(2).toISOString(),
    },
  });
  assert.equal(res.status, 404);
});

test("a created follow-up defaults to its creator and is audited", async () => {
  seed();
  const res = await call("/follow-ups", {
    method: "POST",
    body: {
      organizationId: "o1",
      title: "Call about the scale",
      type: "SUPPORT_ISSUE",
      dueAt: at(2).toISOString(),
    },
  });
  assert.equal(res.status, 201);
  assert.equal(
    res.json.followUp.assignee.id,
    "adm-super",
    "assigned to whoever raised it",
  );
  assert.equal(res.json.followUp.store.name, "Sri Lakshmi Stores");
  assert.equal(db.audits.at(-1).action, "followup.created");
});

test("snoozing an overdue chase moves it into the future, not further into the past", async () => {
  // The bug this guards: snoozing "by 3 days" from a due date that is already five days old
  // would leave the chase overdue and still shouting.
  seed();
  const res = await call("/follow-ups/f1/snooze", {
    method: "POST",
    body: { days: 3 },
  });
  assert.equal(res.status, 200);

  const dueIn = (+new Date(res.json.followUp.dueAt) - Date.now()) / DAY;
  assert.ok(
    dueIn > 2.9 && dueIn < 3.1,
    `due ~3 days from now, got ${dueIn.toFixed(2)}`,
  );
  assert.equal(res.json.followUp.overdue, false);
});

test("snoozing a future chase adds to its existing date", async () => {
  seed();
  const before = +new Date(db.followUps.find((f) => f.id === "f2").dueAt);
  await call("/follow-ups/f2/snooze", { method: "POST", body: { days: 4 } });
  const after = +new Date(db.followUps.find((f) => f.id === "f2").dueAt);
  assert.equal(Math.round((after - before) / DAY), 4);
});

test("closing a follow-up needs a result and records it", async () => {
  seed();
  assert.equal(
    (await call("/follow-ups/f1/close", { method: "POST", body: {} })).status,
    400,
  );

  const res = await call("/follow-ups/f1/close", {
    method: "POST",
    body: { result: "Owner paid over the phone" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.followUp.status, "DONE");
  assert.equal(res.json.followUp.result, "Owner paid over the phone");
  assert.equal(db.audits.at(-1).action, "followup.closed");
});

test("a follow-up cannot be closed twice", async () => {
  seed();
  const res = await call("/follow-ups/f3/close", {
    method: "POST",
    body: { result: "Again" },
  });
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, "ALREADY_CLOSED");
});

test("work cannot be assigned to a disabled platform account", async () => {
  seed();
  const res = await call("/follow-ups/f2/reassign", {
    method: "POST",
    body: { assigneeId: "adm-gone" },
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, "BAD_ASSIGNEE");
});

test("reassigning to an active admin works and is recorded", async () => {
  seed();
  const res = await call("/follow-ups/f2/reassign", {
    method: "POST",
    body: { assigneeId: "adm-support" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.followUp.assignee.id, "adm-support");
  assert.equal(db.audits.at(-1).action, "followup.reassigned");
});

/* --------------------------------------------------------------------- users */

test("users can be found across every store", async () => {
  seed();
  const res = await call("/users?q=ravi");
  assert.equal(res.status, 200);
  assert.equal(res.json.users.length, 1);
  assert.equal(res.json.users[0].store.name, "Sri Lakshmi Stores");
});

test("a user search by phone number works however it is written", async () => {
  // phoneKey returns null for anything that is not a phone, so this also guards the crash
  // that came from treating its result as a string.
  seed();
  for (const term of ["9876543210", "+91 98765 43210", "098765 43210"]) {
    const res = await call(`/users?q=${encodeURIComponent(term)}`);
    assert.equal(res.status, 200, term);
    assert.equal(res.json.users.length, 1, `searching "${term}"`);
    assert.equal(res.json.users[0].id, "u1");
  }
});

test("a short numeric term does not prefix-match a mobile", async () => {
  seed();
  const res = await call("/users?q=4321");
  assert.equal(res.status, 200);
  assert.equal(
    res.json.users.length,
    0,
    "a four-digit extension is not a phone number",
  );
});

test("a user search matches the store name too", async () => {
  seed();
  const res = await call("/users?q=Anand Kirana");
  assert.equal(res.json.users.length, 2, "both staff at that shop");
});

test("support cannot disable a staff account", async () => {
  seed();
  const res = await call("/users/u2/set-active", {
    session: "sess-support",
    method: "POST",
    body: { isActive: false, reason: "Left the company" },
  });
  assert.equal(res.status, 403);
  assert.equal(db.users.find((u) => u.id === "u2").isActive, true);
});

test("disabling a staff account needs a reason", async () => {
  seed();
  const res = await call("/users/u2/set-active", {
    method: "POST",
    body: { isActive: false },
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, "REASON_REQUIRED");
});

test("disabling a cashier works and is audited", async () => {
  seed();
  const res = await call("/users/u2/set-active", {
    method: "POST",
    body: { isActive: false, reason: "Left the company last Friday" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.isActive, false);
  assert.equal(db.audits.at(-1).action, "store_user.disabled");
});

test("a store’s last active owner cannot be disabled", async () => {
  // Otherwise the shop is locked out of its own settings, staff and billing.
  seed();
  const res = await call("/users/u1/set-active", {
    method: "POST",
    body: { isActive: false, reason: "Owner asked us to" },
  });
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, "LAST_OWNER");
  assert.equal(
    db.users.find((u) => u.id === "u1").isActive,
    true,
    "left alone",
  );
});

test("an owner can be disabled when the store has another one", async () => {
  seed();
  const res = await call("/users/u3/set-active", {
    method: "POST",
    body: { isActive: false, reason: "Handed over to the co-owner" },
  });
  assert.equal(res.status, 200, "o2 still has u4 as an active owner");
});

test("disabling an already disabled account is a conflict", async () => {
  seed();
  await call("/users/u2/set-active", {
    method: "POST",
    body: { isActive: false, reason: "Left the company" },
  });
  const again = await call("/users/u2/set-active", {
    method: "POST",
    body: { isActive: false, reason: "Left the company" },
  });
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, "NO_CHANGE");
});

/* ------------------------------------------------------------------ payments */

test("support is refused the payment rail entirely", async () => {
  seed();
  for (const path of [
    "/payments",
    "/payments/p1",
    "/webhooks",
    "/webhooks/w1",
  ]) {
    assert.equal(
      (await call(path, { session: "sess-support" })).status,
      403,
      path,
    );
  }
});

test("finance sees payments with a summary", async () => {
  seed();
  const res = await call("/payments", { session: "sess-finance" });
  assert.equal(res.status, 200);
  assert.equal(res.json.payments.length, 3);
  assert.equal(res.json.summary.paidCount, 2);
  assert.equal(res.json.summary.collected, 4550, "3250 + 1300");
});

test("a payment marked paid but never captured is flagged", async () => {
  // Money lost quietly: the plan was activated on a payment Razorpay never fully captured.
  seed();
  const res = await call("/payments");
  const byId = Object.fromEntries(res.json.payments.map((p) => [p.id, p]));
  assert.equal(byId.p1.mismatch, false, "captured matches charged");
  assert.equal(byId.p2.mismatch, true, "marked PAID with nothing captured");
  assert.equal(byId.p3.mismatch, false, "a failed payment is not a mismatch");
});

test("the mismatched filter returns only those", async () => {
  seed();
  const res = await call("/payments?mismatched=true");
  assert.deepEqual(
    res.json.payments.map((p) => p.id),
    ["p2"],
  );
});

test("a payment detail carries the webhook events for its order", async () => {
  seed();
  const res = await call("/payments/p1");
  assert.equal(res.status, 200);
  assert.equal(res.json.events.length, 1);
  assert.equal(res.json.events[0].event, "payment.captured");
});

test("the signature flag says whether we can prove the handover", async () => {
  seed();
  const res = await call("/payments");
  const byId = Object.fromEntries(res.json.payments.map((p) => [p.id, p]));
  assert.equal(byId.p1.hasSignature, true);
  assert.equal(byId.p2.hasSignature, false);
  assert.equal(
    typeof byId.p1.amount,
    "number",
    "decimals come back as numbers",
  );
});

test("unhandled webhooks are counted and filterable", async () => {
  seed();
  const all = await call("/webhooks");
  assert.equal(all.json.unhandled, 1);
  const failed = await call("/webhooks?handled=false");
  assert.deepEqual(
    failed.json.events.map((e) => e.id),
    ["w2"],
  );
  assert.equal(failed.json.events[0].error, "Signature mismatch");
});

test("a webhook payload that is not JSON still opens", async () => {
  seed();
  const res = await call("/webhooks/w2");
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.event.payload,
    { raw: "not json at all" },
    "shown rather than crashing",
  );
});

/* --------------------------------------------------------------------- audit */

test("support cannot read the audit log", async () => {
  seed();
  assert.equal((await call("/audit", { session: "sess-support" })).status, 403);
});

test("the audit log reads newest first with store names resolved", async () => {
  seed();
  const res = await call("/audit");
  assert.equal(res.status, 200);
  assert.equal(res.json.entries[0].id, "a1");
  assert.equal(res.json.entries[0].storeName, "Sri Lakshmi Stores");
});

test("an entry for a store that no longer exists still reads", async () => {
  // AuditLog has no foreign key on purpose, so history outlives the store.
  seed();
  const res = await call("/audit");
  const orphan = res.json.entries.find((e) => e.id === "a2");
  assert.equal(orphan.storeId, "gone-store");
  assert.equal(orphan.storeName, null, "no name, but the entry survives");
  assert.equal(orphan.reason, "Fraud");
});

test("the audit log filters by action and free text", async () => {
  seed();
  assert.deepEqual(
    (await call("/audit?action=store.suspended")).json.entries.map((e) => e.id),
    ["a2"],
  );
  assert.deepEqual(
    (await call("/audit?q=NEFT4471")).json.entries.map((e) => e.id),
    ["a1"],
  );
});

test("the actions list is offered for the filter", async () => {
  seed();
  const res = await call("/audit/actions");
  assert.equal(res.status, 200);
  assert.ok(res.json.actions.some((a) => a.action === "store.extended"));
});

test("there is no route that edits or deletes an audit entry", async () => {
  seed();
  for (const method of ["POST", "DELETE"]) {
    const res = await call("/audit/a1", { method });
    assert.ok(
      res.status === 404 || res.status === 405,
      `${method} is not offered (got ${res.status})`,
    );
  }
});
