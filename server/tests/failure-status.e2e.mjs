import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const PORT = process.env.PORT || 4000;
const API = process.env.TEST_API_URL || `http://localhost:${PORT}/api`;
const MOCK_PORT = Number(process.env.MOCK_PORT || 4499);
const CONTROL = `http://localhost:${MOCK_PORT + 1}`;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@freshflow.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

/** Stop with an explanation rather than letting a later line crash on an undefined value. */
function bail(...lines) {
  console.error(`\n${lines.join('\n  ')}\n`);
  process.exit(2);
}


/*
 * These tests drive real checkout and webhook endpoints, so they must never run against the real
 * Razorpay API: that would create live orders, and with live keys, real charges. The server is
 * only pointed at the bundled mock when RAZORPAY_API_URL says so, and this refuses to run otherwise.
 */
function preflight() {
  const apiUrl = process.env.RAZORPAY_API_URL || '';
  if (!/localhost|127\.0\.0\.1/.test(apiUrl)) {
    bail(
      'Refusing to run: RAZORPAY_API_URL does not point at the local mock.',
      `It is currently: ${apiUrl || '(unset, so the real api.razorpay.com would be used)'}`,
      'Set this in server/.env, restart the API, then try again:',
      `  RAZORPAY_API_URL="http://localhost:${MOCK_PORT}/v1"`,
    );
  }
  if (!KEY_SECRET || !WEBHOOK_SECRET) {
    bail('Refusing to run: RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must be set in server/.env.');
  }
  if (process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_')) {
    bail('Refusing to run: live Razorpay keys are configured. Switch to test keys first.');
  }
}

async function requireServer() {
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`health check returned ${r.status}`);
  } catch (err) {
    bail(
      `Cannot reach the API at ${API} (${err.message}).`,
      'Start it in another terminal with `npm run dev`, or set TEST_API_URL to where it is running.',
    );
  }

  try {
    await fetch(`${CONTROL}/state`, { signal: AbortSignal.timeout(4000) });
  } catch {
    bail(
      `Cannot reach the mock gateway at ${CONTROL}.`,
      'Start it in another terminal with `npm run mock:razorpay`.',
    );
  }

  /*
   * Sign in once here rather than letting every later call fail with an undefined token.
   * An unseeded database is the usual reason, and the symptom without this check is a crash
   * deep in the first assertion that says nothing about the cause.
   */
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }),
  });
  const loginBody = await login.json().catch(() => null);

  if (!login.ok || !loginBody?.token) {
    const code = loginBody?.error?.code;
    if (code === 'RATE_LIMITED') {
      bail(
        'Sign-in is rate limited.',
        'Restart the API to clear it, or set LOGIN_RATE_LIMIT=500 in server/.env.',
      );
    }
    bail(
      `Could not sign in as ${SEED_ADMIN_EMAIL} (HTTP ${login.status}${code ? `, ${code}` : ''}).`,
      '',
      '  Either that account does not exist, or the password does not match. Check, in order:',
      '    1. Has the database been seeded?  npm run db:seed',
      '    2. Do SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in server/.env match the account that was',
      '       actually created? The tests sign in with those values, falling back to',
      '       admin@freshflow.local / Admin@12345.',
      '    3. Changing SEED_ADMIN_PASSWORD after the first seed does NOT change an existing account.',
      '       To reset it:  SEED_RESET_PASSWORDS=true npm run db:seed',
      '    4. Is DATABASE_URL in server/.env the same database the API you started is using?',
    );
  }

  /*
   * The API reads its Razorpay settings once, at boot. Editing .env after starting it leaves the
   * server with the old values while this test reads the new ones, so ask the server itself.
   */
  const sub = await fetch(`${API}/billing/subscription`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  const subBody = await sub.json().catch(() => null);

  if (!sub.ok) {
    bail(`The API rejected an authenticated request (HTTP ${sub.status}).`, JSON.stringify(subBody?.error ?? {}));
  }
  if (!subBody?.paymentsEnabled) {
    bail(
      'The running API has no Razorpay keys loaded, so checkout cannot create orders.',
      'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env, then RESTART the API.',
      'Its startup line should read: "Billing: Razorpay test mode".',
    );
  }
  if (subBody.paymentMode === 'live') {
    bail('The running API is using LIVE Razorpay keys.', 'Switch to test keys and restart it before running these tests.');
  }

  return loginBody.token;
}

const RUN = Date.now().toString(36);

preflight();
const ADMIN_TOKEN = await requireServer();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const call = async (m, p, t, b) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
};
let pass = 0, fail = 0;
const ok = (l, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? `  ${x}` : ''}`); };
const webhook = async (event, id) => {
  const body = JSON.stringify(event);
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  const r = await fetch(`${API}/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': id }, body });
  return { s: r.status, j: await r.json().catch(() => null) };
};

// requireServer() already signed in and validated this token.
const admin = ADMIN_TOKEN;

// --- 1. the reported bug: a declined payment must not sit at "Started"
const c1 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 3 });
let hist = (await call('GET', '/billing/payments', admin)).j.payments;
ok('fresh attempt shows as awaiting payment', hist[0].outcome === 'PENDING', hist[0].outcome);

const reported = await call('POST', `/billing/payments/${c1.j.orderId}/failed`, admin, { reason: 'Payment failed due to insufficient funds' });
hist = (await call('GET', '/billing/payments', admin)).j.payments;
ok('browser-reported decline marks it failed', reported.s === 200 && hist[0].outcome === 'FAILED', hist[0].outcome);
ok('failure reason is shown', hist[0].failureReason === 'Payment failed due to insufficient funds', hist[0].failureReason);

// --- 2. a paid payment can never be undone by that endpoint
const c2 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 3 });
await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_OK1_${RUN}`, order_id: c2.j.orderId, amount: c2.j.amount, currency: 'INR', status: 'captured', method: 'upi' } } } }, `evt_ok1_${RUN}`);
await call('POST', `/billing/payments/${c2.j.orderId}/failed`, admin, { reason: 'malicious' });
const paidRow = await prisma.payment.findUnique({ where: { razorpayOrderId: c2.j.orderId } });
ok('a captured payment cannot be marked failed', paidRow.status === 'PAID', paidRow.status);

// --- 3. another store cannot mark our attempt failed
const rival = (await call('POST', '/public/signup', null, { storeName: 'Rival', name: 'R O', email: `r${Date.now()}@x.test`, password: 'Secret@12345' })).j.token;
const c3 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 3 });
await call('POST', `/billing/payments/${c3.j.orderId}/failed`, rival, { reason: 'sabotage' });
const victim = await prisma.payment.findUnique({ where: { razorpayOrderId: c3.j.orderId } });
ok('another store cannot mark our attempt failed', victim.status === 'CREATED', victim.status);

// --- 4. webhook failure path still works
const c4 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 3 });
await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: `pay_F1_${RUN}`, order_id: c4.j.orderId, amount: c4.j.amount, error_description: 'Card declined by bank' } } } }, `evt_f1_${RUN}`);
const failedRow = await prisma.payment.findUnique({ where: { razorpayOrderId: c4.j.orderId } });
ok('webhook failure marks it failed with a reason', failedRow.status === 'FAILED' && failedRow.failureReason === 'Card declined by bank', failedRow.failureReason);

// --- 5. ANOTHER PROJECT's events on the same Razorpay account must be ignored safely
const foreign = await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_OTHERAPP_${RUN}`, order_id: `order_FROM_OTHER_PROJECT_${RUN}`, amount: 999900, currency: 'INR', status: 'captured' } } } }, `evt_foreign1_${RUN}`);
ok("another project's captured event is acknowledged, not applied", foreign.s === 200);
const strayCount = await prisma.payment.count({ where: { razorpayOrderId: `order_FROM_OTHER_PROJECT_${RUN}` } });
ok("another project's payment is not recorded here", strayCount === 0);
const logged = await prisma.webhookEvent.findUnique({ where: { eventId: `evt_foreign1_${RUN}` } });
ok("another project's event is logged and explained", Boolean(logged) && /another application/i.test(logged.error ?? ''), logged?.error);

// --- 6. abandoned labelling
// A brand-new store, so its payment history holds exactly this one row and the assertion
// cannot be thrown off by how many attempts earlier runs left behind.
const freshStore = (await call('POST', '/public/signup', null, {
  storeName: 'Stale Co', name: 'Stale Owner', email: `stale${RUN}@x.test`, password: 'Secret@12345',
})).j.token;
const stale = await call('POST', '/billing/checkout', freshStore, { plan: 'STANDARD', interval: 'MONTHLY', seats: 1 });
await prisma.payment.update({
  where: { razorpayOrderId: stale.j.orderId },
  data: { createdAt: new Date(Date.now() - 2 * 3600 * 1000) },
});
const oldRow = (await call('GET', '/billing/payments', freshStore)).j.payments[0];
ok('a long-pending attempt reads as not completed', oldRow.outcome === 'ABANDONED', oldRow.outcome);

console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
