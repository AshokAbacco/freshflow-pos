/**
 * /api/v1/platform/audit
 *
 * The record of what platform staff did, and why.
 *
 * Read-only on purpose: there is no route here that edits or deletes an entry, because an audit
 * log that can be edited from the panel it audits is not evidence of anything. Entries outlive
 * the store they refer to -- AuditLog holds organizationId with no foreign key for exactly that
 * reason -- so a deleted store does not take its history with it.
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

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

// Reading the audit log is itself sensitive: it names who did what, and the reasons often carry
// customer detail. Support staff work the stores; they do not review their colleagues.
router.use(
  requirePlatformRole(PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.FINANCE),
);

router.get(
  "/",
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      action: z.string().trim().max(80).optional(),
      actorAdminId: z.string().trim().max(80).optional(),
      organizationId: z.string().trim().max(80).optional(),
      targetType: z.string().trim().max(40).optional(),
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
      if (req.query.action) where.action = req.query.action;
      if (req.query.actorAdminId) where.actorAdminId = req.query.actorAdminId;
      if (req.query.organizationId)
        where.organizationId = req.query.organizationId;
      if (req.query.targetType) where.targetType = req.query.targetType;
      if (req.query.from || req.query.to) {
        where.createdAt = {};
        if (req.query.from) where.createdAt.gte = new Date(req.query.from);
        if (req.query.to) where.createdAt.lte = new Date(req.query.to);
      }
      if (req.query.q) {
        where.OR = [
          { reason: { contains: req.query.q, mode: "insensitive" } },
          { actorLabel: { contains: req.query.q, mode: "insensitive" } },
          { action: { contains: req.query.q, mode: "insensitive" } },
        ];
      }

      const [entries, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);

      /*
       * Store names are looked up in one go rather than joined, because AuditLog deliberately
       * has no relation to Organization. A store that has since been deleted simply comes back
       * without a name, and its history still reads.
       */
      const ids = [
        ...new Set(entries.map((e) => e.organizationId).filter(Boolean)),
      ];
      const stores = ids.length
        ? await prisma.organization.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          })
        : [];
      const nameById = new Map(stores.map((s) => [s.id, s.name]));

      return res.json({
        entries: entries.map((e) => ({
          id: e.id,
          action: e.action,
          actorLabel: e.actorLabel,
          actorRole: e.actorRole,
          actorAdminId: e.actorAdminId,
          reason: e.reason,
          changes: e.changes,
          targetType: e.targetType,
          targetId: e.targetId,
          ip: e.ip,
          createdAt: e.createdAt,
          storeId: e.organizationId,
          storeName: e.organizationId
            ? (nameById.get(e.organizationId) ?? null)
            : null,
        })),
        total,
        page,
        pageSize,
      });
    } catch (err) {
      return next(err);
    }
  },
);

/** The distinct actions present, so the filter offers what actually happened. */
router.get("/actions", async (_req, res, next) => {
  try {
    const rows = await prisma.auditLog.groupBy({
      by: ["action"],
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: 60,
    });
    return res.json({
      actions: rows.map((r) => ({ action: r.action, count: r._count.action })),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
