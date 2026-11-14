/**
 * Gate for every /api/v1/platform route.
 *
 * Hiding a button in the panel is not authorization. Each route states the roles it accepts
 * and this refuses everything else, so an attacker with a SUPPORT token gets a 403 from the
 * API whatever the frontend chooses to render.
 */
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http.js";
import {
  PLATFORM_ROLES,
  publicAdmin,
  verifyPlatformAccessToken,
} from "../services/platform-auth.service.js";

export { PLATFORM_ROLES };

/*
 * Re-reads the admin and their session on each request, cached briefly. Without the re-read,
 * disabling an account or signing it out would not bite until the access token expired. The
 * cache keeps a busy panel from adding two queries to every call; 15s is short enough that a
 * revocation is effectively immediate.
 */
const CACHE_TTL_MS = 15_000;
const cache = new Map();

export function invalidatePlatformAdminCache(adminId) {
  if (!adminId) {
    cache.clear();
    return;
  }
  for (const [key, entry] of cache) {
    if (entry.value?.admin?.id === adminId) cache.delete(key);
  }
}

async function loadSession(sessionId, adminId) {
  const key = `${adminId}:${sessionId}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const session = await prisma.platformSession.findUnique({
    where: { id: sessionId },
    include: { admin: true },
  });

  const value =
    !session ||
    session.adminId !== adminId ||
    session.revokedAt ||
    session.expiresAt <= new Date()
      ? null
      : { session, admin: session.admin };

  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function authenticatePlatform(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return next(new HttpError(401, "Sign in to continue", "UNAUTHENTICATED"));
  }

  try {
    const claims = verifyPlatformAccessToken(token);

    // A token with no session claim predates session tracking, or is forged. Either way, no.
    if (!claims.sid) {
      return next(
        new HttpError(
          401,
          "Your session is not valid. Sign in again.",
          "UNAUTHENTICATED",
        ),
      );
    }

    const live = await loadSession(claims.sid, claims.sub);
    if (!live) {
      return next(
        new HttpError(
          401,
          "You have been signed out. Sign in again.",
          "SESSION_REVOKED",
        ),
      );
    }
    if (!live.admin.isActive) {
      return next(
        new HttpError(
          403,
          "This platform account has been disabled",
          "ACCOUNT_DISABLED",
        ),
      );
    }
    // The role in the token is only a hint; the stored role decides.
    if (live.admin.role !== claims.role) {
      return next(
        new HttpError(
          401,
          "Your role has changed. Sign in again.",
          "ROLE_CHANGED",
        ),
      );
    }

    req.platformAdmin = publicAdmin(live.admin);
    req.platformSessionId = live.session.id;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Role gate. Usage: router.post('/stores/:id/suspend', requirePlatformRole('SUPER_ADMIN'), ...)
 *
 * SUPER_ADMIN is not implicitly allowed everywhere: each route lists it where it applies, so
 * reading the route file tells you exactly who can call it.
 */
export const requirePlatformRole =
  (...allowed) =>
  (req, _res, next) => {
    if (!req.platformAdmin) {
      return next(new HttpError(401, "Sign in to continue", "UNAUTHENTICATED"));
    }
    if (!allowed.includes(req.platformAdmin.role)) {
      return next(
        new HttpError(
          403,
          "Your platform role does not allow this action",
          "FORBIDDEN",
        ),
      );
    }
    return next();
  };

/**
 * Actions that change a store's money or access must say why. The reason is stored on the
 * audit entry, so "who extended this trial and on what grounds" is answerable months later.
 */
export function requireReason(req, _res, next) {
  const reason = String(req.body?.reason ?? "").trim();
  if (reason.length < 5) {
    return next(
      new HttpError(
        400,
        "Give a reason for this change (at least 5 characters)",
        "REASON_REQUIRED",
      ),
    );
  }
  req.actionReason = reason;
  return next();
}

/**
 * Rejects a store-app token presented to a platform route early, with a message that explains
 * the mistake rather than a bare 401. Mounted before authenticatePlatform purely for clarity
 * in logs and in the panel; authenticatePlatform would refuse it regardless.
 */
export function rejectStoreToken(req, _res, next) {
  const [, token] = (req.headers.authorization || "").split(" ");
  if (!token) return next();
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
    if (
      payload?.aud === "freshflow-pos-client" ||
      (payload?.org && !payload?.kind)
    ) {
      return next(
        new HttpError(
          401,
          "This is a store sign-in. The platform panel needs a platform account.",
          "WRONG_TOKEN_AUDIENCE",
        ),
      );
    }
  } catch {
    // Unparseable token: let authenticatePlatform produce the standard refusal.
  }
  return next();
}
