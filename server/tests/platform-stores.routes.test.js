/*
 * Exercises the platform stores routes through a real Express app.
 *
 * The Prisma engine cannot be generated in every environment, so `lib/prisma.js` is replaced
 * with an in-memory double. Everything else is the real thing: the real router, the real auth
 * middleware verifying a real signed token, the real zod schemas, the real role gates. That is
 * the point -- the failures that matter here are "SUPPORT could suspend a store" and "extend
 * gave less time than asked", and neither shows up in a unit test of a helper.
 *
 *   node --test --experimental-test-module-mocks tests/platform-stores.routes.test.js
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-that-is-definitely-long-enough-32';
process.env.DATABASE_URL ||= 'postgresql://postgres@127.0.0.1:5433/freshflow';
// env.js rejects a secret that starts with rzp_, because that prefix means a key id was pasted
// into the secret slot. These placeholders respect that.
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_1234567890abcd';
process.env.RAZORPAY_KEY_SECRET ||= 'testsecretvaluewithnoprefix1234';
process.env.RAZORPAY_WEBHOOK_SECRET ||= 'testwebhooksecretvaluelongenough';

const DAY_MS = 86_400_000;
const at = (days) => new Date(Date.now() + days * DAY_MS);

/* ------------------------------------------------------------------ the double
 *
 * Only the calls these routes make. Each returns plain objects, and writes are recorded so a
 * test can assert that an audit row and a subscription event were actually written -- "the
 * action happened but left no trace" is the failure that matters for an audited back office.
 */
const db = {
  orgs: new Map(),
  subs: new Map(), // by organizationId
  notes: new Map(),
  users: [],
  audits: [],
  events: [],
};

const admins = {
  'sess-super': { id: 'adm-super', name: 'Super', email: 'super@ff.test', role: 'SUPER_ADMIN', isActive: true, totpEnabled: false },
  'sess-support': { id: 'adm-support', name: 'Support', email: 'support@ff.test', role: 'SUPPORT', isActive: true, totpEnabled: false },
  'sess-finance': { id: 'adm-finance', name: 'Finance', email: 'finance@ff.test', role: 'FINANCE', isActive: true, totpEnabled: false },
};

const fakePrisma = {
  platformSession: {
    findUnique: async ({ where }) => {
      const admin = admins[where.id];
      if (!admin) return null;
      return { id: where.id, adminId: admin.id, revokedAt: null, expiresAt: at(1), admin };
    },
  },
  organization: {
    // Returns copies, like Prisma: a row the handler loaded must not change under it when
    // something else updates the same record.
    findUnique: async ({ where }) => {
      const org = db.orgs.get(where.id);
      if (!org) return null;
      const sub = db.subs.get(org.id);
      return { ...org, subscription: sub ? { ...sub } : null, settings: org.settings ?? null };
    },
  },
  subscription: {
    /*
     * Replaces the stored row rather than mutating it in place. Mutating would alias the object
     * the route loaded before the update, so `sub.plan` would read back as the NEW plan and a
     * correct handler would look like it recorded the wrong `fromPlan`. Prisma detaches; so does
     * this.
     */
    update: async ({ where, data }) => {
      const entry = [...db.subs.entries()].find(([, s]) => s.id === where.id);
      if (!entry) throw new Error(`fixture: no subscription ${where.id}`);
      const [orgId, current] = entry;
      const merged = { ...current, ...data };
      db.subs.set(orgId, merged);
      return { ...merged };
    },
  },
  user: {
    count: async ({ where }) => db.users.filter((u) => u.organizationId === where.organizationId && (where.isActive === undefined || u.isActive === where.isActive)).length,
    findMany: async ({ where }) => db.users.filter((u) => u.organizationId === where.organizationId),
  },
  product: { count: async () => 0 },

  /*
   * change-plan now prices from the Plan table and checks that table's limits, so the double
   * carries the seeded plans. Null limits mean unlimited, which is what Standard and Custom
   * are today -- seats remain the only cap that bites.
   */
  plan: {
    findUnique: async ({ where }) =>
      ({
        TRIAL: { id: 'p-trial', code: 'TRIAL', name: 'Trial', isActive: true, retiredAt: null, maxUsers: null, maxProducts: null, maxBillsPerMonth: null, monthlyPrice: 0, yearlyPrice: 0 },
        STANDARD: { id: 'p-std', code: 'STANDARD', name: 'Standard', isActive: true, retiredAt: null, maxUsers: null, maxProducts: null, maxBillsPerMonth: null, monthlyPrice: 650, yearlyPrice: 550 },
        CUSTOM: { id: 'p-cus', code: 'CUSTOM', name: 'Custom', isActive: true, retiredAt: null, maxUsers: null, maxProducts: null, maxBillsPerMonth: null, monthlyPrice: 1000, yearlyPrice: 800 },
      })[where.code] ?? null,
  },
  transaction: { count: async () => 0 },
  payment: { findMany: async () => [] },
  subscriptionEvent: {
    findMany: async () => [],
    create: async ({ data }) => {
      db.events.push(data);
      return { id: `evt-${db.events.length}`, ...data };
    },
  },
  tenantNote: {
    findMany: async () => [],
    findUnique: async ({ where }) => db.notes.get(where.id) ?? null,
    create: async ({ data }) => {
      const note = { id: `note-${db.notes.size + 1}`, createdAt: new Date(), ...data };
      db.notes.set(note.id, note);
      return note;
    },
    delete: async ({ where }) => {
      const n = db.notes.get(where.id);
      db.notes.delete(where.id);
      return n;
    },
  },
  followUp: { findMany: async () => [] },
  auditLog: {
    create: async ({ data }) => {
      db.audits.push(data);
      return { id: `aud-${db.audits.length}`, ...data };
    },
    findMany: async () => [],
  },
  // The routes run each action in a transaction; the double just passes itself through, so the
  // handler's call sequence is exercised even though there is no real atomicity here.
  $transaction: async (fn) => fn(fakePrisma),
  $queryRawUnsafe: async (sql) => (/COUNT\(\*\)|AS total/i.test(sql) ? [{ total: 0 }] : []),
};

let server;
let base;
let signToken;

before(async () => {
  mock.module('../src/lib/prisma.js', { namedExports: { prisma: fakePrisma } });

  const express = (await import('express')).default;
  const storesRoutes = (await import('../src/routes/platform/stores.routes.js')).default;
  const { signPlatformAccessToken } = await import('../src/services/platform-auth.service.js');
  signToken = (sessionId) => signPlatformAccessToken(admins[sessionId], sessionId);

  const app = express();
  app.use(express.json());
  app.use('/api/v1/platform/stores', storesRoutes);
  // Mirrors the real error shape closely enough to assert on status and code.
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.name === 'ZodError' ? 400 : 500);
    res.status(status).json({ error: { code: err.code || 'ERROR', message: err.message, details: err.details } });
  });

  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1/platform/stores`;
});

after(() => new Promise((r) => (server ? server.close(r) : r())));

/** Resets the fixture so each test starts from a known store. */
function seed({ status = 'ACTIVE', currentPeriodEnd = at(30), suspendedAt = null, cancelledAt = null, trialEndsAt = null, seats = 3, plan = 'STANDARD', users = 1 } = {}) {
  db.orgs.clear(); db.subs.clear(); db.notes.clear();
  db.users = []; db.audits = []; db.events = [];

  db.orgs.set('org-1', { id: 'org-1', name: 'Sri Lakshmi Stores', legalName: null, businessType: 'KIRANA', city: 'Bengaluru', state: 'Karnataka', createdAt: at(-90), lastActiveAt: at(-1), settings: null });
  db.subs.set('org-1', { id: 'sub-1', organizationId: 'org-1', plan, interval: 'MONTHLY', seats, status, pricePerUser: 650, currency: 'INR', trialEndsAt, currentPeriodEnd, graceEndsAt: null, suspendedAt, suspendedReason: null, cancelledAt, lastPaymentAt: null });
  for (let i = 0; i < users; i += 1) {
    db.users.push({ id: `u-${i}`, organizationId: 'org-1', name: `Staff ${i}`, email: `s${i}@x.test`, phone: null, role: i === 0 ? 'ADMIN' : 'CASHIER', isActive: true, lastLoginAt: null, createdAt: at(-80) });
  }
  return db.subs.get('org-1');
}

async function call(path, { session = 'sess-super', method = 'GET', body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token ?? signToken(session)}` }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* CSV or empty */ }
  return { status: res.status, json, text, headers: res.headers };
}

/* ------------------------------------------------------------------- the gate */

test('an unauthenticated request is refused', async () => {
  seed();
  const res = await call('/', { token: null });
  assert.equal(res.status, 401);
});

test('a store sign-in token is refused with an explanation, not a bare 401', async () => {
  seed();
  // A token shaped like the cashier app's: store audience, no platform kind claim.
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'u-1', org: 'org-1', aud: 'freshflow-pos-client' })).toString('base64url');
  const res = await call('/', { token: `${header}.${payload}.sig` });
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'WRONG_TOKEN_AUDIENCE');
});

test('every role may read the store list and one store', async () => {
  seed();
  for (const session of ['sess-super', 'sess-support', 'sess-finance']) {
    assert.equal((await call('/', { session })).status, 200, `list as ${session}`);
    assert.equal((await call('/org-1', { session })).status, 200, `detail as ${session}`);
  }
});

test('an unknown store is a 404, not a 500', async () => {
  seed();
  const res = await call('/org-nope');
  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'NOT_FOUND');
});

test('support cannot suspend, change plan, extend or cancel', async () => {
  for (const [path, body] of [
    ['/org-1/suspend', { reason: 'testing the gate' }],
    ['/org-1/cancel', { reason: 'testing the gate' }],
    ['/org-1/extend', { days: 7, reason: 'testing the gate' }],
    ['/org-1/change-plan', { plan: 'CUSTOM', reason: 'testing the gate' }],
  ]) {
    seed();
    const res = await call(path, { session: 'sess-support', method: 'POST', body });
    assert.equal(res.status, 403, `${path} as SUPPORT`);
    assert.equal(db.events.length, 0, `${path} wrote nothing`);
  }
});

test('finance cannot suspend a store either', async () => {
  seed();
  const res = await call('/org-1/suspend', { session: 'sess-finance', method: 'POST', body: { reason: 'testing the gate' } });
  assert.equal(res.status, 403);
});

test('an action without a reason is refused', async () => {
  seed();
  const res = await call('/org-1/suspend', { method: 'POST', body: {} });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'REASON_REQUIRED');
  assert.equal(db.events.length, 0);
});

test('a one-word reason is not a reason', async () => {
  seed();
  const res = await call('/org-1/suspend', { method: 'POST', body: { reason: 'bad' } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'REASON_REQUIRED');
});

/* ---------------------------------------------------------------- the actions */

test('suspending records the reason, the audit row and the timeline entry', async () => {
  seed();
  const res = await call('/org-1/suspend', { method: 'POST', body: { reason: 'Chargeback fraud under review' } });
  assert.equal(res.status, 200);

  const sub = db.subs.get('org-1');
  assert.equal(sub.status, 'SUSPENDED');
  assert.ok(sub.suspendedAt instanceof Date);
  assert.equal(sub.suspendedReason, 'Chargeback fraud under review');

  assert.equal(db.events.length, 1, 'one timeline entry');
  assert.equal(db.events[0].type, 'SUSPENDED');
  assert.equal(db.events[0].reason, 'Chargeback fraud under review');
  assert.equal(db.events[0].actorLabel, 'Super <super@ff.test>');

  assert.equal(db.audits.length, 1, 'one audit row');
  assert.equal(db.audits[0].action, 'store.suspended');
  assert.equal(db.audits[0].actorRole, 'SUPER_ADMIN');
});

test('suspending an already suspended store is a conflict, not a second suspension', async () => {
  seed({ suspendedAt: at(-2), status: 'SUSPENDED' });
  const res = await call('/org-1/suspend', { method: 'POST', body: { reason: 'Trying again by mistake' } });
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'ALREADY_SUSPENDED');
  assert.equal(db.events.length, 0);
});

test('cancelling twice is a conflict', async () => {
  seed({ cancelledAt: at(-1), status: 'CANCELLED' });
  const res = await call('/org-1/cancel', { method: 'POST', body: { reason: 'Duplicate request' } });
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'ALREADY_CANCELLED');
});

test('extending an in-date plan adds to the existing end date', async () => {
  const sub = seed({ currentPeriodEnd: at(30) });
  const before = +sub.currentPeriodEnd;

  const res = await call('/org-1/extend', { method: 'POST', body: { days: 7, reason: 'Goodwill after outage' } });
  assert.equal(res.status, 200);

  const after = +db.subs.get('org-1').currentPeriodEnd;
  assert.equal(Math.round((after - before) / DAY_MS), 7, 'seven days added to the old end');
});

test('extending a lapsed plan gives the full extension from today', async () => {
  // The bug this guards: extending from a date that has already passed silently gives less
  // time than asked for. A plan that ended 14 days ago, "+7 days", must end 7 days from NOW --
  // not 7 days after it expired, which would leave it still expired.
  seed({ currentPeriodEnd: at(-14) });

  const res = await call('/org-1/extend', { method: 'POST', body: { days: 7, reason: 'Paid by bank transfer' } });
  assert.equal(res.status, 200);

  const end = db.subs.get('org-1').currentPeriodEnd;
  const daysFromNow = (+end - Date.now()) / DAY_MS;
  assert.ok(daysFromNow > 6.9 && daysFromNow < 7.1, `ends ~7 days from now, got ${daysFromNow.toFixed(2)}`);
  assert.ok(+end > Date.now(), 'the store is actually usable again');
});

test('extending clears a grace window and restores the right status', async () => {
  const sub = seed({ currentPeriodEnd: at(-1), status: 'PAST_DUE' });
  sub.graceEndsAt = at(6);

  await call('/org-1/extend', { method: 'POST', body: { days: 30, reason: 'Renewed over the phone' } });
  const next = db.subs.get('org-1');
  assert.equal(next.graceEndsAt, null, 'no stale grace window left behind');
  assert.equal(next.status, 'ACTIVE');
});

test('extending a trial keeps it a trial and moves both dates together', async () => {
  seed({ status: 'TRIALING', trialEndsAt: at(2), currentPeriodEnd: at(2) });
  await call('/org-1/extend', { method: 'POST', body: { days: 14, reason: 'Needs longer to migrate data' } });

  const next = db.subs.get('org-1');
  assert.equal(next.status, 'TRIALING', 'an extended trial is still a trial, not a paid plan');
  assert.equal(+next.trialEndsAt, +next.currentPeriodEnd, 'both dates move together');
});

test('extend validates its input', async () => {
  seed();
  for (const days of [0, -5, 400, 'soon']) {
    const res = await call('/org-1/extend', { method: 'POST', body: { days, reason: 'Checking validation' } });
    assert.equal(res.status, 400, `days=${days}`);
  }
});

test('a plan change that would strand existing staff is refused', async () => {
  seed({ seats: 9, users: 6 });
  const res = await call('/org-1/change-plan', { method: 'POST', body: { plan: 'STANDARD', seats: 3, reason: 'Downgrading at owner request' } });

  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'USAGE_EXCEEDS_PLAN');
  assert.deepEqual(res.json.error.details.violations, [{ key: 'users', usage: 6, limit: 3 }]);
  assert.equal(db.subs.get('org-1').seats, 9, 'the subscription was left alone');
  assert.equal(db.events.length, 0);
});

test('a plan change that fits takes the price from the catalogue', async () => {
  seed({ seats: 3, users: 2 });
  const res = await call('/org-1/change-plan', { method: 'POST', body: { plan: 'CUSTOM', interval: 'YEARLY', seats: 5, reason: 'Moving to the chain plan' } });
  assert.equal(res.status, 200);

  const next = db.subs.get('org-1');
  assert.equal(next.plan, 'CUSTOM');
  assert.equal(next.interval, 'YEARLY');
  assert.equal(next.seats, 5);
  assert.equal(next.pricePerUser, 800, 'CUSTOM yearly price, not whatever was posted');

  assert.equal(db.events[0].type, 'PLAN_CHANGED');
  assert.equal(db.events[0].fromPlan, 'STANDARD');
  assert.equal(db.events[0].toPlan, 'CUSTOM');
});

test('a plan change cannot invent a plan or a price', async () => {
  seed();
  const bogus = await call('/org-1/change-plan', { method: 'POST', body: { plan: 'FREE_FOREVER', reason: 'Trying it on' } });
  assert.equal(bogus.status, 400, 'unknown plan rejected');

  seed();
  const priced = await call('/org-1/change-plan', { method: 'POST', body: { plan: 'CUSTOM', pricePerUser: 1, reason: 'Trying it on' } });
  assert.equal(priced.status, 200);
  assert.equal(db.subs.get('org-1').pricePerUser, 1000, 'posted price ignored, catalogue wins');
});

test('reactivating a store whose plan lapsed while suspended does not hand back a live plan', async () => {
  // Lifting a suspension is not a grant of time. This is the one that would quietly give a
  // non-paying store a working till.
  seed({ status: 'SUSPENDED', suspendedAt: at(-40), currentPeriodEnd: at(-30) });

  const res = await call('/org-1/reactivate', { method: 'POST', body: { reason: 'Dispute resolved in their favour' } });
  assert.equal(res.status, 200);

  const next = db.subs.get('org-1');
  assert.equal(next.suspendedAt, null, 'the suspension is lifted');
  assert.equal(next.status, 'EXPIRED', 'but the lapsed plan is still lapsed');
});

test('reactivating a store that is still paid up restores it properly', async () => {
  seed({ status: 'SUSPENDED', suspendedAt: at(-3), currentPeriodEnd: at(60) });
  const res = await call('/org-1/reactivate', { method: 'POST', body: { reason: 'Suspended in error' } });

  assert.equal(res.status, 200);
  const next = db.subs.get('org-1');
  assert.equal(next.status, 'ACTIVE');
  assert.equal(next.suspendedReason, null);
  assert.equal(db.events[0].type, 'REACTIVATED');
  assert.equal(db.events[0].fromStatus, 'SUSPENDED');
});

test('reactivating a store that is not suspended is a conflict', async () => {
  seed();
  const res = await call('/org-1/reactivate', { method: 'POST', body: { reason: 'Nothing to undo here' } });
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'NOT_SUSPENDED');
});

test('the detail payload reports computed entitlement, not the stored column', async () => {
  seed({ status: 'ACTIVE', currentPeriodEnd: at(300), suspendedAt: at(-1) });
  const res = await call('/org-1');

  assert.equal(res.status, 200);
  assert.equal(res.json.subscription.storedStatus, 'ACTIVE', 'the column still says ACTIVE');
  assert.equal(res.json.entitlement.state, 'SUSPENDED', 'the answer is SUSPENDED');
  assert.equal(res.json.entitlement.canWrite, false);
});

test('the detail payload reports seats left', async () => {
  seed({ seats: 5, users: 3 });
  const res = await call('/org-1');
  assert.equal(res.json.usage.seats, 5);
  assert.equal(res.json.usage.users, 3);
  assert.equal(res.json.usage.seatsLeft, 2);
});

/* ------------------------------------------------------------------ the export */

test('support cannot export the store list, finance can', async () => {
  seed();
  const denied = await call('/?format=csv', { session: 'sess-support' });
  assert.equal(denied.status, 403, 'a support login cannot pull owner contact details out');

  const allowed = await call('/?format=csv', { session: 'sess-finance' });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get('content-type'), /text\/csv/);
  assert.match(allowed.headers.get('content-disposition'), /attachment; filename="stores-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(db.audits.at(-1).action, 'stores.exported', 'the export itself is audited');
});

/* ------------------------------------------------------------------- the notes */

test('anyone may add a note and it is attributed', async () => {
  seed();
  const res = await call('/org-1/notes', { session: 'sess-support', method: 'POST', body: { body: 'Owner called about the scale.' } });
  assert.equal(res.status, 201);
  assert.equal(res.json.note.authorLabel, 'Support <support@ff.test>');
  assert.equal(db.audits.at(-1).action, 'note.added');
});

test('a note needs a body', async () => {
  seed();
  assert.equal((await call('/org-1/notes', { method: 'POST', body: { body: '   ' } })).status, 400);
});

test('support cannot delete someone else’s note, a super admin can', async () => {
  seed();
  await call('/org-1/notes', { session: 'sess-finance', method: 'POST', body: { body: 'Finance looked into this.' } });
  const [id] = [...db.notes.keys()];

  const denied = await call(`/org-1/notes/${id}`, { session: 'sess-support', method: 'DELETE' });
  assert.equal(denied.status, 403);
  assert.equal(db.notes.size, 1, 'still there');

  const allowed = await call(`/org-1/notes/${id}`, { session: 'sess-super', method: 'DELETE' });
  assert.equal(allowed.status, 200);
  assert.equal(db.notes.size, 0);
});

test('a note id from another store cannot be deleted through this store', async () => {
  seed();
  await call('/org-1/notes', { method: 'POST', body: { body: 'Belongs to org-1.' } });
  const [id] = [...db.notes.keys()];
  db.notes.get(id).organizationId = 'org-other';

  const res = await call(`/org-1/notes/${id}`, { method: 'DELETE' });
  assert.equal(res.status, 404);
  assert.equal(db.notes.size, 1, 'not deleted');
});
