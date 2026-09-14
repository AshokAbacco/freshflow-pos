import { prisma } from '../lib/prisma.js';

const DEFAULTS = {
  id: 1,
  storeName: 'My Grocery Store',
  currency: 'INR',
  taxRate: 5,
  maxCashierDiscountPct: 10,
};

let cached = null;
let cachedAt = 0;
const TTL_MS = 15_000;

/** Store settings are a single row; create it with defaults on first read. */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < TTL_MS) return cached;
  cached = await prisma.storeSetting.upsert({ where: { id: 1 }, update: {}, create: DEFAULTS });
  cachedAt = Date.now();
  return cached;
}

export async function updateSettings(data) {
  cached = await prisma.storeSetting.upsert({
    where: { id: 1 },
    update: data,
    create: { ...DEFAULTS, ...data },
  });
  cachedAt = Date.now();
  return cached;
}
