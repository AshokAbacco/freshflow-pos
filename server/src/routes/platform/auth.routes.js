/**
 * Platform sign-in: POST /api/v1/platform/auth/*
 *
 * Mounted before authenticatePlatform, since signing in is what produces the token. Only
 * /me, /logout, /logout-all and /sessions sit behind it.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import {
  authenticatePlatform,
  invalidatePlatformAdminCache,
  rejectStoreToken,
} from "../../middleware/platform-auth.js";
import { validate } from "../../middleware/validate.js";
import { AUDIT, clientIp, writeAudit } from "../../services/audit.service.js";
import {
  authenticatePlatformAdmin,
  consumePasswordToken,
  createSession,
  findLiveSession,
  issuePasswordToken,
  publicAdmin,
  revokeAllSessions,
  revokeSession,
  signPlatformAccessToken,
} from "../../services/platform-auth.service.js";
import { HttpError } from "../../utils/http.js";

const router = Router();

/*
 * Tighter than the store login limiter: there are a handful of platform accounts, so a real
 * person never needs many attempts, and these accounts can move money. Keyed on IP + email
 * so one attacker cannot lock out every admin by guessing against each address in turn.
 */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.isProd ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${clientIp(req) ?? "unknown"}:${String(req.body?.email ?? "").toLowerCase()}`,
  message: {
    error: {
      message: "Too many sign-in attempts. Try again shortly.",
      code: "RATE_LIMITED",
    },
  },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.isProd ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req) ?? "unknown",
  message: {
    error: {
      message: "Too many reset requests. Try again later.",
      code: "RATE_LIMITED",
    },
  },
});

const loginSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter the email address you sign in with"),
    password: z.string().min(1, "Enter your password"),
    totp: z
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .optional(),
  }),
};

const sessionCookie = "ff_platform_refresh";

/*
 * The project has no cookie middleware and this is the only cookie it needs, so the one
 * value is read straight off the header rather than adding a dependency for it.
 */
function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

/*
 * The refresh token goes in an HttpOnly cookie rather than the response body, so a cross-site
 * script in the panel cannot read it. Path-scoped to the refresh endpoint so it is not sent
 * with every API call.
 */
const refreshCookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: env.isProd,
  path: "/api/v1/platform/auth",
  maxAge: env.platformSessionDays * 86_400_000,
};

router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    const { email, password } = req.body;
    try {
      const admin = await authenticatePlatformAdmin({ email, password });

      // TOTP is verified here once enrolment ships; until then an account with it switched on
      // must not be signable-in without it, so refuse rather than silently skipping the check.
      if (admin.totpEnabled) {
        return next(
          new HttpError(
            501,
            "This account has two-factor authentication on, which this build cannot verify yet. Turn it off with the admin:set script to sign in.",
            "TOTP_NOT_SUPPORTED",
          ),
        );
      }

      const { session, refreshToken } = await createSession(admin.id, {
        ip: clientIp(req),
        userAgent: req.headers["user-agent"]?.slice(0, 300),
      });

      await writeAudit({
        req: { ...req, platformAdmin: publicAdmin(admin) },
        action: AUDIT.LOGIN,
      });

      res.cookie(sessionCookie, refreshToken, refreshCookieOptions);
      return res.json({
        admin: publicAdmin(admin),
        accessToken: signPlatformAccessToken(admin, session.id),
        expiresIn: env.platformJwtExpiresIn,
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        await writeAudit({
          action: AUDIT.LOGIN_FAILED,
          actor: { label: `anonymous <${email}>` },
          changes: { ip: clientIp(req) },
        });
      }
      return next(err);
    }
  },
);

/** Trades the refresh cookie for a new short-lived access token. */
router.post("/refresh", async (req, res, next) => {
  try {
    const session = await findLiveSession(readCookie(req, sessionCookie));
    if (!session) {
      res.clearCookie(sessionCookie, refreshCookieOptions);
      return next(
        new HttpError(
          401,
          "Your session has ended. Sign in again.",
          "SESSION_REVOKED",
        ),
      );
    }
    if (!session.admin.isActive) {
      return next(
        new HttpError(
          403,
          "This platform account has been disabled",
          "ACCOUNT_DISABLED",
        ),
      );
    }
    await prisma.platformSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return res.json({
      admin: publicAdmin(session.admin),
      accessToken: signPlatformAccessToken(session.admin, session.id),
      expiresIn: env.platformJwtExpiresIn,
    });
  } catch (err) {
    return next(err);
  }
});

router.post(
  "/forgot",
  resetLimiter,
  validate({
    body: z.object({ email: z.string().trim().toLowerCase().email() }),
  }),
  async (req, res, next) => {
    try {
      const admin = await prisma.platformAdmin.findUnique({
        where: { email: req.body.email },
      });
      if (admin?.isActive) {
        const token = await issuePasswordToken(admin.id, {
          purpose: "RESET",
          minutes: 60,
        });
        await writeAudit({
          action: AUDIT.PASSWORD_RESET_REQUESTED,
          actor: { label: `anonymous <${req.body.email}>` },
          targetType: "platform_admin",
          targetId: admin.id,
        });
        // Delivery is the mail provider's job. Until one is configured the link is logged on the
        // server rather than returned, so this endpoint can never be used to harvest tokens.
        if (!env.isProd) {
          console.log(
            `[platform] password reset for ${admin.email}: /platform/reset?token=${token}`,
          );
        }
      }
      // Always the same answer, so this cannot be used to find out who works here.
      return res.json({
        ok: true,
        message: "If that address has an account, a reset link is on its way.",
      });
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  "/reset",
  resetLimiter,
  validate({
    body: z.object({ token: z.string().min(10), password: z.string().min(12) }),
  }),
  async (req, res, next) => {
    try {
      const adminId = await consumePasswordToken(
        req.body.token,
        req.body.password,
      );
      invalidatePlatformAdminCache(adminId);
      await writeAudit({
        action: AUDIT.PASSWORD_RESET,
        targetType: "platform_admin",
        targetId: adminId,
      });
      return res.json({
        ok: true,
        message: "Password changed. Sign in with it now.",
      });
    } catch (err) {
      return next(err);
    }
  },
);

// ---------------------------------------------------------------- signed in

router.use(rejectStoreToken, authenticatePlatform);

router.get("/me", (req, res) => res.json({ admin: req.platformAdmin }));

router.get("/sessions", async (req, res, next) => {
  try {
    const sessions = await prisma.platformSession.findMany({
      where: {
        adminId: req.platformAdmin.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
    return res.json({
      sessions: sessions.map((s) => ({
        ...s,
        current: s.id === req.platformSessionId,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    await revokeSession(req.platformSessionId);
    invalidatePlatformAdminCache(req.platformAdmin.id);
    await writeAudit({ req, action: AUDIT.LOGOUT });
    res.clearCookie(sessionCookie, refreshCookieOptions);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout-all", async (req, res, next) => {
  try {
    const { count } = await revokeAllSessions(req.platformAdmin.id);
    invalidatePlatformAdminCache(req.platformAdmin.id);
    await writeAudit({
      req,
      action: AUDIT.SESSIONS_REVOKED,
      changes: { revoked: count },
    });
    res.clearCookie(sessionCookie, refreshCookieOptions);
    return res.json({ ok: true, revoked: count });
  } catch (err) {
    return next(err);
  }
});

export default router;
