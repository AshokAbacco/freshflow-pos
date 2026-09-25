import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../utils/http.js';

export const ROLES = Object.freeze({ CASHIER: 'CASHIER', ADMIN: 'ADMIN' });

const ISSUER = 'freshflow-pos';
const AUDIENCE = 'freshflow-pos-client';

export function signToken(user) {
  return jwt.sign({ role: user.role, name: user.name, org: user.organizationId }, env.jwtSecret, {
    subject: user.id,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  });
}

/*
 * A signed token proves who the user was at sign-in. To make role changes and deactivations
 * take effect before the token expires, the claim is re-checked against the database,
 * cached briefly so busy terminals don't add a query to every request.
 */
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map();

export function invalidateUserCache(userId) {
  userCache.delete(userId);
}

async function loadAccount(userId) {
  const hit = userCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.account;
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      organizationId: true,
      organization: { select: { id: true, name: true, slug: true, subscription: true } },
    },
  });
  userCache.set(userId, { account, expires: Date.now() + USER_CACHE_TTL_MS });
  return account;
}

export async function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Sign in to continue', 'UNAUTHENTICATED'));
  }

  let claims;
  try {
    claims = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Your session has expired. Sign in again.' : 'Your session is not valid. Sign in again.';
    return next(new HttpError(401, message, 'UNAUTHENTICATED'));
  }

  if (!claims.sub || !Object.values(ROLES).includes(claims.role)) {
    return next(new HttpError(401, 'Your session is not valid. Sign in again.', 'UNAUTHENTICATED'));
  }

  try {
    const account = await loadAccount(claims.sub);
    if (!account || !account.isActive) {
      return next(new HttpError(401, 'This account has been deactivated', 'ACCOUNT_DISABLED'));
    }
    if (account.role !== claims.role) {
      return next(new HttpError(401, 'Your role has changed. Sign in again.', 'ROLE_CHANGED'));
    }
    if (claims.org && claims.org !== account.organizationId) {
      return next(new HttpError(401, 'Your session is not valid. Sign in again.', 'UNAUTHENTICATED'));
    }
    req.user = {
      id: account.id,
      name: account.name,
      role: account.role,
      organizationId: account.organizationId,
    };
    req.organization = account.organization;
    req.subscription = account.organization?.subscription ?? null;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Allow only the listed roles, based on the verified role claim. */
export const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Sign in to continue', 'UNAUTHENTICATED'));
  if (!allowedRoles.includes(req.user.role)) {
    return next(new HttpError(403, 'Your role does not have access to this area', 'FORBIDDEN'));
  }
  return next();
};
