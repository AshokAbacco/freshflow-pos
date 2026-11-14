/**
 * /api/v1/platform/follow-ups
 *
 * The support desk's own worklist: who to call, about what, by when.
 *
 * Every role can work this list -- chasing a renewal is the job, not a privileged action -- so
 * these routes gate on authentication rather than role. What they do not allow is editing the
 * subscription itself; that lives in stores.routes.js behind SUPER_ADMIN and a written reason.
 *
 * Rows raised by the nightly job carry an `autoKey`, which is unique, so a job that runs twice
 * cannot raise the same chase twice. A human-created row has no key and is never deduplicated.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import {
  authenticatePlatform,
  rejectStoreToken,
} from "../../middleware/platform-auth.js";
import { validate } from "../../middleware/validate.js";
import { AUDIT, writeAudit } from "../../services/audit.service.js";
import { HttpError } from "../../utils/http.js";

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

const TYPES = [
  "RENEWAL",
  "PAYMENT_FAILED",
  "ONBOARDING",
  "SUPPORT_ISSUE",
  "UPSELL",
  "OTHER",
];
const PRIORITIES = ["LOW", "NORMAL", "HIGH"];
const STATUSES = ["OPEN", "DONE", "CANCELLED"];

const storeSelect = {
  select: { id: true, name: true, city: true, businessType: true },
};
const adminSelect = { select: { id: true, name: true, email: true } };

const shape = (row) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  status: row.status,
  priority: row.priority,
  dueAt: row.dueAt,
  result: row.result,
  autoKey: row.autoKey,
  closedAt: row.closedAt,
  createdAt: row.createdAt,
  store: row.organization
    ? {
        id: row.organization.id,
        name: row.organization.name,
        city: row.organization.city,
        businessType: row.organization.businessType,
      }
    : null,
  assignee: row.assignee ?? null,
  createdBy: row.createdBy ?? null,
  // Computed rather than stored: "overdue" changes with the clock, so a stored flag would be
  // wrong for most of the day.
  overdue: row.status === "OPEN" && row.dueAt < new Date(),
});

/** Turns the query string into a Prisma where clause. */
function buildWhere(query, adminId) {
  const where = {};

  if (query.status) where.status = query.status;
  else where.status = "OPEN";

  if (query.type) where.type = query.type;
  if (query.priority) where.priority = query.priority;
  if (query.organizationId) where.organizationId = query.organizationId;

  if (query.assignee === "me") where.assigneeId = adminId;
  else if (query.assignee === "unassigned") where.assigneeId = null;
  else if (query.assignee) where.assigneeId = query.assignee;

  if (query.overdue === "true") {
    where.dueAt = { lt: new Date() };
    where.status = "OPEN";
  } else if (query.dueWithin) {
    where.dueAt = {
      lte: new Date(Date.now() + Number(query.dueWithin) * 86_400_000),
    };
  }

  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { organization: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }

  return where;
}

router.get(
  "/",
  validate({
    query: z.object({
      status: z.enum(STATUSES).optional(),
      type: z.enum(TYPES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assignee: z.string().trim().max(80).optional(),
      organizationId: z.string().trim().max(80).optional(),
      overdue: z.enum(["true", "false"]).optional(),
      dueWithin: z.coerce.number().int().min(1).max(365).optional(),
      q: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 50;
      const where = buildWhere(req.query, req.platformAdmin.id);

      const [rows, total] = await Promise.all([
        prisma.followUp.findMany({
          where,
          // Overdue and high priority first, then by how soon it is due.
          orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            organization: storeSelect,
            assignee: adminSelect,
            createdBy: adminSelect,
          },
        }),
        prisma.followUp.count({ where }),
      ]);

      return res.json({ followUps: rows.map(shape), total, page, pageSize });
    } catch (err) {
      return next(err);
    }
  },
);

/** The numbers behind the sidebar badge and the top-of-page tallies. */
router.get("/counts", async (req, res, next) => {
  try {
    const now = new Date();
    const [open, overdue, mine, dueToday] = await Promise.all([
      prisma.followUp.count({ where: { status: "OPEN" } }),
      prisma.followUp.count({ where: { status: "OPEN", dueAt: { lt: now } } }),
      prisma.followUp.count({
        where: { status: "OPEN", assigneeId: req.platformAdmin.id },
      }),
      prisma.followUp.count({
        where: {
          status: "OPEN",
          dueAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(+now + 86_400_000),
          },
        },
      }),
    ]);
    return res.json({ open, overdue, mine, dueToday });
  } catch (err) {
    return next(err);
  }
});

router.post(
  "/",
  validate({
    body: z.object({
      organizationId: z.string().trim().min(1),
      title: z.string().trim().min(3).max(200),
      type: z.enum(TYPES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      dueAt: z.string().datetime(),
      assigneeId: z.string().trim().max(80).nullable().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const store = await prisma.organization.findUnique({
        where: { id: req.body.organizationId },
        select: { id: true },
      });
      if (!store)
        throw new HttpError(404, "No store with that id", "NOT_FOUND");

      const followUp = await prisma.followUp.create({
        data: {
          organizationId: req.body.organizationId,
          title: req.body.title,
          type: req.body.type ?? "OTHER",
          priority: req.body.priority ?? "NORMAL",
          dueAt: new Date(req.body.dueAt),
          assigneeId: req.body.assigneeId ?? req.platformAdmin.id,
          createdById: req.platformAdmin.id,
        },
        include: {
          organization: storeSelect,
          assignee: adminSelect,
          createdBy: adminSelect,
        },
      });

      await writeAudit({
        req,
        action: AUDIT.FOLLOWUP_CREATED,
        organizationId: req.body.organizationId,
        targetType: "follow_up",
        targetId: followUp.id,
        reason: req.body.title,
      });

      return res.status(201).json({ followUp: shape(followUp) });
    } catch (err) {
      return next(err);
    }
  },
);

/** Loads a follow-up or 404s. */
async function load(id) {
  const row = await prisma.followUp.findUnique({
    where: { id },
    include: {
      organization: storeSelect,
      assignee: adminSelect,
      createdBy: adminSelect,
    },
  });
  if (!row) throw new HttpError(404, "No follow-up with that id", "NOT_FOUND");
  return row;
}

router.post(
  "/:id/close",
  validate({
    body: z.object({
      result: z.string().trim().min(3).max(2000),
      outcome: z.enum(["DONE", "CANCELLED"]).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const existing = await load(req.params.id);
      if (existing.status !== "OPEN") {
        throw new HttpError(
          409,
          "This follow-up is already closed",
          "ALREADY_CLOSED",
        );
      }

      const followUp = await prisma.followUp.update({
        where: { id: existing.id },
        data: {
          status: req.body.outcome ?? "DONE",
          result: req.body.result,
          closedAt: new Date(),
        },
        include: {
          organization: storeSelect,
          assignee: adminSelect,
          createdBy: adminSelect,
        },
      });

      await writeAudit({
        req,
        action: AUDIT.FOLLOWUP_CLOSED,
        organizationId: existing.organizationId,
        targetType: "follow_up",
        targetId: existing.id,
        reason: req.body.result,
        changes: { outcome: req.body.outcome ?? "DONE" },
      });

      return res.json({ followUp: shape(followUp) });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  "/:id/reassign",
  validate({
    body: z.object({ assigneeId: z.string().trim().min(1).nullable() }),
  }),
  async (req, res, next) => {
    try {
      const existing = await load(req.params.id);

      if (req.body.assigneeId) {
        const admin = await prisma.platformAdmin.findUnique({
          where: { id: req.body.assigneeId },
          select: { id: true, isActive: true },
        });
        // Assigning work to a disabled account is how a chase quietly goes nowhere.
        if (!admin || !admin.isActive) {
          throw new HttpError(
            400,
            "That platform account cannot take work",
            "BAD_ASSIGNEE",
          );
        }
      }

      const followUp = await prisma.followUp.update({
        where: { id: existing.id },
        data: { assigneeId: req.body.assigneeId },
        include: {
          organization: storeSelect,
          assignee: adminSelect,
          createdBy: adminSelect,
        },
      });

      await writeAudit({
        req,
        action: "followup.reassigned",
        organizationId: existing.organizationId,
        targetType: "follow_up",
        targetId: existing.id,
        reason: "Reassigned",
        changes: { from: existing.assigneeId, to: req.body.assigneeId },
      });

      return res.json({ followUp: shape(followUp) });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  "/:id/snooze",
  validate({
    body: z.object({ days: z.coerce.number().int().min(1).max(90) }),
  }),
  async (req, res, next) => {
    try {
      const existing = await load(req.params.id);
      if (existing.status !== "OPEN") {
        throw new HttpError(409, "This follow-up is closed", "ALREADY_CLOSED");
      }

      /*
       * Snooze from today, not from the old due date. Pushing an already-overdue chase "by 3
       * days" from a date last week would leave it still overdue and still shouting.
       */
      const base = existing.dueAt > new Date() ? existing.dueAt : new Date();
      const dueAt = new Date(+base + req.body.days * 86_400_000);

      const followUp = await prisma.followUp.update({
        where: { id: existing.id },
        data: { dueAt },
        include: {
          organization: storeSelect,
          assignee: adminSelect,
          createdBy: adminSelect,
        },
      });

      return res.json({ followUp: shape(followUp) });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
