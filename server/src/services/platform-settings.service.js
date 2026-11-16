/**
 * Reads the platform settings that other code actually acts on.
 *
 * Without this the Settings page was decorative: the rows were written and never read, so
 * changing "Grace period" from 7 days to 14 changed a number in a table and nothing else.
 * A setting that does not do anything is worse than no setting, because somebody will
 * eventually rely on it.
 *
 * Cached like the plan catalogue, and for the same reason: these are read on request paths
 * (entitlement runs on every store call) and change a few times a year.
 */
import { prisma } from "../lib/prisma.js";
import { DEFAULT_GRACE_DAYS } from "./entitlement.service.js";

export const SETTING_DEFAULTS = Object.freeze({
  graceDays: DEFAULT_GRACE_DAYS,
  renewalNoticeDays: 7,
  inactiveAfterDays: 14,
  trialDays: 30,
  supportEmail: "",
  supportPhone: "",
});

const CACHE_MS = 30_000;
let cache = null;

export function invalidateSettingsCache() {
  cache = null;
}

/**
 * All settings, with defaults filled in.
 *
 * A missing table means the platform migration has not run, which is a normal state on a
 * store-only deployment: fall back to defaults rather than failing every request that needs
 * to know the grace period.
 */
export async function getPlatformSettings({ fresh = false } = {}) {
  if (!fresh && cache && cache.expires > Date.now()) return cache.value;

  let value = { ...SETTING_DEFAULTS };
  try {
    const rows = await prisma.platformSetting.findMany();
    for (const row of rows) {
      if (!(row.key in SETTING_DEFAULTS)) continue;
      const fallback = SETTING_DEFAULTS[row.key];
      // Stored as JSON, so coerce back to the shape the default implies.
      value[row.key] =
        typeof fallback === "number"
          ? Number(row.value)
          : String(row.value ?? "");
      if (typeof fallback === "number" && !Number.isFinite(value[row.key])) {
        value[row.key] = fallback;
      }
    }
  } catch (err) {
    if (!isMissing(err)) throw err;
    // Platform tables absent: defaults are correct, not an error.
  }

  cache = { value, expires: Date.now() + CACHE_MS };
  return value;
}

function isMissing(err) {
  if (!err) return false;
  if (err.code === "P2021") return true;
  if (err instanceof TypeError) return true;
  return /does not exist/i.test(err.message ?? "");
}

/** The configured grace period, for entitlement. */
export async function getGraceDays() {
  const { graceDays } = await getPlatformSettings();
  return graceDays;
}

/** Support contact details, shown to shops inside their own app. */
export async function getSupportContact() {
  const { supportEmail, supportPhone } = await getPlatformSettings();
  return { email: supportEmail || null, phone: supportPhone || null };
}
