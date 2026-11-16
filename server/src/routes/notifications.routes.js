/**
 * /api/v1/notifications — the store's side of the conversation.
 *
 * This is where a message sent from the platform panel actually reaches the shop. Without it
 * the admin's Send button wrote rows nobody could ever read.
 *
 * Mounted behind `authenticate`, so everything is scoped to req.user.organizationId. A store
 * can only ever see rows addressed to it; there is no id in any path that could be pointed at
 * another shop's message.
 *
 * Deliberately NOT exposed here: follow-ups. Those are the platform's own worklist about a
 * store ("chase this renewal", "they sounded unhappy") and often carry internal notes. They
 * are about the shop, not for it.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { validate } from "../middleware/validate.js";
import {
  STATES,
  evaluateEntitlement,
} from "../services/entitlement.service.js";
import { getGraceDays } from "../services/platform-settings.service.js";
import { asyncHandler, HttpError } from "../utils/http.js";

const router = Router();

/**
 * Alerts about this store's own situation: the trial running out, the plan lapsing, a payment
 * that failed.
 *
 * Computed on request from the subscription rather than stored as rows. A stored alert is
 * wrong the moment the thing it describes changes -- pay the bill and the "your plan expired"
 * notice sits there until something remembers to delete it. Derived alerts cannot go stale,
 * and there is nothing to clean up.
 */
async function buildAlerts(req) {
  const organizationId = req.user.organizationId;
  const [organization, subscription] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, lastActiveAt: true },
    }),
    prisma.subscription.findUnique({ where: { organizationId } }),
  ]);

  const graceDays = await getGraceDays();
  const e = evaluateEntitlement(organization, subscription, new Date(), {
    graceDays,
  });
  const alerts = [];

  const add = (a) => alerts.push({ ...a, id: `alert:${a.key}` });

  if (e.state === STATES.TRIAL && e.daysLeft !== null && e.daysLeft <= 7) {
    add({
      key: "trial-ending",
      tone: e.daysLeft <= 2 ? "urgent" : "warn",
      title:
        e.daysLeft === 0
          ? "Your trial ends today"
          : `Your trial ends in ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"}`,
      body: "Choose a plan to keep selling without a break. Your data and settings stay exactly as they are.",
      action: { label: "Choose a plan", to: "/app/billing" },
    });
  }

  if (e.state === STATES.ACTIVE && e.daysLeft !== null && e.daysLeft <= 7) {
    add({
      key: "renewal-due",
      tone: e.daysLeft <= 2 ? "warn" : "info",
      title: `Your plan renews in ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"}`,
      body: "Nothing to do if your payment details are up to date.",
      action: { label: "View billing", to: "/app/billing" },
    });
  }

  if (e.state === STATES.PAST_DUE) {
    add({
      key: "past-due",
      tone: "warn",
      title: "Your last payment did not go through",
      body: "The till is still working, but the plan will stop unless the payment succeeds.",
      action: { label: "Pay now", to: "/app/billing" },
    });
  }

  if (e.state === STATES.GRACE_PERIOD) {
    add({
      key: "grace",
      tone: "urgent",
      title:
        e.daysLeft && e.daysLeft > 0
          ? `Your plan has ended — ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"} left to renew`
          : "Your plan has ended — renew today",
      body: "You can still take bills for now. After that the till stops until the plan is renewed.",
      action: { label: "Renew now", to: "/app/billing" },
    });
  }

  if (e.state === STATES.EXPIRED || e.state === STATES.CANCELLED) {
    add({
      key: "expired",
      tone: "urgent",
      title:
        e.state === STATES.CANCELLED
          ? "Your subscription was cancelled"
          : "Your plan has ended",
      body: "New bills are paused. Your past bills, reports and data are all still here and can be exported.",
      action: { label: "Choose a plan", to: "/app/billing" },
    });
  }

  if (e.state === STATES.SUSPENDED) {
    add({
      key: "suspended",
      tone: "urgent",
      title: "This store has been suspended",
      body: e.reason ?? "Contact FreshFlow support to resolve it.",
    });
  }

  // A payment that failed in the last week is worth saying out loud, whatever the plan state.
  const failed = await prisma.payment.findFirst({
    where: {
      organizationId,
      status: "FAILED",
      createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, failureReason: true, createdAt: true },
  });
  if (failed) {
    add({
      key: `payment-failed:${failed.id}`,
      tone: "warn",
      title: "A payment failed",
      body: failed.failureReason
        ? `${failed.failureReason}. Try again, or use a different method.`
        : "Try again, or use a different method.",
      action: { label: "Go to billing", to: "/app/billing" },
      at: failed.createdAt,
    });
  }

  return alerts;
}

const shape = (r) => ({
  id: r.id,
  // The recipient row's id is what the store marks read; the message is shared across stores.
  messageId: r.messageId,
  subject: r.message?.subject ?? "",
  body: r.message?.body ?? "",
  sentAt: r.message?.sentAt ?? r.createdAt,
  readAt: r.readAt,
});

/**
 * Everything addressed to this store, newest first.
 *
 * Unsent drafts are excluded: a message is only a message once it has been sent, and a draft
 * being visible to the shop while the admin is still wording it would be its own small
 * disaster.
 */
router.get(
  "/",
  validate({
    query: z.object({
      unreadOnly: z.enum(["true", "false"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const where = {
      organizationId: req.user.organizationId,
      message: { is: { status: "SENT" } },
      ...(req.query.unreadOnly === "true" ? { readAt: null } : {}),
    };

    const [rows, unread, alerts] = await Promise.all([
      prisma.platformMessageRecipient.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: req.query.limit ?? 50,
        include: {
          message: {
            select: {
              id: true,
              subject: true,
              body: true,
              sentAt: true,
              status: true,
            },
          },
        },
      }),
      prisma.platformMessageRecipient.count({
        where: {
          organizationId: req.user.organizationId,
          readAt: null,
          message: { is: { status: "SENT" } },
        },
      }),
      buildAlerts(req),
    ]);

    res.json({ notifications: rows.map(shape), unread, alerts });
  }),
);

/**
 * Just the badge number.
 *
 * Its own endpoint because the bell polls it every minute and the full list is far more than
 * a count needs.
 */
router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const [unread, alerts] = await Promise.all([
      prisma.platformMessageRecipient.count({
        where: {
          organizationId: req.user.organizationId,
          readAt: null,
          message: { is: { status: "SENT" } },
        },
      }),
      buildAlerts(req),
    ]);

    /*
     * The badge counts anything wanting attention, not only unread messages. An expiring plan
     * with no unread message would otherwise show a bell with no number on it.
     */
    const urgent = alerts.filter((a) => a.tone !== "info").length;
    res.json({ unread, alerts: alerts.length, urgent, total: unread + urgent });
  }),
);

/** Loads one of this store's notifications, or 404s. Never reveals another store's rows. */
async function loadOwn(req) {
  const row = await prisma.platformMessageRecipient.findUnique({
    where: { id: req.params.id },
    include: {
      message: {
        select: {
          id: true,
          subject: true,
          body: true,
          sentAt: true,
          status: true,
        },
      },
    },
  });
  if (!row || row.organizationId !== req.user.organizationId) {
    throw new HttpError(404, "No such message", "NOT_FOUND");
  }
  return row;
}

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const row = await loadOwn(req);
    // Keep the original timestamp: re-opening a message is not a new read.
    if (row.readAt) return res.json({ notification: shape(row) });

    const updated = await prisma.platformMessageRecipient.update({
      where: { id: row.id },
      data: { readAt: new Date() },
      include: {
        message: {
          select: {
            id: true,
            subject: true,
            body: true,
            sentAt: true,
            status: true,
          },
        },
      },
    });
    return res.json({ notification: shape(updated) });
  }),
);

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.platformMessageRecipient.updateMany({
      where: { organizationId: req.user.organizationId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, marked: count });
  }),
);

/**
 * Write back. The reply lands in the platform Inbox.
 *
 * authorLabel is composed here from the signed-in user rather than accepted from the body, so
 * a reply cannot be posted under somebody else's name.
 */
router.post(
  "/:id/reply",
  validate({ body: z.object({ body: z.string().trim().min(2).max(4000) }) }),
  asyncHandler(async (req, res) => {
    const row = await loadOwn(req);

    const reply = await prisma.storeMessageReply.create({
      data: {
        messageId: row.messageId,
        organizationId: req.user.organizationId,
        userId: req.user.id,
        authorLabel: req.user.name,
        body: req.body.body,
      },
    });

    // Replying is reading.
    if (!row.readAt) {
      await prisma.platformMessageRecipient.update({
        where: { id: row.id },
        data: { readAt: new Date() },
      });
    }

    res.status(201).json({
      reply: { id: reply.id, body: reply.body, createdAt: reply.createdAt },
    });
  }),
);

/** Start a thread without a message to reply to — "contact support" from inside the app. */
router.post(
  "/contact",
  validate({ body: z.object({ body: z.string().trim().min(2).max(4000) }) }),
  asyncHandler(async (req, res) => {
    const reply = await prisma.storeMessageReply.create({
      data: {
        messageId: null,
        organizationId: req.user.organizationId,
        userId: req.user.id,
        authorLabel: req.user.name,
        body: req.body.body,
      },
    });
    res
      .status(201)
      .json({
        reply: { id: reply.id, body: reply.body, createdAt: reply.createdAt },
      });
  }),
);

/** This store's own replies, so the shop can see what it has already asked. */
router.get(
  "/replies",
  asyncHandler(async (req, res) => {
    const replies = await prisma.storeMessageReply.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        body: true,
        authorLabel: true,
        handledAt: true,
        createdAt: true,
      },
    });
    res.json({ replies });
  }),
);

export default router;
