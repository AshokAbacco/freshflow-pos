import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { MAX_SEATS, MIN_SEATS, monthsFor, PLANS, quote, TRIAL_DAYS, TRIAL_SEATS } from '../config/plans.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../utils/http.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export const razorpayConfigured = () => Boolean(env.razorpayKeyId && env.razorpayKeySecret);

function authHeader() {
  return `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64')}`;
}

/**
 * Razorpay signs the payment handover as HMAC-SHA256("<order_id>|<payment_id>") with the key secret.
 * Comparison is timing-safe; a forged or replayed signature never activates a plan.
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }, secret = env.razorpayKeySecret) {
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const given = Buffer.from(String(signature), 'utf8');
  const mine = Buffer.from(expected, 'utf8');
  return given.length === mine.length && crypto.timingSafeEqual(given, mine);
}

/** Webhooks are signed as HMAC-SHA256 over the exact raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody, signature, secret = env.razorpayWebhookSecret) {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = Buffer.from(String(signature), 'utf8');
  const mine = Buffer.from(expected, 'utf8');
  return given.length === mine.length && crypto.timingSafeEqual(given, mine);
}

export function trialSubscriptionData() {
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  return {
    plan: 'TRIAL',
    interval: 'MONTHLY',
    seats: TRIAL_SEATS,
    status: 'TRIALING',
    pricePerUser: '0.00',
    trialEndsAt,
    currentPeriodEnd: trialEndsAt,
  };
}

/** True while the organization may keep using the app. */
export function subscriptionActive(subscription) {
  if (!subscription) return false;
  if (!['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(subscription.status)) return false;
  const until = subscription.currentPeriodEnd ?? subscription.trialEndsAt;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export function describeSubscription(subscription, seatsUsed) {
  const until = subscription?.currentPeriodEnd ?? subscription?.trialEndsAt ?? null;
  const daysLeft = until ? Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000) : 0;
  return {
    plan: subscription?.plan ?? 'TRIAL',
    planName: subscription?.plan === 'TRIAL' ? 'Free trial' : PLANS[subscription?.plan]?.name ?? 'Free trial',
    interval: subscription?.interval ?? 'MONTHLY',
    status: subscription?.status ?? 'EXPIRED',
    seats: subscription?.seats ?? 0,
    seatsUsed,
    seatsLeft: Math.max(0, (subscription?.seats ?? 0) - seatsUsed),
    pricePerUser: Number(subscription?.pricePerUser ?? 0),
    currency: subscription?.currency ?? 'INR',
    renewsOn: until,
    daysLeft: Math.max(0, daysLeft),
    active: subscriptionActive(subscription),
    isTrial: (subscription?.plan ?? 'TRIAL') === 'TRIAL',
  };
}

/** Seats must cover everyone who can currently sign in. */
export async function assertSeatsAvailable(organizationId, extra = 1) {
  const [subscription, used] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId, isActive: true } }),
  ]);
  if (!subscription) throw new HttpError(402, 'This store has no subscription', 'SUBSCRIPTION_REQUIRED');
  if (used + extra > subscription.seats) {
    throw new HttpError(
      402,
      `Your plan covers ${subscription.seats} staff account${subscription.seats === 1 ? '' : 's'} and ${used} are in use. Add seats in Billing to invite more.`,
      'SEAT_LIMIT',
    );
  }
  return subscription;
}

/**
 * Create a Razorpay order for a plan change. Returns the order plus the key id the
 * browser checkout needs. The subscription is only updated once payment is verified.
 */
export async function createOrder({ organizationId, plan, interval, seats }) {
  if (!razorpayConfigured()) {
    throw new HttpError(
      503,
      'Online payment is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server environment.',
      'RAZORPAY_NOT_CONFIGURED',
    );
  }
  const activeUsers = await prisma.user.count({ where: { organizationId, isActive: true } });
  if (seats < activeUsers) {
    throw new HttpError(400, `You have ${activeUsers} active staff accounts. Choose at least that many seats, or deactivate people first.`);
  }
  const priced = quote({ plan, interval, seats });
  const receipt = `sub_${Date.now().toString(36)}`;

  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(priced.total * 100), // paise
      currency: 'INR',
      receipt,
      notes: { organizationId, plan, interval, seats: String(priced.seats) },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('Razorpay order failed:', response.status, detail);
    throw new HttpError(502, 'Could not reach the payment provider. Try again in a moment.', 'RAZORPAY_ERROR');
  }
  const order = await response.json();

  await prisma.payment.create({
    data: {
      organizationId,
      plan,
      interval,
      seats: priced.seats,
      amount: priced.total.toFixed(2),
      status: 'CREATED',
      razorpayOrderId: order.id,
    },
  });

  return { order, quote: priced, keyId: env.razorpayKeyId };
}

/** Mark a payment paid and move the subscription onto the paid plan. */
export async function activatePaidPlan({ organizationId, razorpayOrderId, razorpayPaymentId }) {
  return prisma.$transaction(async (db) => {
    const payment = await db.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) throw new HttpError(404, 'That payment is not recognised');
    if (organizationId && payment.organizationId !== organizationId) {
      throw new HttpError(403, 'That payment belongs to another store');
    }
    if (payment.status === 'PAID') {
      const existing = await db.subscription.findUnique({ where: { organizationId: payment.organizationId } });
      return { subscription: existing, alreadyApplied: true };
    }

    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', razorpayPaymentId },
    });

    const months = monthsFor(payment.interval);
    const current = await db.subscription.findUnique({ where: { organizationId: payment.organizationId } });
    // Extend from the current expiry when it is still in the future, otherwise from today.
    const base = current?.currentPeriodEnd && new Date(current.currentPeriodEnd) > new Date() && current.status === 'ACTIVE'
      ? new Date(current.currentPeriodEnd)
      : new Date();
    const periodEnd = new Date(base);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    const pricePerUser = PLANS[payment.plan].intervals[payment.interval].price;
    const subscription = await db.subscription.update({
      where: { organizationId: payment.organizationId },
      data: {
        plan: payment.plan,
        interval: payment.interval,
        seats: payment.seats,
        status: 'ACTIVE',
        pricePerUser: pricePerUser.toFixed(2),
        currentPeriodEnd: periodEnd,
        razorpayOrderId,
        razorpayPaymentId,
        lastPaymentAt: new Date(),
      },
    });
    return { subscription, alreadyApplied: false };
  });
}

export async function markPaymentFailed(razorpayOrderId, reason) {
  await prisma.payment.updateMany({
    where: { razorpayOrderId, status: 'CREATED' },
    data: { status: 'FAILED', failureReason: reason?.slice(0, 200) ?? null },
  });
}

export const seatBounds = { min: MIN_SEATS, max: MAX_SEATS };
