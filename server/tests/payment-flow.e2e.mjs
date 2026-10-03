// End-to-end billing checks against the mock Razorpay API.
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
const SEED_CASHIER_EMAIL = process.env.SEED_CASHIER_EMAIL || 'cashier@freshflow.local';
const SEED_CASHIER_PASSWORD = process.env.SEED_CASHIER_PASSWORD || 'Cashier@12345';

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
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { s: r.status, j: await r.json().catch(() => null) };
};
const stage = (p) => fetch(`${CONTROL}/stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
const sign = (orderId, paymentId) => crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

let passed = 0;
let failed = 0;
const ok = (label, cond, extra = '') => {
  if (cond) passed += 1; else failed += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
};

const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j.token;

const webhook = async (event, signatureSecret = WEBHOOK_SECRET, eventId = `evt_${Math.random().toString(36).slice(2)}`) => {
  const body = JSON.stringify(event);
  const sig = crypto.createHmac('sha256', signatureSecret).update(body).digest('hex');
  const r = await fetch(`${API}/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': eventId },
    body,
  });
  return { s: r.status, j: await r.json().catch(() => null) };
};

// ---------------------------------------------------------------- setup
// requireServer() already signed in and validated this token.
const admin = ADMIN_TOKEN;
const other = await call('POST', '/public/signup', null, {
  storeName: 'Rival Store', name: 'Rival Owner', email: `rival${Date.now()}@shop.test`, password: 'Secret@12345',
});
const rival = other.j.token;
const rivalOrgId = other.j.organization.id;

// ---------------------------------------------------- 1. happy path, auto-capture OFF
const checkout = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 4 });
ok('checkout creates an order', checkout.s === 200 && checkout.j.orderId.startsWith('order_'), `${checkout.j.orderId}, ₹${checkout.j.quote?.total}`);
ok('order amount is 650 x 4 in paise', checkout.j.amount === 650 * 4 * 100, `${checkout.j.amount} paise`);

// Simulate the common misconfiguration: Razorpay left the payment merely authorized, not captured.
const payId = `pay_MOCK_AUTH_${RUN}`;
await stage({ id: payId, orderId: checkout.j.orderId, amount: checkout.j.amount, status: 'authorized' });

const verify = await call('POST', '/billing/verify', admin, {
  razorpay_order_id: checkout.j.orderId,
  razorpay_payment_id: payId,
  razorpay_signature: sign(checkout.j.orderId, payId),
});
ok('authorized payment is captured, then plan activates', verify.s === 200 && verify.j.subscription.plan === 'STANDARD', `status ${verify.j.subscription?.status}, seats ${verify.j.subscription?.seats}`);

const state = await (await fetch(`${CONTROL}/state`)).json();
ok('money actually captured at the gateway', state.payments.find((p) => p.id === payId)?.status === 'captured');

const paidRow = await prisma.payment.findUnique({ where: { razorpayOrderId: checkout.j.orderId } });
ok('payment row records capture details', paidRow.status === 'PAID' && Number(paidRow.amountCaptured) === 2600 && paidRow.method === 'upi' && Boolean(paidRow.paidAt), `captured ₹${paidRow.amountCaptured} via ${paidRow.method}`);

// ---------------------------------------------------- 2. idempotency
const again = await call('POST', '/billing/verify', admin, {
  razorpay_order_id: checkout.j.orderId, razorpay_payment_id: payId, razorpay_signature: sign(checkout.j.orderId, payId),
});
ok('re-verifying the same payment does not extend twice', again.s === 200 && again.j.alreadyApplied === true && again.j.subscription.renewsOn === verify.j.subscription.renewsOn);

// ---------------------------------------------------- 3. forged signature
const c2 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 4 });
await stage({ id: `pay_FORGED_${RUN}`, orderId: c2.j.orderId, amount: c2.j.amount, status: 'authorized' });
const forged = await call('POST', '/billing/verify', admin, {
  razorpay_order_id: c2.j.orderId, razorpay_payment_id: `pay_FORGED_${RUN}`, razorpay_signature: 'f'.repeat(64),
});
ok('forged signature rejected', forged.s === 400 && forged.j.error.code === 'INVALID_SIGNATURE');
const forgedState = await (await fetch(`${CONTROL}/state`)).json();
ok('forged attempt never captures money', forgedState.payments.find((p) => p.id === `pay_FORGED_${RUN}`)?.status === 'authorized');

// ---------------------------------------------------- 4. cross-tenant protection (the bug fixed this turn)
const c3 = await call('POST', '/billing/checkout', admin, { plan: 'CUSTOM', interval: 'MONTHLY', seats: 2 });
const sabotage = await call('POST', '/billing/verify', rival, {
  razorpay_order_id: c3.j.orderId, razorpay_payment_id: 'pay_WHATEVER', razorpay_signature: 'd'.repeat(64),
});
const victim = await prisma.payment.findUnique({ where: { razorpayOrderId: c3.j.orderId } });
ok('another store cannot mark our payment failed', sabotage.s === 400 && victim.status === 'CREATED', `victim status ${victim.status}`);

const peek = await call('GET', `/billing/orders/${c3.j.orderId}`, rival);
ok('another store cannot read our order', peek.s === 404);

// ---------------------------------------------------- 5. amount tampering
const c4 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 4 });
await stage({ id: `pay_SHORT_${RUN}`, orderId: c4.j.orderId, amount: 100, status: 'authorized' }); // ₹1 for a ₹2,600 order
const short = await call('POST', '/billing/verify', admin, {
  razorpay_order_id: c4.j.orderId, razorpay_payment_id: `pay_SHORT_${RUN}`, razorpay_signature: sign(c4.j.orderId, `pay_SHORT_${RUN}`),
});
ok('underpayment rejected', short.s === 400 && short.j.error.code === 'AMOUNT_MISMATCH', short.j.error?.message?.slice(0, 60));

// ---------------------------------------------------- 6. payment belonging to a different order
const c5 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 4 });
await stage({ id: `pay_OTHERORDER_${RUN}`, orderId: `order_SOMETHING_ELSE_${RUN}`, amount: c5.j.amount, status: 'captured' });
const mismatch = await call('POST', '/billing/verify', admin, {
  razorpay_order_id: c5.j.orderId, razorpay_payment_id: `pay_OTHERORDER_${RUN}`, razorpay_signature: sign(c5.j.orderId, `pay_OTHERORDER_${RUN}`),
});
ok('payment from another order rejected', mismatch.s === 400 && mismatch.j.error.code === 'ORDER_MISMATCH');

// ---------------------------------------------------- 7. failed payment
const c6 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 4 });
await stage({ id: `pay_FAILED_${RUN}`, orderId: c6.j.orderId, amount: c6.j.amount, status: 'failed' });
const failedVerify = await call('POST', '/billing/verify', admin, {
  razorpay_order_id: c6.j.orderId, razorpay_payment_id: `pay_FAILED_${RUN}`, razorpay_signature: sign(c6.j.orderId, `pay_FAILED_${RUN}`),
});
ok('failed payment does not activate a plan', failedVerify.s === 402 && failedVerify.j.error.code === 'NOT_CAPTURED');

// ---------------------------------------------------- 8. webhook: the browser-closed path
const rivalOrg = rivalOrgId;
const beforeRival = await prisma.subscription.findUnique({ where: { organizationId: rivalOrg } });
const c7 = await call('POST', '/billing/checkout', rival, { plan: 'CUSTOM', interval: 'YEARLY', seats: 2 });
const evt = {
  event: 'payment.captured',
  payload: { payment: { entity: { id: `pay_WEBHOOK_${RUN}`, order_id: c7.j.orderId, amount: c7.j.amount, currency: 'INR', status: 'captured', method: 'card' } } },
};
const w1 = await webhook(evt, WEBHOOK_SECRET, `evt_fixed_1_${RUN}`);
const rivalAfter = await prisma.subscription.findUnique({ where: { organizationId: rivalOrg } });
ok('webhook activates when the browser never came back', w1.s === 200 && rivalAfter.plan === 'CUSTOM' && rivalAfter.status === 'ACTIVE', `${beforeRival.plan} → ${rivalAfter.plan}`);

// ---------------------------------------------------- 9. webhook replay protection
const firstEnd = rivalAfter.currentPeriodEnd.toISOString();
const w2 = await webhook(evt, WEBHOOK_SECRET, `evt_fixed_1_${RUN}`); // same event id: a Razorpay retry
const afterReplay = await prisma.subscription.findUnique({ where: { organizationId: rivalOrg } });
ok('replayed webhook is acknowledged but not applied twice', w2.s === 200 && w2.j.duplicate === true && afterReplay.currentPeriodEnd.toISOString() === firstEnd);

const w3 = await webhook(evt, WEBHOOK_SECRET, `evt_fixed_2_${RUN}`); // different id, same payment
const afterSecond = await prisma.subscription.findUnique({ where: { organizationId: rivalOrg } });
ok('a new event for an already-paid order does not extend the period', w3.s === 200 && afterSecond.currentPeriodEnd.toISOString() === firstEnd);

// ---------------------------------------------------- 10. unsigned / wrongly signed webhooks
const bad = await webhook(evt, 'wrong_secret', `evt_bad_${RUN}`);
ok('wrongly signed webhook rejected', bad.s === 400 && bad.j.error.code === 'INVALID_SIGNATURE');
const unsigned = await fetch(`${API}/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evt) });
ok('unsigned webhook rejected', unsigned.status === 400);

// ---------------------------------------------------- 11. webhook amount guard
const c8 = await call('POST', '/billing/checkout', admin, { plan: 'STANDARD', interval: 'MONTHLY', seats: 4 });
const wrongAmount = {
  event: 'payment.captured',
  payload: { payment: { entity: { id: `pay_CHEAP_${RUN}`, order_id: c8.j.orderId, amount: 100, currency: 'INR', status: 'captured' } } },
};
await webhook(wrongAmount, WEBHOOK_SECRET, `evt_cheap_${RUN}`);
const cheapRow = await prisma.payment.findUnique({ where: { razorpayOrderId: c8.j.orderId } });
ok('webhook with the wrong amount does not activate', cheapRow.status === 'CREATED');

// ---------------------------------------------------- 12. refund recorded
const refundEvt = {
  event: 'refund.processed',
  payload: { refund: { entity: { id: 'rfnd_1', payment_id: `pay_WEBHOOK_${RUN}`, amount: 50000 } } },
};
await webhook(refundEvt, WEBHOOK_SECRET, `evt_refund_1_${RUN}`);
const refunded = await prisma.payment.findUnique({ where: { razorpayOrderId: c7.j.orderId } });
ok('refund recorded against the payment', Number(refunded.amountRefunded) === 500, `₹${refunded.amountRefunded}`);

// ---------------------------------------------------- 13. order status fallback
const statusCheck = await call('GET', `/billing/orders/${checkout.j.orderId}`, admin);
ok('admin can poll an order status', statusCheck.s === 200 && statusCheck.j.payment.status === 'PAID');

// ---------------------------------------------------- 14. cashier cannot pay
const cashier = await login(SEED_CASHIER_EMAIL, SEED_CASHIER_PASSWORD);
ok('cashier cannot start checkout', (await call('POST', '/billing/checkout', cashier, { plan: 'STANDARD', interval: 'MONTHLY', seats: 2 })).s === 403);
ok('cashier can still see the plan', (await call('GET', '/billing/subscription', cashier)).s === 200);

// ---------------------------------------------------- 15. seats grow after payment
const subNow = await call('GET', '/billing/subscription', admin);
ok('paid seats replace trial seats', subNow.j.subscription.seats === 4 && subNow.j.subscription.plan === 'STANDARD', `${subNow.j.subscription.seatsUsed}/${subNow.j.subscription.seats}, plan ${subNow.j.subscription.plan}`);
ok('payment mode is reported to the UI', subNow.j.paymentMode === 'test', subNow.j.paymentMode);

// ---------------------------------------------------- 16. webhook event log
const logged = await prisma.webhookEvent.count({ where: { eventId: { endsWith: `_${RUN}` } } });
ok('only signed, non-duplicate webhooks are logged', logged === 4, `${logged} of this run's events`);

console.log(`\n${passed} passed, ${failed} failed`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
