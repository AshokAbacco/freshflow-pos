/**
 * /api/v1/platform/users
 *
 * Every staff account across every store, for the call that starts "I can't get in".
 *
 * What this can honestly do today is find the account and turn it off or back on. Disabling
 * bites immediately: middleware/auth.js re-reads isActive on every store request, so a cashier
 * holding a live token is refused on their next call. That makes Disable an effective sign-out
 * as well.
 *
 * What it deliberately does NOT offer is a "send reset link" button. Store users have no
 * password-token table (only platform admins do), so that button could not do anything, and a
 * button that silently does nothing is worse than no button.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import {
  PLATFORM_ROLES,
  authenticatePlatform,
  rejectStoreToken,
  requirePlatformRole,
  requireReason,
} from "../../middleware/platform-auth.js";
import { validate } from "../../middleware/validate.js";
import { AUDIT, writeAudit } from "../../services/audit.service.js";
import { phoneKey } from "../../utils/phone.js";
import { HttpError } from "../../utils/http.js";

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

const SUPER = PLATFORM_ROLES.SUPER_ADMIN;

const shape = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isActive: u.isActive,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  store: u.organization
    ? {
        id: u.organization.id,
        name: u.organization.name,
        city: u.organization.city,
      }
    : null,
});

router.get(
  "/",
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      role: z.enum(["ADMIN", "CASHIER"]).optional(),
      isActive: z.enum(["true", "false"]).optional(),
      organizationId: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 50;
      const where = {};

      if (req.query.role) where.role = req.query.role;
      if (req.query.isActive) where.isActive = req.query.isActive === "true";
      if (req.query.organizationId)
        where.organizationId = req.query.organizationId;

      if (req.query.q) {
        const term = req.query.q;
        /*
         * phoneKey returns null unless the term holds at least ten digits -- that is its
         * contract, so a four-digit extension can never prefix-match a mobile. It is the test
         * for "is this a phone number at all", and it keeps the phone lookup off the path for
         * an ordinary name search.
         */
        const digits = phoneKey(term);

        /*
         * A phone match cannot be a Prisma `contains`: numbers are stored as typed, so
         * "+91 98765 43210" does not contain "9876543210". Matching has to happen on the
         * normalized form, which is what users_phone_digits_idx indexes. Prisma cannot query an
         * expression index, so the ids are resolved in one raw statement first and fed back in.
         */
        let phoneIds = [];
        if (digits) {
          const rows = await prisma.$queryRawUnsafe(
            `SELECT id FROM users
             WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1
             LIMIT 500`,
            digits,
          );
          phoneIds = rows.map((r) => r.id);
        }

        where.OR = [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { organization: { name: { contains: term, mode: "insensitive" } } },
          ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: [{ isActive: "desc" }, { lastLoginAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            organization: { select: { id: true, name: true, city: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return res.json({ users: rows.map(shape), total, page, pageSize });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * Turning a staff account off or back on. SUPER_ADMIN and a written reason, because this stops
 * someone working mid-shift and the shop will ring up asking who did it.
 */
router.post(
  "/:id/set-active",
  requirePlatformRole(SUPER),
  requireReason,
  validate({ body: z.object({ isActive: z.boolean(), reason: z.string() }) }),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          organization: { select: { id: true, name: true, city: true } },
        },
      });
      if (!user) throw new HttpError(404, "No user with that id", "NOT_FOUND");

      if (user.isActive === req.body.isActive) {
        throw new HttpError(
          409,
          req.body.isActive
            ? "That account is already active"
            : "That account is already disabled",
          "NO_CHANGE",
        );
      }

      /*
       * A store must keep at least one working owner. Disabling the last active ADMIN would
       * lock the shop out of its own settings, staff and billing with no way back in except us.
       */
      if (!req.body.isActive && user.role === "ADMIN") {
        const otherOwners = await prisma.user.count({
          where: {
            organizationId: user.organizationId,
            role: "ADMIN",
            isActive: true,
            id: { not: user.id },
          },
        });
        if (otherOwners === 0) {
          throw new HttpError(
            409,
            "This is the store’s only active owner. Disabling it would lock them out of their own shop.",
            "LAST_OWNER",
          );
        }
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { isActive: req.body.isActive },
        include: {
          organization: { select: { id: true, name: true, city: true } },
        },
      });

      await writeAudit({
        req,
        action: req.body.isActive
          ? AUDIT.STORE_USER_ENABLED
          : AUDIT.STORE_USER_DISABLED,
        organizationId: user.organizationId,
        targetType: "user",
        targetId: user.id,
        changes: {
          email: user.email,
          from: user.isActive,
          to: req.body.isActive,
        },
      });

      return res.json({ user: shape(updated) });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
