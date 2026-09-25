import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { MAX_SEATS, MIN_SEATS, quote } from '../config/plans.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize, ROLES } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  activatePaidPlan,
  createOrder,
  describeSubscription,
  markPaymentFailed,
  razorpayConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../services/billing.service.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();

/**
 * Razorpay webhook. Mounted before the JSON body parser and given the raw body, because the
 * signature covers the exact bytes sent. Unsigned or wrongly signed calls are rejected.
 */
export const webhookRouter = Router();
webhookRouter.post(
  '/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  asyncHandler(async (req, res) => {
    const signature = req.get('x-razorpay-signature');
    if (!verifyWebhookSignature(req.body, signature)) {
      return res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Signature check failed' } });
    }
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Body is not valid JSON' } });
    }

    const payment = event?.payload?.payment?.entity;
    if (event?.event === 'payment.captured' && payment?.order_id) {
      await activatePaidPlan({ organizationId: null, razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id });
    } else if (event?.event === 'payment.failed' && payment?.order_id) {
      await markPaymentFailed(payment.order_id, payment.error_description);
    }
    // Always 200 once the signature is good, so Razorpay stops retrying.
    return res.json({ received: true });
  }),
);

router.use(authenticate);

/** Everyone signed in can see what plan the store is on (the app shows a banner). */
router.get(
  '/subscription',
  asyncHandler(async (req, res) => {
    const seatsUsed = await prisma.user.count({ where: { organizationId: req.user.organizationId, isActive: true } });
    res.json({
      subscription: describeSubscription(req.subscription, seatsUsed),
      paymentsEnabled: razorpayConfigured(),
    });
  }),
);

router.use(authorize(ROLES.ADMIN));

const planSchema = z.object({
  plan: z.enum(['STANDARD', 'CUSTOM']),
  interval: z.enum(['MONTHLY', 'YEARLY']),
  seats: z.coerce.number().int().min(MIN_SEATS).max(MAX_SEATS),
});

router.post(
  '/checkout',
  validate({ body: planSchema }),
  asyncHandler(async (req, res) => {
    const { plan, interval, seats } = req.body;
    const result = await createOrder({ organizationId: req.user.organizationId, plan, interval, seats });
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

/** Called by the browser right after Razorpay checkout succeeds. */
router.post(
  '/verify',
  validate({
    body: z.object({
      razorpay_order_id: z.string().min(4),
      razorpay_payment_id: z.string().min(4),
      razorpay_signature: z.string().min(8),
    }),
  }),
  asyncHandler(async (req, res) => {
    const orderId = req.body.razorpay_order_id;
    const paymentId = req.body.razorpay_payment_id;
    if (!verifyPaymentSignature({ orderId, paymentId, signature: req.body.razorpay_signature })) {
      await markPaymentFailed(orderId, 'Signature verification failed');
      throw new HttpError(400, 'We could not verify that payment. Nothing was charged to your plan.', 'INVALID_SIGNATURE');
    }
    const { subscription } = await activatePaidPlan({
      organizationId: req.user.organizationId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
    });
    const seatsUsed = await prisma.user.count({ where: { organizationId: req.user.organizationId, isActive: true } });
    res.json({ subscription: describeSubscription(subscription, seatsUsed) });
  }),
);

router.get(
  '/quote',
  validate({ query: planSchema }),
  (req, res) => {
    res.json({ quote: quote(req.query) });
  },
);

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    res.json({
      payments: payments.map((p) => ({
        id: p.id,
        plan: p.plan,
        interval: p.interval,
        seats: p.seats,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        reference: p.razorpayPaymentId ?? p.razorpayOrderId,
        createdAt: p.createdAt,
      })),
    });
  }),
);

export default router;
