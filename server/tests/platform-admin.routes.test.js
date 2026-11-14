/*
 * Account, Team, Plans, Messages, Inbox and Settings, through real Express routers.
 *
 * The failures that matter here are the ones that cannot be undone from inside the panel:
 * demoting the last super admin, disabling your own account, deleting a plan stores are
 * paying for, and sending a message to every shop twice.
 *
 *   node --test --experimental-test-module-mocks tests/platform-admin.routes.test.js
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before, mock } from 'node:test';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-that-is-definitely-long-enough-32';
process.env.DATABASE_URL ||= 'postgresql://postgres@127.0.0.1:5433/freshflow';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_1234567890abcd';
process.env.RAZORPAY_KEY_SECRET ||= 'testsecretvaluewithnoprefix1234';
process.env.RAZORPAY_WEBHOOK_SECRET ||= 'testwebhooksecretvaluelongenough';

const DAY = 86_400_000;
const at = (d) => new Date(Date.now() + d * DAY);

const PASSWORD = 'Correct-Horse-99';
const HASH = bcrypt.hashSync(PASSWORD, 4);

const sessions = {
  'sess-super': 'adm-super',
  'sess-support': 'adm-support',
  'sess-finance': 'adm-finance',
};

const db = {
  admins: [], sessionRows: [], plans: [], messages: [], recipients: [],
  replies: [], settings: [], audits: [], orgs: [], subs: [], tokens: [],
};

function reset() {
  db.admins.length = 0; db.sessionRows.length = 0; db.plans.length = 0;
  db.messages.length = 0; db.recipients.length = 0; db.replies.length = 0;
  db.settings.length = 0; db.audits.length = 0; db.orgs.length = 0;
  db.subs.length = 0; db.tokens.length = 0;

  db.admins.push(
    { id: 'adm-super', name: 'Super', email: 'super@ff.test', phone: null, role: 'SUPER_ADMIN', passwordHash: HASH, totpEnabled: false, isActive: true, failedLogins: 0, lockedUntil: null, lastLoginAt: null, passwordSetAt: at(-30), createdAt: at(-100) },
    { id: 'adm-super2', name: 'Second Super', email: 'super2@ff.test', phone: null, role: 'SUPER_ADMIN', passwordHash: HASH, totpEnabled: false, isActive: true, failedLogins: 0, lockedUntil: null, lastLoginAt: null, passwordSetAt: at(-30), createdAt: at(-90) },
    { id: 'adm-support', name: 'Support', email: 'support@ff.test', phone: null, role: 'SUPPORT', passwordHash: HASH, totpEnabled: false, isActive: true, failedLogins: 0, lockedUntil: null, lastLoginAt: null, passwordSetAt: at(-30), createdAt: at(-80) },
    { id: 'adm-finance', name: 'Finance', email: 'finance@ff.test', phone: null, role: 'FINANCE', passwordHash: HASH, totpEnabled: false, isActive: true, failedLogins: 0, lockedUntil: null, lastLoginAt: null, passwordSetAt: at(-30), createdAt: at(-70) },
  );
  db.sessionRows.push(
    { id: 'sess-super', adminId: 'adm-super', ip: '1.2.3.4', userAgent: 'Chrome', revokedAt: null, expiresAt: at(7), createdAt: at(-1) },
    { id: 'sess-super-old', adminId: 'adm-super', ip: '9.9.9.9', userAgent: 'Safari on iPhone', revokedAt: null, expiresAt: at(7), createdAt: at(-5) },
    { id: 'sess-support', adminId: 'adm-support', ip: null, userAgent: null, revokedAt: null, expiresAt: at(7), createdAt: at(-1) },
    { id: 'sess-finance', adminId: 'adm-finance', ip: null, userAgent: null, revokedAt: null, expiresAt: at(7), createdAt: at(-1) },
  );
  db.plans.push(
    { id: 'p-std', code: 'STANDARD', name: 'Standard', blurb: null, isActive: true, isPublic: true, sortOrder: 10, maxUsers: null, maxProducts: null, maxBillsPerMonth: null, features: [], monthlyListPrice: 850, monthlyPrice: 650, yearlyListPrice: 650, yearlyPrice: 550, currency: 'INR', retiredAt: null, createdAt: at(-100) },
    { id: 'p-cus', code: 'CUSTOM', name: 'Custom', blurb: null, isActive: true, isPublic: true, sortOrder: 20, maxUsers: null, maxProducts: null, maxBillsPerMonth: null, features: [], monthlyListPrice: 1300, monthlyPrice: 1000, yearlyListPrice: 1000, yearlyPrice: 800, currency: 'INR', retiredAt: null, createdAt: at(-100) },
  );
  db.orgs.push(
    { id: 'o1', name: 'Sri Lakshmi', city: 'Bengaluru', businessType: 'SUPERMARKET' },
    { id: 'o2', name: 'Anand Kirana', city: 'Hyderabad', businessType: 'KIRANA' },
  );
  db.subs.push(
    { id: 's1', organizationId: 'o1', plan: 'STANDARD', cancelledAt: null },
    { id: 's2', organizationId: 'o2', plan: 'STANDARD', cancelledAt: null },
  );
  db.replies.push(
    { id: 'r1', messageId: null, organizationId: 'o1', userId: 'u1', authorLabel: 'Ravi', body: 'The scale is not connecting', handledAt: null, handledById: null, createdAt: at(-2) },
    { id: 'r2', messageId: null, organizationId: 'o2', userId: 'u2', authorLabel: 'Anand', body: 'Thanks, sorted', handledAt: at(-1), handledById: 'adm-super', createdAt: at(-3) },
  );
}

const find = (list, id) => list.find((x) => x.id === id) ?? null;

/*
 * Prisma returns detached rows: a later update() does not mutate what a findUnique() handed
 * back earlier. Returning the live object instead makes a route that compares "before" with
 * "after" always see them equal, so reads are copied.
 */
const copy = (row) => (row ? { ...row } : null);

const fakePrisma = {
  platformSession: {
    findUnique: async ({ where }) => {
      const s = find(db.sessionRows, where.id);
      if (!s) return null;
      return { ...s, admin: find(db.admins, s.adminId) };
    },
    findMany: async ({ where }) =>
      db.sessionRows.filter(
        (s) => s.adminId === where.adminId && s.revokedAt === null && +s.expiresAt > Date.now(),
      ),
    update: async ({ where, data }) => {
      const s = find(db.sessionRows, where.id);
      Object.assign(s, data);
      return s;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const s of db.sessionRows) {
        if (where.id && s.id !== where.id) continue;
        if (where.adminId && s.adminId !== where.adminId) continue;
        if (where.revokedAt === null && s.revokedAt !== null) continue;
        Object.assign(s, data);
        count += 1;
      }
      return { count };
    },
    groupBy: async () => {
      const counts = new Map();
      for (const s of db.sessionRows) {
        if (s.revokedAt || +s.expiresAt <= Date.now()) continue;
        counts.set(s.adminId, (counts.get(s.adminId) ?? 0) + 1);
      }
      return [...counts].map(([adminId, n]) => ({ adminId, _count: { adminId: n } }));
    },
  },
  platformAdmin: {
    findUnique: async ({ where }) =>
      copy(where.id ? find(db.admins, where.id) : (db.admins.find((a) => a.email === where.email) ?? null)),
    findMany: async () => db.admins.map(copy),
    count: async ({ where }) =>
      db.admins.filter(
        (a) =>
          (where.role === undefined || a.role === where.role) &&
          (where.isActive === undefined || a.isActive === where.isActive) &&
          (where.id?.not === undefined || a.id !== where.id.not) &&
          (where.lockedUntil?.gt === undefined || (a.lockedUntil && +a.lockedUntil > +where.lockedUntil.gt)),
      ).length,
    create: async ({ data }) => {
      const row = { id: `adm-${db.admins.length + 1}`, phone: null, totpEnabled: false, failedLogins: 0, lockedUntil: null, lastLoginAt: null, passwordSetAt: new Date(), createdAt: new Date(), ...data };
      db.admins.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const a = find(db.admins, where.id);
      Object.assign(a, data);
      return copy(a);
    },
  },
  platformPasswordToken: { create: async ({ data }) => { db.tokens.push(data); return data; } },
  plan: {
    findMany: async () => [...db.plans].sort((a, b) => a.sortOrder - b.sortOrder),
    findUnique: async ({ where }) =>
      where.id ? find(db.plans, where.id) : (db.plans.find((p) => p.code === where.code) ?? null),
    create: async ({ data }) => {
      const row = { id: `p-${db.plans.length + 1}`, maxUsers: null, maxProducts: null, maxBillsPerMonth: null, features: [], monthlyListPrice: 0, monthlyPrice: 0, yearlyListPrice: 0, yearlyPrice: 0, currency: 'INR', isActive: true, isPublic: true, sortOrder: 0, blurb: null, retiredAt: null, createdAt: new Date(), ...data };
      db.plans.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const p = find(db.plans, where.id);
      Object.assign(p, data);
      return p;
    },
  },
  subscription: {
    groupBy: async () => {
      const counts = new Map();
      for (const s of db.subs) {
        if (s.cancelledAt) continue;
        counts.set(s.plan, (counts.get(s.plan) ?? 0) + 1);
      }
      return [...counts].map(([plan, n]) => ({ plan, _count: { plan: n } }));
    },
  },
  platformMessage: {
    findMany: async () => db.messages.map((m) => ({
      ...m,
      _count: { recipients: db.recipients.filter((r) => r.messageId === m.id).length },
    })),
    findUnique: async ({ where }) => find(db.messages, where.id),
    create: async ({ data }) => {
      const row = { id: `m-${db.messages.length + 1}`, channel: 'IN_APP', sentAt: null, createdAt: new Date(), ...data };
      db.messages.push(row);
      return { ...row, _count: { recipients: 0 } };
    },
    update: async ({ where, data }) => {
      const m = find(db.messages, where.id);
      Object.assign(m, data);
      return m;
    },
    delete: async ({ where }) => {
      const i = db.messages.findIndex((m) => m.id === where.id);
      return db.messages.splice(i, 1)[0];
    },
  },
  platformMessageRecipient: {
    createMany: async ({ data, skipDuplicates }) => {
      let count = 0;
      for (const row of data) {
        const dupe = db.recipients.some(
          (r) => r.messageId === row.messageId && r.organizationId === row.organizationId,
        );
        if (dupe && skipDuplicates) continue;
        db.recipients.push({ id: `rec-${db.recipients.length + 1}`, readAt: null, ...row });
        count += 1;
      }
      return { count };
    },
    groupBy: async () => [],
  },
  storeMessageReply: {
    findMany: async ({ where, skip = 0, take = 50 }) =>
      db.replies
        .filter((r) => (where.handledAt === null ? r.handledAt === null : r.handledAt !== null))
        .sort((a, b) => +a.createdAt - +b.createdAt)
        .slice(skip, skip + take)
        .map((r) => ({
          ...r,
          organization: find(db.orgs, r.organizationId),
          message: r.messageId ? find(db.messages, r.messageId) : null,
        })),
    count: async ({ where }) =>
      db.replies.filter((r) =>
        where?.handledAt === null ? r.handledAt === null : where?.handledAt ? r.handledAt !== null : true,
      ).length,
    findUnique: async ({ where }) => find(db.replies, where.id),
    update: async ({ where, data }) => {
      const r = find(db.replies, where.id);
      Object.assign(r, data);
      return r;
    },
  },
  platformSetting: {
    findMany: async () => [...db.settings],
    upsert: async ({ where, create, update }) => {
      const existing = db.settings.find((s) => s.key === where.key);
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const row = { ...create, updatedAt: new Date() };
      db.settings.push(row);
      return row;
    },
  },
  organization: {
    findMany: async ({ where }) =>
      db.orgs.filter((o) => (where?.id?.in ? where.id.in.includes(o.id) : true)),
  },
  auditLog: {
    create: async ({ data }) => {
      db.audits.push(data);
      return { id: `a-${db.audits.length}`, ...data };
    },
  },
  $transaction: async (arg) => (typeof arg === 'function' ? arg(fakePrisma) : Promise.all(arg)),
  $queryRawUnsafe: async (sql) => {
    // The audience resolver's only raw query: return every seeded store.
    if (/FROM organizations/.test(sql)) return db.orgs.map((o) => ({ id: o.id, name: o.name }));
    return [];
  },
};

let server; let base; let signToken;

before(async () => {
  mock.module('../src/lib/prisma.js', { namedExports: { prisma: fakePrisma } });
  reset();

  const express = (await import('express')).default;
  const account = (await import('../src/routes/platform/account.routes.js')).default;
  const team = (await import('../src/routes/platform/team.routes.js')).default;
  const plans = (await import('../src/routes/platform/plans.routes.js')).default;
  const messages = await import('../src/routes/platform/messages.routes.js');
  const settings = await import('../src/routes/platform/settings.routes.js');
  const { signPlatformAccessToken } = await import('../src/services/platform-auth.service.js');

  signToken = (sessionId) =>
    signPlatformAccessToken(find(db.admins, sessions[sessionId]), sessionId);

  const app = express();
  app.use(express.json());
  app.use('/account', account);
  app.use('/team', team);
  app.use('/plans', plans);
  app.use('/messages', messages.default);
  app.use('/inbox', messages.inboxRouter);
  app.use('/settings', settings.default);
  app.use('/health', settings.healthRouter);
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.name === 'ZodError' ? 400 : 500);
    res.status(status).json({ error: { code: err.code || 'ERROR', message: err.message } });
  });

  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => (server ? server.close(r) : r())));

async function call(path, { session = 'sess-super', method = 'GET', body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${signToken(session)}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/* ------------------------------------------------------------------ account */

test('you can see your own account and your signed-in devices', async () => {
  reset();
  const res = await call('/account');
  assert.equal(res.status, 200);
  assert.equal(res.json.admin.email, 'super@ff.test');
  assert.equal(res.json.sessions.length, 2);
  assert.equal(res.json.sessions.filter((s) => s.current).length, 1, 'this device is marked');
  assert.equal(res.json.admin.passwordHash, undefined, 'the hash never leaves the server');
});

test('any role can change their own name', async () => {
  reset();
  const res = await call('/account', { session: 'sess-support', method: 'PATCH', body: { name: 'Support Person' } });
  assert.equal(res.status, 200);
  assert.equal(find(db.admins, 'adm-support').name, 'Support Person');
});

test('changing your email needs your current password', async () => {
  reset();
  const wrong = await call('/account/email', {
    method: 'POST', body: { email: 'new@ff.test', currentPassword: 'not-it' },
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.code, 'BAD_CURRENT_PASSWORD');
  assert.equal(find(db.admins, 'adm-super').email, 'super@ff.test', 'unchanged');

  const right = await call('/account/email', {
    method: 'POST', body: { email: 'new@ff.test', currentPassword: PASSWORD },
  });
  assert.equal(right.status, 200);
  assert.equal(find(db.admins, 'adm-super').email, 'new@ff.test');
});

test('you cannot take an email another admin already uses', async () => {
  reset();
  const res = await call('/account/email', {
    method: 'POST', body: { email: 'support@ff.test', currentPassword: PASSWORD },
  });
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'EMAIL_TAKEN');
});

test('changing your password needs the current one and a strong new one', async () => {
  reset();
  const wrong = await call('/account/password', {
    method: 'POST', body: { currentPassword: 'nope', newPassword: 'Another-Good-1' },
  });
  assert.equal(wrong.status, 401);

  const weak = await call('/account/password', {
    method: 'POST', body: { currentPassword: PASSWORD, newPassword: 'short' },
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.json.error.code, 'WEAK_PASSWORD');

  const same = await call('/account/password', {
    method: 'POST', body: { currentPassword: PASSWORD, newPassword: PASSWORD },
  });
  assert.equal(same.status, 400);
  assert.equal(same.json.error.code, 'SAME_PASSWORD');
});

test('a password change signs other devices out but keeps you signed in here', async () => {
  reset();
  const res = await call('/account/password', {
    method: 'POST', body: { currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-7' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.signedOutOtherDevices, true);

  assert.equal(find(db.sessionRows, 'sess-super').revokedAt, null, 'this device still works');
  assert.ok(find(db.sessionRows, 'sess-super-old').revokedAt, 'the other device was signed out');

  // And the new password actually took.
  assert.ok(bcrypt.compareSync('Brand-New-Pass-7', find(db.admins, 'adm-super').passwordHash));
  assert.equal(db.audits.at(-1).action, 'platform.password_reset');
});

test('a password change can keep other devices signed in if asked', async () => {
  reset();
  await call('/account/password', {
    method: 'POST',
    body: { currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-7', signOutOthers: false },
  });
  assert.equal(find(db.sessionRows, 'sess-super-old').revokedAt, null);
});

test('you can sign out another device but not this one', async () => {
  reset();
  const self = await call('/account/sessions/sess-super', { method: 'DELETE' });
  assert.equal(self.status, 400);
  assert.equal(self.json.error.code, 'CURRENT_SESSION');

  const other = await call('/account/sessions/sess-super-old', { method: 'DELETE' });
  assert.equal(other.status, 200);
  assert.ok(find(db.sessionRows, 'sess-super-old').revokedAt);
});

test('you cannot sign out a device belonging to someone else', async () => {
  reset();
  const res = await call('/account/sessions/sess-support', { method: 'DELETE' });
  assert.equal(res.status, 404, 'not found rather than forbidden: it is not yours to see');
  assert.equal(find(db.sessionRows, 'sess-support').revokedAt, null);
});

/* --------------------------------------------------------------------- team */

test('only a super admin can see the team', async () => {
  reset();
  assert.equal((await call('/team', { session: 'sess-support' })).status, 403);
  assert.equal((await call('/team', { session: 'sess-finance' })).status, 403);
  assert.equal((await call('/team')).status, 200);
});

test('the team list reports who is signed in where', async () => {
  reset();
  const res = await call('/team');
  const sup = res.json.admins.find((a) => a.id === 'adm-super');
  assert.equal(sup.activeSessions, 2);
  assert.equal(res.json.superAdmins, 2);
});

test('inviting creates an account with no usable password and returns a link', async () => {
  reset();
  const res = await call('/team', {
    method: 'POST',
    body: { name: 'New Person', email: 'new@ff.test', role: 'SUPPORT' },
  });
  assert.equal(res.status, 201);
  assert.ok(res.json.inviteToken, 'a one-time link is returned');

  const created = db.admins.find((a) => a.email === 'new@ff.test');
  assert.equal(created.passwordHash, 'invite-pending', 'nobody chose their password for them');
  assert.equal(db.tokens.at(-1).purpose, 'INVITE');
});

test('an invite cannot reuse an existing email', async () => {
  reset();
  const res = await call('/team', {
    method: 'POST', body: { name: 'Clash', email: 'support@ff.test', role: 'SUPPORT' },
  });
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'EMAIL_TAKEN');
});

test('you cannot disable or demote yourself', async () => {
  reset();
  const disable = await call('/team/adm-super', { method: 'PATCH', body: { isActive: false } });
  assert.equal(disable.status, 409);
  assert.equal(disable.json.error.code, 'SELF_DISABLE');

  const demote = await call('/team/adm-super', { method: 'PATCH', body: { role: 'SUPPORT' } });
  assert.equal(demote.status, 409);
  assert.equal(demote.json.error.code, 'SELF_DEMOTE');
});

test('the last-super-admin guard refuses the change', async () => {
  reset();
  /*
   * Not reachable through PATCH /team: every caller there is an active super admin, so the
   * target is never the last one -- SELF_DEMOTE catches that case first. The guard still runs
   * on every change and is what the admin-set CLI relies on, so it is tested where it bites.
   */
  const { assertNotLastSuperAdmin } = await import('../src/services/platform-auth.service.js');

  find(db.admins, 'adm-super2').role = 'SUPPORT';  // leave exactly one super admin

  await assert.rejects(
    () => assertNotLastSuperAdmin('adm-super', { nextRole: 'SUPPORT' }),
    (err) => err.code === 'LAST_SUPER_ADMIN',
    'demoting the only super admin is refused',
  );
  await assert.rejects(
    () => assertNotLastSuperAdmin('adm-super', { nextActive: false }),
    (err) => err.code === 'LAST_SUPER_ADMIN',
    'disabling the only super admin is refused',
  );

  // With a second super admin back, the same change is fine.
  find(db.admins, 'adm-super2').role = 'SUPER_ADMIN';
  await assertNotLastSuperAdmin('adm-super', { nextRole: 'SUPPORT' });
});

test('demoting someone signs them out immediately', async () => {
  reset();
  const res = await call('/team/adm-finance', { method: 'PATCH', body: { role: 'SUPPORT' } });
  assert.equal(res.status, 200);
  assert.ok(find(db.sessionRows, 'sess-finance').revokedAt, 'their token stops working now');
});

test('a reset link can be issued, but not for a disabled account', async () => {
  reset();
  const ok = await call('/team/adm-support/reset-link', { method: 'POST' });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.resetToken);

  find(db.admins, 'adm-support').isActive = false;
  const off = await call('/team/adm-support/reset-link', { method: 'POST' });
  assert.equal(off.status, 409);
  assert.equal(off.json.error.code, 'INACTIVE');
});

/* -------------------------------------------------------------------- plans */

test('every role can read the plans, only a super admin can change them', async () => {
  reset();
  assert.equal((await call('/plans', { session: 'sess-support' })).status, 200);
  const res = await call('/plans', {
    session: 'sess-finance', method: 'POST',
    body: { code: 'PRO', name: 'Pro', pricing: { monthly: { listPrice: 2000, price: 1800 }, yearly: { listPrice: 1800, price: 1600 } } },
  });
  assert.equal(res.status, 403);
});

test('the plan list says how many stores are on each', async () => {
  reset();
  const res = await call('/plans');
  const std = res.json.plans.find((p) => p.code === 'STANDARD');
  assert.equal(std.storesOnPlan, 2);
  assert.equal(std.pricing.monthly.price, 650);
  assert.deepEqual(std.limits, { users: null, products: null, billsPerMonth: null }, 'null is unlimited');
});

test('a new plan can be created with real limits', async () => {
  reset();
  const res = await call('/plans', {
    method: 'POST',
    body: {
      code: 'STARTER', name: 'Starter',
      limits: { users: 2, products: 500, billsPerMonth: 1000 },
      pricing: { monthly: { listPrice: 400, price: 350 }, yearly: { listPrice: 350, price: 300 } },
    },
  });
  assert.equal(res.status, 201);
  assert.deepEqual(res.json.plan.limits, { users: 2, products: 500, billsPerMonth: 1000 });
  assert.equal(db.audits.at(-1).action, 'plan.created');
});

test('a plan code cannot be reused or changed later', async () => {
  reset();
  const dupe = await call('/plans', {
    method: 'POST',
    body: { code: 'STANDARD', name: 'Clash', pricing: { monthly: { listPrice: 1, price: 1 }, yearly: { listPrice: 1, price: 1 } } },
  });
  assert.equal(dupe.status, 409);
  assert.equal(dupe.json.error.code, 'CODE_TAKEN');

  const rename = await call('/plans/p-std', { method: 'PATCH', body: { code: 'STANDARD_V2', name: 'Standard' } });
  assert.equal(rename.status, 409);
  assert.equal(rename.json.error.code, 'CODE_IMMUTABLE');
});

test('retiring a plan needs a reason and reports who is still on it', async () => {
  reset();
  const noReason = await call('/plans/p-std/retire', { method: 'POST', body: {} });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.json.error.code, 'REASON_REQUIRED');

  const res = await call('/plans/p-std/retire', {
    method: 'POST', body: { reason: 'Replaced by the new Starter plan' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.storesStillOnIt, 2, 'they keep being billed on it');
  assert.ok(find(db.plans, 'p-std').retiredAt);
  assert.equal(find(db.plans, 'p-std').isPublic, false, 'off the pricing page');
});

test('there is no route that deletes a plan', async () => {
  reset();
  const res = await call('/plans/p-std', { method: 'DELETE' });
  assert.ok(res.status === 404 || res.status === 405, `got ${res.status}`);
  assert.equal(db.plans.length, 2, 'still there');
});

/* ----------------------------------------------------------------- messages */

test('a message is created as a draft and previews its audience first', async () => {
  reset();
  const preview = await call('/messages/preview', {
    method: 'POST', body: { audience: { state: ['EXPIRED'] } },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.json.count, 2, 'both seeded stores');

  const created = await call('/messages', {
    method: 'POST',
    body: { subject: 'Scheduled maintenance', body: 'We will be down on Sunday 2am.', audience: {} },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.message.status, 'DRAFT', 'nothing is sent on compose');
  assert.equal(db.recipients.length, 0);
});

test('only a super admin can send, and sending resolves recipients once', async () => {
  reset();
  await call('/messages', {
    method: 'POST', body: { subject: 'Notice', body: 'Something important', audience: {} },
  });
  const id = db.messages[0].id;

  const denied = await call(`/messages/${id}/send`, { session: 'sess-support', method: 'POST' });
  assert.equal(denied.status, 403);
  assert.equal(db.recipients.length, 0);

  const sent = await call(`/messages/${id}/send`, { method: 'POST' });
  assert.equal(sent.status, 200);
  assert.equal(sent.json.sentTo, 2);
  assert.equal(db.recipients.length, 2);
  assert.equal(db.audits.at(-1).action, 'message.sent');
});

test('a message cannot be sent twice', async () => {
  reset();
  await call('/messages', { method: 'POST', body: { subject: 'One', body: 'Only once', audience: {} } });
  const id = db.messages[0].id;
  await call(`/messages/${id}/send`, { method: 'POST' });

  const again = await call(`/messages/${id}/send`, { method: 'POST' });
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, 'ALREADY_SENT');
  assert.equal(db.recipients.length, 2, 'no second copy for anyone');
});

test('a sent message cannot be deleted, a draft can', async () => {
  reset();
  await call('/messages', { method: 'POST', body: { subject: 'Draft', body: 'Still writing', audience: {} } });
  const draftId = db.messages[0].id;
  assert.equal((await call(`/messages/${draftId}`, { method: 'DELETE' })).status, 200);

  await call('/messages', { method: 'POST', body: { subject: 'Sent', body: 'Gone out', audience: {} } });
  const sentId = db.messages[0].id;
  await call(`/messages/${sentId}/send`, { method: 'POST' });
  const res = await call(`/messages/${sentId}`, { method: 'DELETE' });
  assert.equal(res.status, 409, 'shopkeepers have already read it');
});

/* -------------------------------------------------------------------- inbox */

test('the inbox shows what is waiting, oldest first', async () => {
  reset();
  const res = await call('/inbox');
  assert.equal(res.status, 200);
  assert.equal(res.json.replies.length, 1, 'only the unhandled one');
  assert.equal(res.json.replies[0].body, 'The scale is not connecting');
  assert.equal(res.json.replies[0].store.name, 'Sri Lakshmi');
  assert.equal(res.json.waiting, 1);
});

test('marking a reply handled takes it out of the inbox, and can be undone', async () => {
  reset();
  const done = await call('/inbox/r1/handled', { method: 'POST' });
  assert.equal(done.status, 200);
  assert.ok(find(db.replies, 'r1').handledAt);
  assert.equal((await call('/inbox')).json.replies.length, 0);

  await call('/inbox/r1/handled', { method: 'POST' });
  assert.equal(find(db.replies, 'r1').handledAt, null, 'toggles back');
});

/* ----------------------------------------------------------------- settings */

test('settings report their defaults until they are changed', async () => {
  reset();
  const res = await call('/settings');
  assert.equal(res.status, 200);
  const grace = res.json.settings.find((s) => s.key === 'graceDays');
  assert.equal(grace.value, 7);
  assert.equal(grace.isDefault, true);
  assert.ok(grace.help.length > 10, 'each setting explains itself');
});

test('only a super admin can change a setting', async () => {
  reset();
  const res = await call('/settings', { session: 'sess-finance', method: 'PATCH', body: { graceDays: 10 } });
  assert.equal(res.status, 403);
});

test('an unknown setting key is refused rather than stored', async () => {
  reset();
  const res = await call('/settings', { method: 'PATCH', body: { somethingElse: 'x' } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'UNKNOWN_SETTING');
  assert.equal(db.settings.length, 0);
});

test('a setting outside its range is refused with a readable message', async () => {
  reset();
  const res = await call('/settings', { method: 'PATCH', body: { graceDays: 500 } });
  assert.equal(res.status, 400);
  assert.match(res.json.error.message, /between 0 and 90 days/);
});

test('a valid setting change is stored and audited', async () => {
  reset();
  const res = await call('/settings', { method: 'PATCH', body: { graceDays: 14, renewalNoticeDays: 10 } });
  assert.equal(res.status, 200);
  assert.equal(db.settings.find((s) => s.key === 'graceDays').value, 14);
  assert.equal(db.audits.at(-1).action, 'setting.changed');

  const after2 = await call('/settings');
  const grace = after2.json.settings.find((s) => s.key === 'graceDays');
  assert.equal(grace.value, 14);
  assert.equal(grace.isDefault, false);
});
