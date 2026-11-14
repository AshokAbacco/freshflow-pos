/**
 * Barcode handling, kept free of React and of the DOM so it can be tested directly.
 *
 * Two things here earn their keep at a real counter:
 *
 *   1. Check-digit validation. A scanner that half-reads a label hands over a plausible-looking
 *      number. Validating the check digit catches most of those before they become a failed
 *      product lookup and a confused cashier.
 *
 *   2. UPC-A / EAN-13 equivalence. The same tin of food is labelled with a 12-digit UPC-A in
 *      some supply chains and a 13-digit EAN-13 in others, and they differ only by a leading
 *      zero. A catalogue holding one form must still match a scan of the other, or staff end
 *      up creating duplicate products.
 */

/** Scanners may be configured to wrap their output; strip the common wrappers and all control bytes. */
export function normalizeBarcode(raw, { prefix = "", suffix = "" } = {}) {
  let value = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length);
  if (suffix && value.endsWith(suffix)) value = value.slice(0, -suffix.length);
  return value.trim();
}

const digitsOnly = (value) => /^\d+$/.test(value);

/**
 * GS1 mod-10 check digit, used by EAN-8, EAN-13, UPC-A and ITF-14.
 * Weights alternate 3 and 1 from the rightmost digit before the check digit.
 */
export function gs1CheckDigit(digitsWithoutCheck) {
  const digits = String(digitsWithoutCheck);
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const digit = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Does this code's own check digit agree with its body? */
export function hasValidCheckDigit(code) {
  const value = String(code ?? "");
  if (!digitsOnly(value) || ![8, 12, 13, 14].includes(value.length))
    return false;
  return (
    gs1CheckDigit(value.slice(0, -1)) ===
    value.charCodeAt(value.length - 1) - 48
  );
}

/** UPC-A (12) is EAN-13 (13) with a leading zero. */
export const upcAToEan13 = (code) =>
  digitsOnly(String(code)) && String(code).length === 12 ? `0${code}` : null;

export const ean13ToUpcA = (code) => {
  const value = String(code ?? "");
  return digitsOnly(value) && value.length === 13 && value.startsWith("0")
    ? value.slice(1)
    : null;
};

/**
 * Expands a UPC-E (8) to its UPC-A (12) form. Compressed UPC-E is common on small packaging
 * -- cigarettes, sweets, single-serve drinks -- where a full barcode will not fit.
 */
export function upcEToUpcA(code) {
  const value = String(code ?? "");
  // The leading digit is the number system, which UPC-E allows to be 0 or 1.
  if (!digitsOnly(value) || value.length !== 8 || !"01".includes(value[0]))
    return null;
  const numberSystem = value[0];
  const body = value.slice(1, 7);
  const check = value[7];
  const d = body.split("");
  const last = d[5];
  let middle;
  if (last === "0" || last === "1" || last === "2") {
    middle = `${d[0]}${d[1]}${last}0000${d[2]}${d[3]}${d[4]}`;
  } else if (last === "3") {
    middle = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  } else if (last === "4") {
    middle = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  } else {
    middle = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${last}`;
  }
  return `${numberSystem}${middle}${check}`;
}

export const SYMBOLOGIES = Object.freeze({
  EAN_13: "EAN-13",
  EAN_8: "EAN-8",
  UPC_A: "UPC-A",
  UPC_E: "UPC-E",
  ITF_14: "ITF-14",
  CODE_128: "Code 128",
  INTERNAL: "Internal code",
  UNKNOWN: "Unknown",
});

/**
 * Best guess at what was scanned. Used only to label things in the setup screen and to decide
 * whether a check digit is worth testing -- never to decide whether to accept a scan, because
 * a store's own shelf labels are frequently none of these.
 */
export function detectSymbology(code) {
  const value = String(code ?? "");
  if (!value) return SYMBOLOGIES.UNKNOWN;
  if (!digitsOnly(value)) return SYMBOLOGIES.CODE_128;
  switch (value.length) {
    case 8:
      return hasValidCheckDigit(value) ? SYMBOLOGIES.EAN_8 : SYMBOLOGIES.UPC_E;
    case 12:
      return SYMBOLOGIES.UPC_A;
    case 13:
      // 20-29 is the GS1 range reserved for in-store use, which is what shop-printed
      // weighed-item labels use.
      return /^2[0-9]/.test(value) ? SYMBOLOGIES.INTERNAL : SYMBOLOGIES.EAN_13;
    case 14:
      return SYMBOLOGIES.ITF_14;
    default:
      return SYMBOLOGIES.CODE_128;
  }
}

/**
 * Every form of this code worth trying against the catalogue, most likely first.
 *
 * The caller looks each candidate up in turn, so a product stored as UPC-A is still found when
 * the scanner reports EAN-13, and vice versa.
 */
export function lookupCandidates(raw, options) {
  const code = normalizeBarcode(raw, options);
  if (!code) return [];
  const seen = new Set([code]);
  const out = [code];
  const add = (value) => {
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  };
  add(upcAToEan13(code));
  add(ean13ToUpcA(code));
  const fromUpcE = upcEToUpcA(code);
  add(fromUpcE);
  if (fromUpcE) add(upcAToEan13(fromUpcE));
  // Some scanners pad to 14 for ITF; the EAN-13 inside is what the catalogue holds.
  if (code.length === 14 && code.startsWith("0")) add(code.slice(1));
  return out;
}

/**
 * GS1-128 weighed-item labels (prefix 20-29) carry a price or weight in the body, so the whole
 * number differs between two packets of the same thing. The part that identifies the product is
 * the item reference, so that is what gets matched.
 *
 * Layouts vary by scale vendor, so this returns the item reference and leaves the embedded
 * value alone unless the store has told us the layout.
 */
export function parseInStoreLabel(code) {
  const value = String(code ?? "");
  if (!digitsOnly(value) || value.length !== 13 || !/^2[0-9]/.test(value))
    return null;
  return {
    prefix: value.slice(0, 2),
    itemReference: value.slice(2, 7),
    embedded: value.slice(7, 12),
    checkDigit: value[12],
  };
}

/**
 * Is this plausibly a scan rather than a stray keystroke?
 *
 * Length alone is the only safe test: a store's internal codes can be short, alphanumeric, or
 * both, so anything stricter rejects real products.
 */
export function looksScannable(code, { minLength = 4 } = {}) {
  const value = normalizeBarcode(code);
  return value.length >= minLength && !/\s/.test(value);
}
