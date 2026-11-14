/**
 * /api/v1/platform/account
 *
 * Your own platform login: your name, your email, your password, and the devices you are
 * signed in on.
 *
 * Everything here acts on the signed-in admin and nobody else. There is no :id -- an admin
 * editing another admin goes through /team, which is SUPER_ADMIN only. That separation is the
 * point: a support login must be able to change its own password without being able to touch
 * anyone else's.
 *
 * Changing an email or a password requires the current password, even though the caller is
 * already authenticated. An access token lasts thirty minutes, so "already signed in" is a
 * weaker claim than "knows the password right now" -- and an unattended laptop is the usual
 * way an account gets taken over.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticatePlatform, rejectStoreToken } from '../../middleware/platform-auth.js';
import { validate } from '../../middleware/validate.js';
import { AUDIT, writeAudit } from '../../services/audit.service.js';
import {
  assertPasswordAcceptable,
  hashPassword,
  publicAdmin,
  revokeAllSessions,
  verifyPassword,
} from '../../services/platform-auth.service.js';
import { invalidatePlatformAdminCache } from '../../middleware/platform-auth.js';
import { HttpError } from '../../utils/http.js';

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

/** Loads the signed-in admin with the password hash, which publicAdmin deliberately omits. */
async function loadSelf(req) {
  const admin = await prisma.platformAdmin.findUnique({ where: { id: req.platformAdmin.id } });
  if (!admin) throw new HttpError(401, 'Your account no longer exists', 'UNAUTHENTICATED');
  return admin;
}

/** Confirms the caller knows the current password before a sensitive change. */
async function confirmPassword(admin, currentPassword) {
  const ok = await verifyPassword(String(currentPassword ?? ''), admin.passwordHash);
  if (!ok) {
    throw new HttpError(401, 'That is not your current password', 'BAD_CURRENT_PASSWORD');
  }
}

router.get('/', async (req, res, next) => {
  try {
    const admin = await loadSelf(req);
    const sessions = await prisma.platformSession.findMany({
      where: { adminId: admin.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
    });

    return res.json({
      admin: publicAdmin(admin),
      passwordSetAt: admin.passwordSetAt,
      sessions: sessions.map((s) => ({ ...s, current: s.id === req.platformSessionId })),
    });
  } catch (err) {
    return next(err);
  }
});

/** Name and phone are not security-sensitive, so they do not need the password. */
router.patch(
  '/',
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().max(32).nullable().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const admin = await loadSelf(req);
      const data = {};
      if (req.body.name !== undefined) data.name = req.body.name;
      if (req.body.phone !== undefined) data.phone = req.body.phone || null;
      if (!Object.keys(data).length) {
        throw new HttpError(400, 'Nothing to change', 'NO_CHANGE');
      }

      const updated = await prisma.platformAdmin.update({ where: { id: admin.id }, data });
      // The auth middleware caches the admin row for 15 seconds; drop it so the new name shows
      // immediately rather than on the next request after the cache expires.
      invalidatePlatformAdminCache(admin.id);

      await writeAudit({
        req,
        action: AUDIT.ADMIN_UPDATED,
        targetType: 'platform_admin',
        targetId: admin.id,
        reason: 'Updated own profile',
        changes: { name: data.name, phone: data.phone },
      });

      return res.json({ admin: publicAdmin(updated) });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/email',
  validate({
    body: z.object({
      email: z.string().trim().toLowerCase().email().max(190),
      currentPassword: z.string().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      const admin = await loadSelf(req);
      await confirmPassword(admin, req.body.currentPassword);

      if (req.body.email === admin.email) {
        throw new HttpError(409, 'That is already your email address', 'NO_CHANGE');
      }

      const taken = await prisma.platformAdmin.findUnique({
        where: { email: req.body.email },
        select: { id: true },
      });
      if (taken) {
        throw new HttpError(409, 'Another platform account already uses that email', 'EMAIL_TAKEN');
      }

      const updated = await prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { email: req.body.email },
      });
      invalidatePlatformAdminCache(admin.id);

      await writeAudit({
        req,
        action: AUDIT.ADMIN_UPDATED,
        targetType: 'platform_admin',
        targetId: admin.id,
        reason: 'Changed own email address',
        // The old address is the useful half: it says which account this was.
        changes: { emailFrom: admin.email, emailTo: req.body.email },
      });

      return res.json({ admin: publicAdmin(updated) });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/password',
  validate({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(1),
      signOutOthers: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const admin = await loadSelf(req);
      await confirmPassword(admin, req.body.currentPassword);

      if (req.body.newPassword === req.body.currentPassword) {
        throw new HttpError(400, 'The new password must be different', 'SAME_PASSWORD');
      }
      // Throws an HttpError describing what is wrong, so the message reaches the form.
      assertPasswordAcceptable(req.body.newPassword);

      await prisma.platformAdmin.update({
        where: { id: admin.id },
        data: {
          passwordHash: await hashPassword(req.body.newPassword),
          passwordSetAt: new Date(),
          failedLogins: 0,
          lockedUntil: null,
        },
      });

      /*
       * Changing a password usually means it was shared or exposed, so other sessions should
       * stop working. Defaults to true, and this session is kept so the person is not thrown
       * out of the form they just submitted.
       */
      const signOutOthers = req.body.signOutOthers !== false;
      if (signOutOthers) {
        await revokeAllSessions(admin.id);
        // revokeAllSessions clears every session including this one, so restore the current
        // one: the caller proved they know the password a moment ago.
        await prisma.platformSession.updateMany({
          where: { id: req.platformSessionId },
          data: { revokedAt: null },
        });
      }
      invalidatePlatformAdminCache(admin.id);

      await writeAudit({
        req,
        action: AUDIT.PASSWORD_RESET,
        targetType: 'platform_admin',
        targetId: admin.id,
        reason: 'Changed own password',
        changes: { signedOutOtherDevices: signOutOthers },
      });

      return res.json({ ok: true, signedOutOtherDevices: signOutOthers });
    } catch (err) {
      return next(err);
    }
  },
);

/** Sign one other device out, by its session id. */
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.platformSessionId) {
      throw new HttpError(
        400,
        'That is this device. Use Sign out instead.',
        'CURRENT_SESSION',
      );
    }
    const session = await prisma.platformSession.findUnique({ where: { id: req.params.id } });
    if (!session || session.adminId !== req.platformAdmin.id) {
      throw new HttpError(404, 'No such session on your account', 'NOT_FOUND');
    }

    await prisma.platformSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    invalidatePlatformAdminCache(req.platformAdmin.id);

    await writeAudit({
      req,
      action: AUDIT.SESSIONS_REVOKED,
      targetType: 'platform_session',
      targetId: session.id,
      reason: 'Signed out another device',
    });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
