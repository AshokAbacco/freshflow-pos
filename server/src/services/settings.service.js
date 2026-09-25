import { prisma } from '../lib/prisma.js';

const DEFAULTS = {
  currency: 'INR',
  taxRate: 5,
  maxCashierDiscountPct: 10,
};

const cache = new Map();
const TTL_MS = 15_000;

/** Store settings are one row per organization; created with defaults on first read. */
export async function getSettings(organizationId, { fresh = false } = {}) {
  const hit = cache.get(organizationId);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await prisma.storeSetting.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, storeName: 'My Store', ...DEFAULTS },
  });
  cache.set(organizationId, { value, at: Date.now() });
  return value;
}

export async function updateSettings(organizationId, data) {
  const value = await prisma.storeSetting.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...DEFAULTS, ...data },
  });
  cache.set(organizationId, { value, at: Date.now() });
  return value;
}
