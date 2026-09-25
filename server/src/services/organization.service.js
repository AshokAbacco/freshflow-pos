import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../utils/http.js';
import { trialSubscriptionData } from './billing.service.js';

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 50) || 'store';

async function uniqueSlug(name) {
  const base = slugify(name);
  for (let n = 1; n < 500; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  throw new HttpError(409, 'Could not create a unique store address');
}

/**
 * Sign up a new store: organization, its first admin, store settings and a free trial.
 * Created in one database transaction so a half-made store can never exist.
 */
export async function createOrganization({ storeName, name, email, password, phone }) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new HttpError(409, 'An account with this email already exists. Sign in instead.', 'EMAIL_TAKEN');

  const slug = await uniqueSlug(storeName);
  const passwordHash = await bcrypt.hash(password, 12);

  return prisma.$transaction(async (db) => {
    const organization = await db.organization.create({ data: { name: storeName, slug } });
    const user = await db.user.create({
      data: { organizationId: organization.id, name, email, passwordHash, role: 'ADMIN' },
    });
    await db.storeSetting.create({
      data: { organizationId: organization.id, storeName, phone: phone || null },
    });
    const subscription = await db.subscription.create({
      data: { organizationId: organization.id, ...trialSubscriptionData() },
    });
    return { organization, user, subscription };
  });
}
