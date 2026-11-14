/**
 * Phone handling for search and for phone sign-in.
 *
 * Indian mobile numbers reach us written every way a person can type one: "+91 98765 43210",
 * "09876543210", "98765-43210". All of those are the same subscriber, so everything matches on
 * the last ten digits. The matching index in the database is built on the same expression
 * (see migration 20261113010000_platform_admin), so this function and that index must stay
 * in step -- if you change one, change the other.
 */

/** Every digit, nothing else. */
export function digitsOf(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * The comparable form: the last ten digits, or null when there aren't ten.
 * Returning null rather than a short string matters -- a 4-digit extension must never
 * match a mobile number by prefix.
 */
export function phoneKey(value) {
  const digits = digitsOf(value);
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** True when two written numbers are the same subscriber. */
export function samePhone(a, b) {
  const ka = phoneKey(a);
  return ka !== null && ka === phoneKey(b);
}

/**
 * Display form for Indian mobiles: "98765 43210", with the country code kept when given.
 * Anything that isn't a ten-digit mobile is handed back as written, since guessing the
 * grouping of a landline or a foreign number does more harm than good.
 */
export function formatPhone(value) {
  const digits = digitsOf(value);
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  // 11 digits starting with 0 is ambiguous: "0" + a mobile, or an STD landline such as
  // 080 2667 1420. Both reduce to ten digits and neither can be told from the other by
  // digits alone, so it is left exactly as the store typed it rather than guessed at.
  return String(value ?? "");
}

/**
 * Is this usable as a sign-in identifier? Indian mobiles start 6-9 after the country code,
 * so a ten-digit number beginning 0-5 is a typo or a landline, not a login.
 */
export function isMobileNumber(value) {
  const key = phoneKey(value);
  return key !== null && /^[6-9]/.test(key);
}

/**
 * Does the written value look like a phone number rather than an email or a store name?
 * Used to decide which column a universal-search term should be matched against.
 */
export function looksLikePhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("@")) return false;
  if (!/^[\d\s+()-]+$/.test(raw)) return false;
  return digitsOf(raw).length >= 4;
}
