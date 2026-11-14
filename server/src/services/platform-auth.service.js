/**
 * Sign-in for platform staff.
 *
 * Kept entirely apart from the store-user auth in middleware/auth.js. The two must never
 * accept each other's tokens, which is enforced three ways:
 *
 *   1. a different signing secret (env.platformJwtSecret)
 *   2. a different issuer and audience claim
 *   3. a `kind: "platform"` claim that is checked explicitly
 *
 * Any one of those would do; all three are cheap, and the failure mode -- a cashier's token
 * being accepted as a platform admin's -- is bad enough to be worth belt and braces.
 *
 * Access tokens are deliberately short-lived (30 minutes) and paired with a session row.
 * The session row is what makes "sign out all sessions" real: revoking it stops the refresh,
 * so a stolen access token dies within the half hour rather than lasting its full term.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http.js";

export const PLATFORM_ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  SUPPORT: "SUPPORT",
  FINANCE: "FINANCE",
});

const ISSUER = "freshflow-platform";
const AUDIENCE = "freshflow-platform-panel";
const TOKEN_KIND = "platform";
const BCRYPT_ROUNDS = 12;

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/** A password policy worth having, given these accounts can refund money. */
export function assertPasswordAcceptable(password) {
  const value = String(password ?? "");
  if (value.length < 12) {
    throw new HttpError(
      400,
      "Choose a password of at least 12 characters",
      "WEAK_PASSWORD",
    );
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    throw new HttpError(
      400,
      "Use at least one lower-case letter, one capital and one digit",
      "WEAK_PASSWORD",
    );
  }
}

export function signPlatformAccessToken(admin, sessionId) {
  return jwt.sign(
    { kind: TOKEN_KIND, role: admin.role, name: admin.name, sid: sessionId },
    env.platformJwtSecret,
    {
      subject: admin.id,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: "HS256",
      expiresIn: env.platformJwtExpiresIn,
    },
  );
}

/**
 * Verifies an access token's shape and signature only. The caller still has to confirm the
 * account and its session are live, because a token stays cryptographically valid after the
 * admin has been disabled or signed out.
 */
export function verifyPlatformAccessToken(token) {
  let claims;
  try {
    claims = jwt.verify(token, env.platformJwtSecret, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Your session has expired. Sign in again."
        : "Your session is not valid. Sign in again.";
    throw new HttpError(401, message, "UNAUTHENTICATED");
  }
  // A store token can never satisfy this, even if the secrets were ever misconfigured alike.
  if (
    claims.kind !== TOKEN_KIND ||
    !claims.sub ||
    !PLATFORM_ROLES[claims.role]
  ) {
    throw new HttpError(
      401,
      "Your session is not valid. Sign in again.",
      "UNAUTHENTICATED",
    );
  }
  return claims;
}

/** Opaque refresh token. Only its hash is stored, so a database leak yields no usable token. */
export function newRefreshToken() {
  const token = crypto.randomBytes(48).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export async function createSession(adminId, { ip, userAgent } = {}) {
  const { token, tokenHash } = newRefreshToken();
  const expiresAt = new Date(Date.now() + env.platformSessionDays * 86_400_000);
  const session = await prisma.platformSession.create({
    data: {
      adminId,
      tokenHash,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
    },
  });
  return { session, refreshToken: token };
}

export async function findLiveSession(refreshToken) {
  if (!refreshToken) return null;
  const session = await prisma.platformSession.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { admin: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date())
    return null;
  return session;
}

export const revokeSession = (id) =>
  prisma.platformSession.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export const revokeAllSessions = (adminId) =>
  prisma.platformSession.updateMany({
    where: { adminId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

/**
 * Sign in, with lockout.
 *
 * Deliberately gives the same answer whether the email is unknown or the password is wrong,
 * so the panel cannot be used to find out who works here. The one exception is a locked
 * account, where saying so is more useful than it is risky: the attacker already knows the
 * address, and the real admin needs to understand why their password stopped working.
 */
export async function authenticatePlatformAdmin({ email, password }) {
  const sameAnswer = () =>
    new HttpError(
      401,
      "That email and password do not match",
      "BAD_CREDENTIALS",
    );

  const admin = await prisma.platformAdmin.findUnique({
    where: {
      email: String(email ?? "")
        .trim()
        .toLowerCase(),
    },
  });

  // Spend the time anyway when the account does not exist, so response timing does not
  // reveal which addresses are real.
  if (!admin) {
    await bcrypt.compare(String(password ?? ""), "$2a$12$" + "x".repeat(53));
    throw sameAnswer();
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const minutes = Math.max(
      1,
      Math.ceil((+admin.lockedUntil - Date.now()) / 60_000),
    );
    throw new HttpError(
      429,
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      "ACCOUNT_LOCKED",
    );
  }

  const ok = await verifyPassword(String(password ?? ""), admin.passwordHash);

  if (!ok) {
    const failedLogins = admin.failedLogins + 1;
    const lock = failedLogins >= env.platformMaxFailedLogins;
    await prisma.platformAdmin.update({
      where: { id: admin.id },
      data: {
        failedLogins: lock ? 0 : failedLogins,
        lockedUntil: lock
          ? new Date(Date.now() + env.platformLockMinutes * 60_000)
          : null,
      },
    });
    throw sameAnswer();
  }

  // Checked after the password, so a disabled account's state is not disclosed to a guesser.
  if (!admin.isActive) {
    throw new HttpError(
      403,
      "This platform account has been disabled",
      "ACCOUNT_DISABLED",
    );
  }

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return admin;
}

/** What the panel is allowed to know about the signed-in admin. Never the hash or TOTP secret. */
export const publicAdmin = (admin) => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  phone: admin.phone ?? null,
  role: admin.role,
  isActive: admin.isActive,
  totpEnabled: admin.totpEnabled,
  lastLoginAt: admin.lastLoginAt ?? null,
});

/**
 * Single-use, expiring token for password reset and invite links.
 * Returns the raw token for the email; only the hash is stored.
 */
export async function issuePasswordToken(
  adminId,
  { purpose = "RESET", minutes = 60 } = {},
) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.platformPasswordToken.create({
    data: {
      adminId,
      tokenHash: sha256(token),
      purpose,
      expiresAt: new Date(Date.now() + minutes * 60_000),
    },
  });
  return token;
}

/**
 * Spends a reset token and sets the new password. The token row is marked used in the same
 * transaction as the password change, so a token cannot be redeemed twice by two concurrent
 * requests. Signs every session out, because a password reset usually means "someone else
 * may have had this account".
 */
export async function consumePasswordToken(rawToken, newPassword) {
  assertPasswordAcceptable(newPassword);
  const tokenHash = sha256(String(rawToken ?? ""));
  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const row = await tx.platformPasswordToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date()) {
      throw new HttpError(
        400,
        "This link has expired. Ask for a new one.",
        "TOKEN_INVALID",
      );
    }
    const claimed = await tx.platformPasswordToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new HttpError(
        400,
        "This link has already been used",
        "TOKEN_INVALID",
      );
    }
    await tx.platformAdmin.update({
      where: { id: row.adminId },
      data: {
        passwordHash,
        passwordSetAt: new Date(),
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await tx.platformSession.updateMany({
      where: { adminId: row.adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return row.adminId;
  });
}

/**
 * There must always be a way back in. Refuses to disable or demote the last active
 * SUPER_ADMIN, whichever route the change arrives by.
 */
export async function assertNotLastSuperAdmin(
  adminId,
  { nextRole, nextActive } = {},
) {
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
  });
  if (!admin || admin.role !== PLATFORM_ROLES.SUPER_ADMIN || !admin.isActive)
    return;

  const staysSuperAdmin =
    (nextRole ?? admin.role) === PLATFORM_ROLES.SUPER_ADMIN;
  const staysActive = nextActive ?? admin.isActive;
  if (staysSuperAdmin && staysActive) return;

  const others = await prisma.platformAdmin.count({
    where: {
      role: PLATFORM_ROLES.SUPER_ADMIN,
      isActive: true,
      id: { not: adminId },
    },
  });
  if (others === 0) {
    throw new HttpError(
      409,
      "This is the only active super admin. Promote someone else before changing this account.",
      "LAST_SUPER_ADMIN",
    );
  }
}
