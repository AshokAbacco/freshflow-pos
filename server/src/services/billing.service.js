import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  MAX_SEATS,
  MIN_SEATS,
  monthsFor,
  PLANS,
  quote,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from "../config/plans.js";
import { prisma } from "../lib/prisma.js";
import { invalidateOrganizationCache } from "../middleware/auth.js";
import { HttpError } from "../utils/http.js";

const TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [400, 1200];

export const razorpayConfigured = () =>
  Boolean(env.razorpayKeyId && env.razorpayKeySecret);

const authHeader = () =>
  `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64")}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rupees as stored by us vs paise as used by Razorpay. */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const fromPaise = (paise) => Math.round(Number(paise)) / 100;

/**
 * One call to the Razorpay API.
 *
 * Retries only what is safe to retry: a network failure or a 5xx on a GET, plus order creation,
 * which is idempotent for our purposes because an unused order costs nothing. A capture is never
 * retried blindly here — the caller re-reads the payment and decides, so we cannot double-charge.
 */
async function razorpayFetch(
  path,
  { method = "GET", body, retry = method === "GET" } = {},
) {
  if (!razorpayConfigured()) {
    throw new HttpError(
      503,
      "Online payment is not configured on this server yet.",
      "RAZORPAY_NOT_CONFIGURED",
    );
  }

  let lastError = null;
  const attempts = retry ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    let response;
    try {
      response = await fetch(`${env.razorpayApiUrl}${path}`, {
        method,
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/json",
          "X-Razorpay-Account-Source": "freshflow-pos",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Timeout or connection failure: worth another go.
      lastError = err;
      continue;
    }

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (response.ok) return json;

    const description =
      json?.error?.description ||
      text?.slice(0, 200) ||
      `HTTP ${response.status}`;
    lastError = new HttpError(502, description, "RAZORPAY_ERROR");
    lastError.razorpayStatus = response.status;
    lastError.razorpayCode = json?.error?.code;

    // 4xx means Razorpay understood us and said no; repeating it will not help.
    if (response.status < 500) break;
  }

  console.error(
    `[billing] Razorpay ${method} ${path} failed:`,
    lastError?.message,
  );
  throw new HttpError(
    502,
    "Could not reach the payment provider. If money left your account, it will be refunded automatically within 5–7 working days.",
    "RAZORPAY_UNREACHABLE",
  );
}

/**
 * Razorpay signs the checkout handover as HMAC-SHA256("<order_id>|<payment_id>") with the key secret.
 * Comparison is timing-safe; a forged or replayed signature never activates a plan.
 */
export function verifyPaymentSignature(
  { orderId, paymentId, signature },
  secret = env.razorpayKeySecret,
) {
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const given = Buffer.from(String(signature), "utf8");
  const mine = Buffer.from(expected, "utf8");
  return given.length === mine.length && crypto.timingSafeEqual(given, mine);
}

/** Webhooks are signed as HMAC-SHA256 over the exact raw body with the webhook secret. */
export function verifyWebhookSignature(
  rawBody,
  signature,
  secret = env.razorpayWebhookSecret,
) {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const given = Buffer.from(String(signature), "utf8");
  const mine = Buffer.from(expected, "utf8");
  return given.length === mine.length && crypto.timingSafeEqual(given, mine);
}

export function trialSubscriptionData() {
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  return {
    plan: "TRIAL",
    interval: "MONTHLY",
    seats: TRIAL_SEATS,
    status: "TRIALING",
    pricePerUser: "0.00",
    trialEndsAt,
    currentPeriodEnd: trialEndsAt,
  };
}

/** True while the organization may keep using the app. */
export function subscriptionActive(subscription) {
  if (!subscription) return false;
  if (!["TRIALING", "ACTIVE", "PAST_DUE"].includes(subscription.status))
    return false;
  const until = subscription.currentPeriodEnd ?? subscription.trialEndsAt;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export function describeSubscription(subscription, seatsUsed) {
  const until =
    subscription?.currentPeriodEnd ?? subscription?.trialEndsAt ?? null;
  const daysLeft = until
    ? Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000)
    : 0;
  return {
    plan: subscription?.plan ?? "TRIAL",
    planName:
      subscription?.plan === "TRIAL"
        ? "Free trial"
        : (PLANS[subscription?.plan]?.name ?? "Free trial"),
    interval: subscription?.interval ?? "MONTHLY",
    status: subscription?.status ?? "EXPIRED",
    seats: subscription?.seats ?? 0,
    seatsUsed,
    seatsLeft: Math.max(0, (subscription?.seats ?? 0) - seatsUsed),
    pricePerUser: Number(subscription?.pricePerUser ?? 0),
    currency: subscription?.currency ?? "INR",
    renewsOn: until,
    daysLeft: Math.max(0, daysLeft),
    active: subscriptionActive(subscription),
    isTrial: (subscription?.plan ?? "TRIAL") === "TRIAL",
  };
}

/** Seats must cover everyone who can currently sign in. */
export async function assertSeatsAvailable(organizationId, extra = 1) {
  const [subscription, used] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId, isActive: true } }),
  ]);
  if (!subscription)
    throw new HttpError(
      402,
      "This store has no subscription",
      "SUBSCRIPTION_REQUIRED",
    );
  if (used + extra > subscription.seats) {
    throw new HttpError(
      402,
      `Your plan covers ${subscription.seats} staff account${subscription.seats === 1 ? "" : "s"} and ${used} are in use. Add seats in Billing to invite more.`,
      "SEAT_LIMIT",
    );
  }
  return subscription;
}

/**
 * Create a Razorpay order for a plan change. The subscription is not touched here;
 * it only moves once a payment for this order is verified and captured.
 */
export async function createOrder({ organizationId, plan, interval, seats }) {
  if (!razorpayConfigured()) {
    throw new HttpError(
      503,
      "Online payment is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server environment.",
      "RAZORPAY_NOT_CONFIGURED",
    );
  }

  const activeUsers = await prisma.user.count({
    where: { organizationId, isActive: true },
  });
  if (seats < activeUsers) {
    throw new HttpError(
      400,
      `You have ${activeUsers} active staff accounts. Choose at least that many seats, or deactivate people first.`,
    );
  }

  const priced = quote({ plan, interval, seats });

  const order = await razorpayFetch("/orders", {
    method: "POST",
    retry: true,
    body: {
      amount: toPaise(priced.total),
      currency: "INR",
      // Razorpay shows this on the dashboard and in settlement reports.
      receipt: `ff_${organizationId.slice(0, 8)}_${Date.now().toString(36)}`,
      notes: {
        organizationId,
        plan,
        interval,
        seats: String(priced.seats),
      },
    },
  });

  await prisma.payment.create({
    data: {
      organizationId,
      plan,
      interval,
      seats: priced.seats,
      amount: priced.total.toFixed(2),
      status: "CREATED",
      razorpayOrderId: order.id,
    },
  });

  return { order, quote: priced, keyId: env.razorpayKeyId };
}

/**
 * Confirm with Razorpay that this payment really exists, belongs to this order, and that the
 * money has actually been taken.
 *
 * The signature alone proves the browser's handover came from Razorpay. It does not prove the
 * payment was captured: with auto-capture switched off in the Razorpay dashboard a payment stays
 * `authorized`, the customer sees success, and the money is never settled (it is released after
 * a few days). So the payment is read back from the API and, if it is only authorized, captured
 * here for the exact order amount.
 */
async function confirmCaptured({ orderId, paymentId, expectedPaise }) {
  let payment = await razorpayFetch(
    `/payments/${encodeURIComponent(paymentId)}`,
  );

  if (payment?.order_id !== orderId) {
    throw new HttpError(
      400,
      "That payment belongs to a different order.",
      "ORDER_MISMATCH",
    );
  }
  if (payment.currency !== "INR") {
    throw new HttpError(
      400,
      `Payment currency ${payment.currency} is not supported.`,
      "CURRENCY_MISMATCH",
    );
  }
  if (Number(payment.amount) !== expectedPaise) {
    // Cannot happen through normal checkout; worth refusing loudly if it ever does.
    throw new HttpError(
      400,
      `Paid amount ₹${fromPaise(payment.amount)} does not match the order total ₹${fromPaise(expectedPaise)}.`,
      "AMOUNT_MISMATCH",
    );
  }

  if (payment.status === "authorized") {
    // Idempotent on Razorpay's side: capturing an already-captured payment returns the payment.
    payment = await razorpayFetch(
      `/payments/${encodeURIComponent(paymentId)}/capture`,
      {
        method: "POST",
        body: { amount: expectedPaise, currency: "INR" },
      },
    );
  }

  if (payment.status !== "captured") {
    throw new HttpError(
      402,
      payment.status === "failed"
        ? "That payment did not go through. Nothing was charged."
        : `This payment is ${payment.status}, so it has not been collected yet. Try again or contact support.`,
      "NOT_CAPTURED",
    );
  }

  return payment;
}

/**
 * Apply a captured payment to the subscription.
 *
 * Idempotent: a second call for the same order (a webhook retry racing the browser's own
 * confirmation, say) returns the subscription unchanged instead of extending the period twice.
 */
async function applyPayment({
  razorpayOrderId,
  razorpayPaymentId,
  signature,
  razorpayPayment,
  organizationId,
}) {
  return prisma.$transaction(async (db) => {
    const payment = await db.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment)
      throw new HttpError(
        404,
        "That payment is not recognised",
        "PAYMENT_NOT_FOUND",
      );
    if (organizationId && payment.organizationId !== organizationId) {
      throw new HttpError(
        403,
        "That payment belongs to another store",
        "NOT_YOURS",
      );
    }

    const subscriptionFor = (orgId) =>
      db.subscription.findUnique({ where: { organizationId: orgId } });

    if (payment.status === "PAID") {
      return {
        subscription: await subscriptionFor(payment.organizationId),
        alreadyApplied: true,
      };
    }

    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        razorpayPaymentId,
        razorpaySignature: signature ?? payment.razorpaySignature,
        method: razorpayPayment?.method ?? null,
        amountCaptured:
          razorpayPayment?.amount != null
            ? fromPaise(razorpayPayment.amount).toFixed(2)
            : payment.amount,
        paidAt: new Date(),
        failureReason: null,
      },
    });

    const months = monthsFor(payment.interval);
    const current = await subscriptionFor(payment.organizationId);
    // Stack onto whatever is left of a paid period, otherwise start from today.
    const base =
      current?.currentPeriodEnd &&
      new Date(current.currentPeriodEnd) > new Date() &&
      current.status === "ACTIVE"
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
        status: "ACTIVE",
        pricePerUser: pricePerUser.toFixed(2),
        currentPeriodEnd: periodEnd,
        razorpayOrderId,
        razorpayPaymentId,
        lastPaymentAt: new Date(),
      },
    });

    return {
      subscription,
      alreadyApplied: false,
      organizationId: payment.organizationId,
    };
  });
}

/** Wraps applyPayment so the signed-in sessions of that store see the new plan immediately. */
async function applyPaymentAndRefresh(args) {
  const result = await applyPayment(args);
  if (result.organizationId) invalidateOrganizationCache(result.organizationId);
  else if (result.subscription?.organizationId)
    invalidateOrganizationCache(result.subscription.organizationId);
  return result;
}

/**
 * The browser's "I have paid" call. Verifies the signature, confirms with Razorpay that the money
 * was captured, then activates the plan. Any failure here leaves the subscription untouched.
 */
export async function verifyAndActivate({
  organizationId,
  orderId,
  paymentId,
  signature,
}) {
  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    // Scoped to this organization so one store cannot touch another store's pending payment.
    await markPaymentFailed({
      razorpayOrderId: orderId,
      organizationId,
      reason: "Signature verification failed",
    });
    throw new HttpError(
      400,
      "We could not verify that payment. If money left your account it will be refunded automatically; nothing was charged to your plan.",
      "INVALID_SIGNATURE",
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId: orderId },
  });
  if (!payment)
    throw new HttpError(
      404,
      "That payment is not recognised",
      "PAYMENT_NOT_FOUND",
    );
  if (payment.organizationId !== organizationId) {
    throw new HttpError(
      403,
      "That payment belongs to another store",
      "NOT_YOURS",
    );
  }
  if (payment.status === "PAID") {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });
    return { subscription, alreadyApplied: true };
  }

  const razorpayPayment = await confirmCaptured({
    orderId,
    paymentId,
    expectedPaise: toPaise(payment.amount),
  });

  return applyPaymentAndRefresh({
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    signature,
    razorpayPayment,
    organizationId,
  });
}

/**
 * The webhook path, for when the customer closes the browser before returning.
 * The signature over the raw body is already verified by the route, and Razorpay is the one
 * telling us the payment is captured, so the entity is trusted here rather than re-fetched.
 */
export async function activateFromWebhook({
  razorpayOrderId,
  razorpayPaymentId,
  razorpayPayment,
}) {
  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId },
  });
  if (!payment) return { skipped: "unknown-order" };

  if (
    razorpayPayment?.amount != null &&
    Number(razorpayPayment.amount) !== toPaise(payment.amount)
  ) {
    console.error(
      `[billing] Webhook amount ${razorpayPayment.amount} does not match order ${razorpayOrderId} (${toPaise(payment.amount)}). Not activating.`,
    );
    return { skipped: "amount-mismatch" };
  }

  return applyPaymentAndRefresh({
    razorpayOrderId,
    razorpayPaymentId,
    signature: null,
    razorpayPayment,
    organizationId: null,
  });
}

/**
 * Record a failed attempt. Scoped by organization when the caller is a signed-in user, so an
 * admin of one store can never mark another store's pending payment as failed.
 */
export async function markPaymentFailed({
  razorpayOrderId,
  organizationId = null,
  reason,
}) {
  await prisma.payment.updateMany({
    where: {
      razorpayOrderId,
      status: "CREATED",
      ...(organizationId ? { organizationId } : {}),
    },
    data: { status: "FAILED", failureReason: reason?.slice(0, 200) ?? null },
  });
}

/**
 * A refund does not retroactively remove access: the store keeps the period it paid for and the
 * refund is recorded against the payment. Cancelling access is a deliberate admin decision.
 */
export async function recordRefund({ razorpayOrderId, amountRefundedPaise }) {
  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId },
  });
  if (!payment) return { skipped: "unknown-order" };
  await prisma.payment.update({
    where: { id: payment.id },
    data: { amountRefunded: fromPaise(amountRefundedPaise ?? 0).toFixed(2) },
  });
  console.warn(
    `[billing] Refund of ₹${fromPaise(amountRefundedPaise ?? 0)} recorded for order ${razorpayOrderId}.`,
  );
  return { recorded: true };
}

export const seatBounds = { min: MIN_SEATS, max: MAX_SEATS };
