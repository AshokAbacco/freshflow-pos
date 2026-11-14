/**
 * /api/v1/platform/team
 *
 * The platform's own staff accounts.
 *
 * SUPER_ADMIN only, and the whole file matters for one reason: these accounts can suspend a
 * business and read every shop's payment history. The two rules worth stating plainly are
 * that the last super admin can never be removed or demoted -- `assertNotLastSuperAdmin`
 * enforces it and it is called before every change that could strand the platform with nobody
 * who can administer it -- and that nobody sets another person's password here. A new admin
 * gets a one-time link and chooses their own, so there is no moment where one person knows
 * another's password.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  PLATFORM_ROLES,
  authenticatePlatform,
  invalidatePlatformAdminCache,
  rejectStoreToken,
  requirePlatformRole,
} from '../../middleware/platform-auth.js';
import { validate } from '../../middleware/validate.js';
import { AUDIT, writeAudit } from '../../services/audit.service.js';
import {
  assertNotLastSuperAdmin,
  issuePasswordToken,
  publicAdmin,
  revokeAllSessions,
} from '../../services/platform-auth.service.js';
import { HttpError } from '../../utils/http.js';

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);
router.use(requirePlatformRole(PLATFORM_ROLES.SUPER_ADMIN));

const ROLES = Object.values(PLATFORM_ROLES);

const shape = (a, counts = {}) => ({
  ...publicAdmin(a),
  passwordSetAt: a.passwordSetAt,
  lockedUntil: a.lockedUntil,
  failedLogins: a.failedLogins,
  createdAt: a.createdAt,
  activeSessions: counts[a.id] ?? 0,
});

router.get('/', async (_req, res, next) => {
  try {
    const admins = await prisma.platformAdmin.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });

    // How many devices each person is currently signed in on.
    const sessions = await prisma.platformSession.groupBy({
      by: ['adminId'],
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      _count: { adminId: true },
    });
    const counts = Object.fromEntries(sessions.map((s) => [s.adminId, s._count.adminId]));

    return res.json({
      admins: admins.map((a) => shape(a, counts)),
      superAdmins: admins.filter((a) => a.role === PLATFORM_ROLES.SUPER_ADMIN && a.isActive).length,
    });
  } catch (err) {
    return next(err);
  }
});

router.post(
  '/',
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(190),
      phone: z.string().trim().max(32).optional(),
      role: z.enum(ROLES),
    }),
  }),
  async (req, res, next) => {
    try {
      const existing = await prisma.platformAdmin.findUnique({
        where: { email: req.body.email },
        select: { id: true },
      });
      if (existing) {
        throw new HttpError(409, 'A platform account already uses that email', 'EMAIL_TAKEN');
      }

      /*
       * Created with an unusable password hash. The invite link is the only way in, so there
       * is no window where the account exists with a password somebody else chose.
       */
      const admin = await prisma.platformAdmin.create({
        data: {
          name: req.body.name,
          email: req.body.email,
          phone: req.body.phone || null,
          role: req.body.role,
          passwordHash: 'invite-pending',
          isActive: true,
        },
      });

      const token = await issuePasswordToken(admin.id, { purpose: 'INVITE', minutes: 60 * 48 });

      await writeAudit({
        req,
        action: AUDIT.ADMIN_CREATED,
        targetType: 'platform_admin',
        targetId: admin.id,
        reason: `Invited ${req.body.email} as ${req.body.role}`,
        changes: { email: req.body.email, role: req.body.role },
      });

      /*
       * The link is returned rather than emailed: no mail provider is wired up, and returning
       * it is honest about that. The caller copies it to the new admin over whatever channel
       * they already trust.
       */
      return res.status(201).json({
        admin: shape(admin),
        inviteToken: token,
        inviteExpiresInHours: 48,
      });
    } catch (err) {
      return next(err);
    }
  },
);

router.patch(
  '/:id',
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      role: z.enum(ROLES).optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const admin = await prisma.platformAdmin.findUnique({ where: { id: req.params.id } });
      if (!admin) throw new HttpError(404, 'No platform account with that id', 'NOT_FOUND');

      const { name, phone, role, isActive } = req.body;

      // Locking yourself out is the one mistake that cannot be undone from in here.
      if (admin.id === req.platformAdmin.id && isActive === false) {
        throw new HttpError(409, 'You cannot disable your own account', 'SELF_DISABLE');
      }
      if (admin.id === req.platformAdmin.id && role && role !== admin.role) {
        throw new HttpError(409, 'You cannot change your own role', 'SELF_DEMOTE');
      }

      // Refuses when this would leave no active super admin at all.
      if (role !== undefined || isActive !== undefined) {
        await assertNotLastSuperAdmin(admin.id, { nextRole: role, nextActive: isActive });
      }

      const data = {};
      if (name !== undefined) data.name = name;
      if (phone !== undefined) data.phone = phone || null;
      if (role !== undefined) data.role = role;
      if (isActive !== undefined) data.isActive = isActive;
      if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to change', 'NO_CHANGE');

      const updated = await prisma.platformAdmin.update({ where: { id: admin.id }, data });

      // A disabled account or a changed role must stop working now, not when the token expires.
      if (isActive === false || (role && role !== admin.role)) {
        await revokeAllSessions(admin.id);
      }
      invalidatePlatformAdminCache(admin.id);

      await writeAudit({
        req,
        action: AUDIT.ADMIN_UPDATED,
        targetType: 'platform_admin',
        targetId: admin.id,
        reason: `Updated ${admin.email}`,
        changes: {
          role: role !== undefined ? { from: admin.role, to: role } : undefined,
          isActive: isActive !== undefined ? { from: admin.isActive, to: isActive } : undefined,
        },
      });

      return res.json({ admin: shape(updated) });
    } catch (err) {
      return next(err);
    }
  },
);

/** A fresh one-time link, for a forgotten password or a lost invite. */
router.post('/:id/reset-link', async (req, res, next) => {
  try {
    const admin = await prisma.platformAdmin.findUnique({ where: { id: req.params.id } });
    if (!admin) throw new HttpError(404, 'No platform account with that id', 'NOT_FOUND');
    if (!admin.isActive) {
      throw new HttpError(409, 'Enable the account before sending a reset link', 'INACTIVE');
    }

    const token = await issuePasswordToken(admin.id, { purpose: 'RESET', minutes: 60 });

    await writeAudit({
      req,
      action: AUDIT.PASSWORD_RESET_REQUESTED,
      targetType: 'platform_admin',
      targetId: admin.id,
      reason: `Issued a reset link for ${admin.email}`,
    });

    return res.json({ resetToken: token, expiresInMinutes: 60 });
  } catch (err) {
    return next(err);
  }
});

/** Sign someone out of every device, e.g. a lost laptop. */
router.post('/:id/sign-out', async (req, res, next) => {
  try {
    const admin = await prisma.platformAdmin.findUnique({ where: { id: req.params.id } });
    if (!admin) throw new HttpError(404, 'No platform account with that id', 'NOT_FOUND');

    const { count } = await revokeAllSessions(admin.id);
    invalidatePlatformAdminCache(admin.id);

    await writeAudit({
      req,
      action: AUDIT.SESSIONS_REVOKED,
      targetType: 'platform_admin',
      targetId: admin.id,
      reason: `Signed ${admin.email} out of every device`,
      changes: { sessions: count },
    });

    return res.json({ ok: true, signedOut: count });
  } catch (err) {
    return next(err);
  }
});

export default router;
