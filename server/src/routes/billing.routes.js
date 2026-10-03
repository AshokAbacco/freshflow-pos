import { Router } from "express";
import express from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { MAX_SEATS, MIN_SEATS, quote } from "../config/plans.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize, ROLES } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  activateFromWebhook,
  createOrder,
  describeSubscription,
  markPaymentFailed,
  razorpayConfigured,
  recordRefund,
  verifyAndActivate,
  verifyWebhookSignature,
} from "../services/billing.service.js";
import { asyncHandler, HttpError } from "../utils/http.js";

const router = Router();

/**
 * Razorpay webhook.
 *
 * Mounted before the JSON body parser and given the raw body, because the signature covers the
 * exact bytes sent; re-serialising the parsed JSON would change them and break verification.
 *
 * This is the safety net for the case where a customer pays and then closes the browser before
 * the app's own confirmation call runs. Razorpay retries an unacknowledged webhook for up to
 * 24 hours, so every event is logged by its id and a repeat is acknowledged without being
 * applied twice.
 */
export const webhookRouter = Router();

webhookRouter.post(
  "/webhook",
  express.raw({ type: "application/json", limit: "256kb" }),
  asyncHandler(async (req, res) => {
    if (!env.razorpayWebhookSecret) {
      console.error(
        "[billing] Webhook received but RAZORPAY_WEBHOOK_SECRET is not set; ignoring.",
      );
      return res
        .status(503)
        .json({
          error: {
            code: "WEBHOOK_NOT_CONFIGURED",
            message: "Webhooks are not configured",
          },
        });
    }

    const signature = req.get("x-razorpay-signature");
    if (!verifyWebhookSignature(req.body, signature)) {
      return res
        .status(400)
        .json({
          error: {
            code: "INVALID_SIGNATURE",
            message: "Signature check failed",
          },
        });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res
        .status(400)
        .json({
          error: { code: "INVALID_JSON", message: "Body is not valid JSON" },
        });
    }

    const payment = event?.payload?.payment?.entity ?? null;
    const refund = event?.payload?.refund?.entity ?? null;
    const orderId =
      payment?.order_id ??
      refund?.payment_id ??
      event?.payload?.order?.entity?.id ??
      null;

    // Razorpay sends a stable id per event; retries of the same event reuse it.
    const eventId =
      req.get("x-razorpay-event-id") ||
      `${event?.event}:${payment?.id ?? refund?.id ?? ""}`;

    try {
      await prisma.webhookEvent.create({
        data: {
          eventId,
          event: String(event?.event ?? "unknown"),
          orderId,
          paymentId: payment?.id ?? null,
          payload: req.body.toString("utf8").slice(0, 20_000),
        },
      });
    } catch (err) {
      if (err?.code === "P2002") {
        // Already seen this exact event; acknowledge so Razorpay stops retrying.
        return res.json({ received: true, duplicate: true });
      }
      throw err;
    }

    let handled = false;
    let handlingError = null;
    /*
     * Why this event did nothing, when it did nothing. Razorpay sends every event for the whole
     * account to every webhook URL on it, so a deployment sharing a Razorpay account with another
     * application will see that application's payments here. Those are ignored, and saying so in
     * the log is the difference between "working as intended" and an afternoon of debugging.
     */
    let note = null;

    try {
      switch (event?.event) {
        case "payment.captured":
          if (payment?.order_id) {
            const result = await activateFromWebhook({
              razorpayOrderId: payment.order_id,
              razorpayPaymentId: payment.id,
              razorpayPayment: payment,
            });
            handled = true;
            if (result?.skipped === "unknown-order")
              note = "Ignored: this order belongs to another application";
            else if (result?.skipped) note = `Ignored: ${result.skipped}`;
            else if (result?.alreadyApplied) note = "Already applied";
            else note = "Plan activated";
          }
          break;

        case "order.paid":
          // Arrives alongside payment.captured; whichever lands first activates, the other is a no-op.
          if (payment?.id && event?.payload?.order?.entity?.id) {
            const result = await activateFromWebhook({
              razorpayOrderId: event.payload.order.entity.id,
              razorpayPaymentId: payment.id,
              razorpayPayment: payment,
            });
            handled = true;
            if (result?.skipped === "unknown-order")
              note = "Ignored: this order belongs to another application";
            else if (result?.alreadyApplied) note = "Already applied";
            else note = "Plan activated";
          }
          break;

        case "payment.failed":
          if (payment?.order_id) {
            await markPaymentFailed({
              razorpayOrderId: payment.order_id,
              reason: payment.error_description || payment.error_reason,
            });
            handled = true;
          }
          break;

        case "refund.created":
        case "refund.processed":
          if (refund?.payment_id) {
            const paid = await prisma.payment.findFirst({
              where: { razorpayPaymentId: refund.payment_id },
              select: { razorpayOrderId: true },
            });
            if (paid) {
              await recordRefund({
                razorpayOrderId: paid.razorpayOrderId,
                amountRefundedPaise: refund.amount,
              });
              handled = true;
            }
          }
          break;

        default:
          // Any other subscribed event is logged and acknowledged.
          handled = true;
          note = `No handler for ${event?.event}; logged only`;
          break;
      }
    } catch (err) {
      handlingError = err?.message?.slice(0, 500) ?? "Unknown error";
      console.error(
        `[billing] Webhook ${event?.event} (${eventId}) failed:`,
        err,
      );
    }

    await prisma.webhookEvent.update({
      where: { eventId },
      data: { handled, error: handlingError ?? note },
    });

    /*
     * Acknowledge with 200 whenever the signature was valid, even if our own handling failed.
     * The event is stored, so it can be replayed from the dashboard or by hand; returning 500
     * would make Razorpay retry for 24 hours against a bug that a retry will not fix.
     */
    return res.json({ received: true });
  }),
);

router.use(authenticate);

/** Everyone signed in can see what plan the store is on (the app shows a banner). */
router.get(
  "/subscription",
  asyncHandler(async (req, res) => {
    const seatsUsed = await prisma.user.count({
      where: { organizationId: req.user.organizationId, isActive: true },
    });
    res.json({
      subscription: describeSubscription(req.subscription, seatsUsed),
      paymentsEnabled: razorpayConfigured(),
      // Lets the billing screen warn when a demo is running against live keys, or vice versa.
      paymentMode: env.razorpayMode,
    });
  }),
);

router.use(authorize(ROLES.ADMIN));

const planSchema = z.object({
  plan: z.enum(["STANDARD", "CUSTOM"]),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  seats: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS),
});

router.post(
  "/checkout",
  validate({ body: planSchema }),
  asyncHandler(async (req, res) => {
    const { plan, interval, seats } = req.body;
    const result = await createOrder({
      organizationId: req.user.organizationId,
      plan,
      interval,
      seats,
    });
    res.json({
      orderId: result.order.id,
      amount: result.order.amount,
      currency: result.order.currency,
      keyId: result.keyId,
      quote: result.quote,
      customer: { name: req.user.name, storeName: req.organization?.name },
    });
  }),
);

/** Called by the browser right after Razorpay checkout reports success. */
router.post(
  "/verify",
  validate({
    body: z.object({
      razorpay_order_id: z.string().trim().min(4).max(64),
      razorpay_payment_id: z.string().trim().min(4).max(64),
      razorpay_signature: z.string().trim().min(8).max(256),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { subscription, alreadyApplied } = await verifyAndActivate({
      organizationId: req.user.organizationId,
      orderId: req.body.razorpay_order_id,
      paymentId: req.body.razorpay_payment_id,
      signature: req.body.razorpay_signature,
    });
    const seatsUsed = await prisma.user.count({
      where: { organizationId: req.user.organizationId, isActive: true },
    });
    res.json({
      subscription: describeSubscription(subscription, seatsUsed),
      alreadyApplied,
    });
  }),
);

/**
 * The browser reporting that Razorpay declined the payment.
 *
 * Razorpay tells the checkout window about a failure immediately, but only tells the server
 * through the webhook. Without this the attempt would sit at "awaiting payment" until the webhook
 * arrived — and forever if webhooks are not configured, which is exactly what people hit while
 * developing on localhost, where Razorpay cannot reach them at all.
 *
 * It can only move a pending attempt to failed. A captured payment is never touched by this,
 * so it cannot be used to undo a real payment.
 */
router.post(
  "/payments/:orderId/failed",
  validate({
    params: z.object({ orderId: z.string().trim().min(4).max(64) }),
    body: z.object({ reason: z.string().trim().max(200).optional() }),
  }),
  asyncHandler(async (req, res) => {
    await markPaymentFailed({
      razorpayOrderId: req.params.orderId,
      organizationId: req.user.organizationId,
      reason: req.body.reason || "Declined at checkout",
    });
    res.json({ recorded: true });
  }),
);

/**
 * Fallback for a payment whose confirmation never reached us (browser closed, phone died).
 * Reports whether the webhook has since activated the plan, so the admin is not left guessing.
 */
router.get(
  "/orders/:orderId",
  validate({ params: z.object({ orderId: z.string().trim().min(4).max(64) }) }),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: req.params.orderId },
    });
    if (!payment || payment.organizationId !== req.user.organizationId) {
      throw new HttpError(
        404,
        "That payment is not recognised",
        "PAYMENT_NOT_FOUND",
      );
    }
    res.json({
      payment: {
        status: payment.status,
        amount: Number(payment.amount),
        plan: payment.plan,
        interval: payment.interval,
        seats: payment.seats,
        paidAt: payment.paidAt,
        failureReason: payment.failureReason,
      },
    });
  }),
);

router.get("/quote", validate({ query: planSchema }), (req, res) => {
  res.json({ quote: quote(req.query) });
});

/*
 * An order Razorpay never charged against stays CREATED forever, because nothing happened to it:
 * the customer closed the window, or never got as far as paying. Calling that "started" for days
 * is misleading, so anything left pending for longer than this is reported as abandoned.
 * This is presentation only — the stored status is untouched, and a late webhook can still
 * settle the attempt either way.
 */
const ABANDONED_AFTER_MS = 30 * 60 * 1000;

const outcomeOf = (p) => {
  if (p.status === "PAID") return "PAID";
  if (p.status === "FAILED") return "FAILED";
  return Date.now() - new Date(p.createdAt).getTime() > ABANDONED_AFTER_MS
    ? "ABANDONED"
    : "PENDING";
};

router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 24,
    });
    res.json({
      payments: payments.map((p) => ({
        id: p.id,
        plan: p.plan,
        interval: p.interval,
        seats: p.seats,
        amount: Number(p.amount),
        amountRefunded: Number(p.amountRefunded ?? 0),
        currency: p.currency,
        status: p.status,
        /// PAID | FAILED | PENDING | ABANDONED — what the billing screen labels the row
        outcome: outcomeOf(p),
        failureReason: p.failureReason,
        method: p.method,
        reference: p.razorpayPaymentId ?? p.razorpayOrderId,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
    });
  }),
);

export default router;
