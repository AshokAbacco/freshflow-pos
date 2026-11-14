/**
 * /api/v1/platform/payments  and  /api/v1/platform/webhooks
 *
 * The money rail: what was charged, what Razorpay actually captured, and which of their
 * callbacks we failed to process.
 *
 * SUPPORT is refused outright at the top of this file. A support login can see that a store's
 * plan lapsed; it has no business reading the payment references, amounts and failure reasons
 * for every shop on the platform.
 *
 * Nothing here moves money. A refund is a Razorpay API call with real consequences and needs
 * the payment client, an idempotency key and a reconciliation path; until that exists this
 * reports and reconciles rather than offering a button that half-works.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import {
  PLATFORM_ROLES,
  authenticatePlatform,
  rejectStoreToken,
  requirePlatformRole,
} from "../../middleware/platform-auth.js";
import { validate } from "../../middleware/validate.js";
import { HttpError } from "../../utils/http.js";

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);
router.use(
  requirePlatformRole(PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.FINANCE),
);

const num = (v) => (v === null || v === undefined ? null : Number(v));

const shape = (p) => ({
  id: p.id,
  amount: num(p.amount),
  amountCaptured: num(p.amountCaptured),
  amountRefunded: num(p.amountRefunded),
  currency: p.currency,
  status: p.status,
  method: p.method,
  plan: p.plan,
  interval: p.interval,
  seats: p.seats,
  orderId: p.razorpayOrderId,
  paymentId: p.razorpayPaymentId,
  hasSignature: Boolean(p.razorpaySignature),
  failureReason: p.failureReason,
  paidAt: p.paidAt,
  createdAt: p.createdAt,
  store: p.organization
    ? {
        id: p.organization.id,
        name: p.organization.name,
        city: p.organization.city,
      }
    : null,
  /*
   * The discrepancy that matters: marked PAID but Razorpay captured a different amount, or
   * nothing at all. A plan activated on a payment that never fully captured is money lost
   * quietly, and it will not show up anywhere else.
   */
  mismatch:
    p.status === "PAID" &&
    (p.amountCaptured === null ||
      Number(p.amountCaptured) !== Number(p.amount)),
});

router.get(
  "/",
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(["CREATED", "PAID", "FAILED"]).optional(),
      plan: z.enum(["TRIAL", "STANDARD", "CUSTOM"]).optional(),
      organizationId: z.string().trim().max(80).optional(),
      mismatched: z.enum(["true", "false"]).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 50;

      const where = {};
      if (req.query.status) where.status = req.query.status;
      if (req.query.plan) where.plan = req.query.plan;
      if (req.query.organizationId)
        where.organizationId = req.query.organizationId;
      if (req.query.from || req.query.to) {
        where.createdAt = {};
        if (req.query.from) where.createdAt.gte = new Date(req.query.from);
        if (req.query.to) where.createdAt.lte = new Date(req.query.to);
      }
      if (req.query.q) {
        where.OR = [
          { razorpayOrderId: { contains: req.query.q, mode: "insensitive" } },
          { razorpayPaymentId: { contains: req.query.q, mode: "insensitive" } },
          {
            organization: {
              name: { contains: req.query.q, mode: "insensitive" },
            },
          },
        ];
      }

      const [rows, total, totals] = await Promise.all([
        prisma.payment.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            organization: { select: { id: true, name: true, city: true } },
          },
        }),
        prisma.payment.count({ where }),
        prisma.payment.aggregate({
          where: { ...where, status: "PAID" },
          _sum: { amount: true, amountRefunded: true },
          _count: true,
        }),
      ]);

      let payments = rows.map(shape);
      // Applied after shaping, because "captured does not equal charged" is computed, not stored.
      if (req.query.mismatched === "true")
        payments = payments.filter((p) => p.mismatch);

      return res.json({
        payments,
        total,
        page,
        pageSize,
        summary: {
          paidCount: totals._count,
          collected: num(totals._sum.amount) ?? 0,
          refunded: num(totals._sum.amountRefunded) ?? 0,
        },
      });
    } catch (err) {
      return next(err);
    }
  },
);

router.get("/:id", async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        organization: { select: { id: true, name: true, city: true } },
      },
    });
    if (!payment)
      throw new HttpError(404, "No payment with that id", "NOT_FOUND");

    // Every callback Razorpay sent about this order, so a disputed payment can be traced.
    const events = await prisma.webhookEvent.findMany({
      where: {
        OR: [
          { orderId: payment.razorpayOrderId },
          ...(payment.razorpayPaymentId
            ? [{ paymentId: payment.razorpayPaymentId }]
            : []),
        ],
      },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        eventId: true,
        event: true,
        handled: true,
        error: true,
        receivedAt: true,
      },
    });

    return res.json({ payment: shape(payment), events });
  } catch (err) {
    return next(err);
  }
});

export default router;

/* ------------------------------------------------------------------ webhooks */

export const webhookRouter = Router();
webhookRouter.use(rejectStoreToken, authenticatePlatform);
webhookRouter.use(
  requirePlatformRole(PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.FINANCE),
);

webhookRouter.get(
  "/",
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      handled: z.enum(["true", "false"]).optional(),
      event: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 50;

      const where = {};
      if (req.query.handled) where.handled = req.query.handled === "true";
      if (req.query.event) where.event = req.query.event;
      if (req.query.q) {
        where.OR = [
          { orderId: { contains: req.query.q, mode: "insensitive" } },
          { paymentId: { contains: req.query.q, mode: "insensitive" } },
          { eventId: { contains: req.query.q, mode: "insensitive" } },
        ];
      }

      const [rows, total, unhandled] = await Promise.all([
        prisma.webhookEvent.findMany({
          where,
          orderBy: { receivedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          // The raw payload can be large and is only wanted on one row at a time.
          select: {
            id: true,
            eventId: true,
            event: true,
            orderId: true,
            paymentId: true,
            handled: true,
            error: true,
            receivedAt: true,
          },
        }),
        prisma.webhookEvent.count({ where }),
        prisma.webhookEvent.count({ where: { handled: false } }),
      ]);

      return res.json({ events: rows, total, page, pageSize, unhandled });
    } catch (err) {
      return next(err);
    }
  },
);

/** One event with its stored payload, for working out why it failed. */
webhookRouter.get("/:id", async (req, res, next) => {
  try {
    const event = await prisma.webhookEvent.findUnique({
      where: { id: req.params.id },
    });
    if (!event)
      throw new HttpError(404, "No webhook event with that id", "NOT_FOUND");

    let payload = null;
    try {
      payload = JSON.parse(event.payload);
    } catch {
      // Stored as text; if it is not valid JSON that is itself worth seeing.
      payload = { raw: event.payload };
    }

    return res.json({ event: { ...event, payload } });
  } catch (err) {
    return next(err);
  }
});
