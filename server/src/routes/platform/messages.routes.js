/**
 * /api/v1/platform/messages  and  /api/v1/platform/inbox
 *
 * Messages to stores, read inside their own app, and what they write back.
 *
 * In-app on purpose. SMS and WhatsApp need a provider account, a sender id and per-message
 * costs; none of that is set up, and a Send button that silently does nothing is worse than
 * no Send button. The channel column is there so a provider can be added later without
 * changing what is already stored.
 *
 * Two things worth knowing about how sending works:
 *
 *   1. The audience is resolved to actual recipient rows at send time, and the filter is kept
 *      alongside them. Re-deriving "who got this" from a live filter months later gives a
 *      different answer, because stores change state.
 *
 *   2. A message is composed as a draft and sent as a separate step. Writing to every store
 *      on the platform is not something that should happen on a mistyped keystroke.
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
import { AUDIT, writeAudit } from "../../services/audit.service.js";
import { entitlementStateSql } from "../../services/entitlement.service.js";
import { HttpError } from "../../utils/http.js";

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

const SUPER = PLATFORM_ROLES.SUPER_ADMIN;

const audienceSchema = z.object({
  // 'ALL', or a filter, or an explicit list of store ids.
  state: z.array(z.string().trim().max(20)).max(10).optional(),
  plan: z.array(z.string().trim().max(20)).max(10).optional(),
  businessType: z.array(z.string().trim().max(30)).max(10).optional(),
  city: z.string().trim().max(80).optional(),
  inactiveDays: z.coerce.number().int().min(1).max(3650).optional(),
  storeIds: z.array(z.string().trim().max(80)).max(500).optional(),
});

/**
 * Turns an audience filter into the store ids it covers.
 *
 * Shares the entitlement SQL with the stores list so "every expired store" means the same
 * thing here as it does there -- two different definitions of expired would be worse than
 * not offering the filter.
 */
async function resolveAudience(audience = {}) {
  if (audience.storeIds?.length) {
    const rows = await prisma.organization.findMany({
      where: { id: { in: audience.storeIds } },
      select: { id: true, name: true },
    });
    return rows;
  }

  const wheres = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    wheres.push(sql.replace("$?", `$${params.length}`));
  };

  if (audience.state?.length) {
    add(`${entitlementStateSql({ sub: "s" })} = ANY($?)`, audience.state);
  }
  if (audience.plan?.length) add(`s.plan::text = ANY($?)`, audience.plan);
  if (audience.businessType?.length)
    add(`o.business_type::text = ANY($?)`, audience.businessType);
  if (audience.city) add(`LOWER(o.city) = LOWER($?)`, audience.city);
  if (audience.inactiveDays) {
    // A store that has never been seen counts as quiet, same as the stores list.
    add(
      `(o.last_active_at IS NULL OR o.last_active_at < NOW() - ($? || ' days')::interval)`,
      String(audience.inactiveDays),
    );
  }

  const sql = `SELECT o.id, o.name
               FROM organizations o
               LEFT JOIN subscriptions s ON s.organization_id = o.id
               ${wheres.length ? `WHERE ${wheres.join(" AND ")}` : ""}
               ORDER BY o.name ASC`;

  return prisma.$queryRawUnsafe(sql, ...params);
}

const shape = (m, counts = {}) => ({
  id: m.id,
  subject: m.subject,
  body: m.body,
  audience: m.audience,
  channel: m.channel,
  status: m.status,
  createdByLabel: m.createdByLabel,
  sentAt: m.sentAt,
  createdAt: m.createdAt,
  recipients: counts[m.id]?.total ?? m._count?.recipients ?? 0,
  readCount: counts[m.id]?.read ?? 0,
});

router.get("/", async (_req, res, next) => {
  try {
    const messages = await prisma.platformMessage.findMany({
      // Direct answers to one shop live in the Inbox thread, not in the campaign list.
      where: { kind: "BROADCAST" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { recipients: true } } },
    });

    // How many of each message's recipients have opened it.
    const read = await prisma.platformMessageRecipient.groupBy({
      by: ["messageId"],
      where: { readAt: { not: null } },
      _count: { messageId: true },
    });
    const counts = Object.fromEntries(
      read.map((r) => [r.messageId, { read: r._count.messageId }]),
    );
    for (const m of messages) {
      counts[m.id] = { ...(counts[m.id] ?? {}), total: m._count.recipients };
    }

    return res.json({ messages: messages.map((m) => shape(m, counts)) });
  } catch (err) {
    return next(err);
  }
});

/** How many stores a filter would reach, before anything is sent. */
router.post(
  "/preview",
  validate({ body: z.object({ audience: audienceSchema }) }),
  async (req, res, next) => {
    try {
      const stores = await resolveAudience(req.body.audience);
      return res.json({
        count: stores.length,
        sample: stores.slice(0, 10).map((s) => ({ id: s.id, name: s.name })),
      });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  "/",
  validate({
    body: z.object({
      subject: z.string().trim().min(3).max(140),
      body: z.string().trim().min(3).max(5000),
      audience: audienceSchema.optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const message = await prisma.platformMessage.create({
        data: {
          subject: req.body.subject,
          body: req.body.body,
          audience: req.body.audience ?? {},
          createdById: req.platformAdmin.id,
          createdByLabel: `${req.platformAdmin.name} <${req.platformAdmin.email}>`,
          status: "DRAFT",
        },
        include: { _count: { select: { recipients: true } } },
      });
      return res.status(201).json({ message: shape(message) });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * Send a draft. SUPER_ADMIN only: this writes to every shop the filter covers, and there is no
 * unsend.
 */
router.post("/:id/send", requirePlatformRole(SUPER), async (req, res, next) => {
  try {
    const message = await prisma.platformMessage.findUnique({
      where: { id: req.params.id },
    });
    if (!message)
      throw new HttpError(404, "No message with that id", "NOT_FOUND");
    if (message.status === "SENT") {
      throw new HttpError(
        409,
        "That message has already been sent",
        "ALREADY_SENT",
      );
    }

    const stores = await resolveAudience(message.audience ?? {});
    if (!stores.length) {
      throw new HttpError(
        409,
        "That audience matches no stores right now",
        "EMPTY_AUDIENCE",
      );
    }

    const sentAt = new Date();
    await prisma.$transaction([
      prisma.platformMessageRecipient.createMany({
        data: stores.map((s) => ({
          messageId: message.id,
          organizationId: s.id,
        })),
        // The unique index already prevents a double send; this makes a retry harmless.
        skipDuplicates: true,
      }),
      prisma.platformMessage.update({
        where: { id: message.id },
        data: { status: "SENT", sentAt },
      }),
    ]);

    await writeAudit({
      req,
      action: AUDIT.MESSAGE_SENT,
      targetType: "platform_message",
      targetId: message.id,
      reason: message.subject,
      changes: { recipients: stores.length, audience: message.audience },
    });

    return res.json({ ok: true, sentTo: stores.length, sentAt });
  } catch (err) {
    return next(err);
  }
});

router.delete("/:id", requirePlatformRole(SUPER), async (req, res, next) => {
  try {
    const message = await prisma.platformMessage.findUnique({
      where: { id: req.params.id },
    });
    if (!message)
      throw new HttpError(404, "No message with that id", "NOT_FOUND");
    // A sent message has been read by shopkeepers; deleting it would rewrite what they saw.
    if (message.status === "SENT") {
      throw new HttpError(
        409,
        "A sent message cannot be deleted",
        "ALREADY_SENT",
      );
    }
    await prisma.platformMessage.delete({ where: { id: message.id } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default router;

/* ----------------------------------------------------------------------- inbox */

export const inboxRouter = Router();
inboxRouter.use(rejectStoreToken, authenticatePlatform);

inboxRouter.get(
  "/",
  validate({
    query: z.object({
      handled: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 50;
      const where = {};
      if (req.query.handled)
        where.handledAt = req.query.handled === "true" ? { not: null } : null;
      else where.handledAt = null;

      const [replies, total, waiting] = await Promise.all([
        prisma.storeMessageReply.findMany({
          where,
          // Oldest first: the shop that has been waiting longest is answered first.
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            organization: { select: { id: true, name: true, city: true } },
            message: { select: { id: true, subject: true } },
          },
        }),
        prisma.storeMessageReply.count({ where }),
        prisma.storeMessageReply.count({ where: { handledAt: null } }),
      ]);

      return res.json({
        replies: replies.map((r) => ({
          id: r.id,
          body: r.body,
          authorLabel: r.authorLabel,
          handledAt: r.handledAt,
          createdAt: r.createdAt,
          store: r.organization,
          inReplyTo: r.message,
        })),
        total,
        waiting,
        page,
        pageSize,
      });
    } catch (err) {
      return next(err);
    }
  },
);

inboxRouter.post("/:id/handled", async (req, res, next) => {
  try {
    const reply = await prisma.storeMessageReply.findUnique({
      where: { id: req.params.id },
    });
    if (!reply) throw new HttpError(404, "No reply with that id", "NOT_FOUND");

    const updated = await prisma.storeMessageReply.update({
      where: { id: reply.id },
      data: {
        handledAt: reply.handledAt ? null : new Date(),
        handledById: reply.handledAt ? null : req.platformAdmin.id,
      },
    });

    return res.json({ ok: true, handledAt: updated.handledAt });
  } catch (err) {
    return next(err);
  }
});

/**
 * Answer a store.
 *
 * The answer is an ordinary message addressed to that one shop, so it travels the path that
 * already works: it appears in their app, in their notifications, and they can write back
 * again. Marking the question handled at the same time is the point -- replying IS dealing
 * with it, and making the operator click twice is how a thread gets answered and left open.
 */
inboxRouter.post(
  "/:id/reply",
  validate({
    body: z.object({
      body: z.string().trim().min(2).max(5000),
      subject: z.string().trim().min(2).max(140).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const question = await prisma.storeMessageReply.findUnique({
        where: { id: req.params.id },
        include: { message: { select: { subject: true } } },
      });
      if (!question)
        throw new HttpError(404, "No reply with that id", "NOT_FOUND");

      const original = question.message?.subject ?? null;
      const subject =
        req.body.subject ??
        (original
          ? original.startsWith("Re:")
            ? original
            : `Re: ${original}`
          : "A reply from FreshFlow support");

      const sentAt = new Date();
      const [message] = await prisma.$transaction([
        prisma.platformMessage.create({
          data: {
            subject,
            body: req.body.body,
            kind: "DIRECT",
            inReplyToId: question.id,
            audience: { storeIds: [question.organizationId] },
            status: "SENT",
            sentAt,
            createdById: req.platformAdmin.id,
            createdByLabel: `${req.platformAdmin.name} <${req.platformAdmin.email}>`,
            recipients: {
              create: [{ organizationId: question.organizationId }],
            },
          },
        }),
        prisma.storeMessageReply.update({
          where: { id: question.id },
          data: { handledAt: sentAt, handledById: req.platformAdmin.id },
        }),
      ]);

      await writeAudit({
        req,
        action: AUDIT.MESSAGE_SENT,
        organizationId: question.organizationId,
        targetType: "platform_message",
        targetId: message.id,
        reason: subject,
        changes: { kind: "DIRECT", inReplyTo: question.id },
      });

      return res.status(201).json({
        message: { id: message.id, subject, body: message.body, sentAt },
      });
    } catch (err) {
      return next(err);
    }
  },
);

/** The whole conversation with one store, oldest first, so it reads top to bottom. */
inboxRouter.get("/thread/:organizationId", async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    const [fromStore, fromUs] = await Promise.all([
      prisma.storeMessageReply.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          id: true,
          body: true,
          authorLabel: true,
          handledAt: true,
          createdAt: true,
        },
      }),
      prisma.platformMessage.findMany({
        where: { recipients: { some: { organizationId } }, status: "SENT" },
        orderBy: { sentAt: "asc" },
        take: 100,
        select: {
          id: true,
          subject: true,
          body: true,
          sentAt: true,
          createdByLabel: true,
          kind: true,
        },
      }),
    ]);

    // Merged into one list so the conversation reads in the order it happened.
    const thread = [
      ...fromStore.map((r) => ({
        id: r.id,
        side: "store",
        body: r.body,
        who: r.authorLabel,
        at: r.createdAt,
        handledAt: r.handledAt,
      })),
      ...fromUs.map((m) => ({
        id: m.id,
        side: "platform",
        subject: m.subject,
        body: m.body,
        who: m.createdByLabel,
        at: m.sentAt,
        kind: m.kind,
      })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    return res.json({ thread });
  } catch (err) {
    return next(err);
  }
});
