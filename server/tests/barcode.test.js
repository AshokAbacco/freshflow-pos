/*
 * Tests for client/src/lib/barcode.js.
 *
 * The file lives in the client but is plain JavaScript with no DOM or React in it, and the
 * client has no test runner of its own, so it is exercised here with `node --test` alongside
 * the rest of the unit suite. Real retail barcodes are used throughout.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  SYMBOLOGIES,
  detectSymbology,
  ean13ToUpcA,
  gs1CheckDigit,
  hasValidCheckDigit,
  lookupCandidates,
  looksScannable,
  normalizeBarcode,
  parseInStoreLabel,
  upcAToEan13,
  upcEToUpcA,
} from "../../client/src/lib/barcode.js";

test("control characters and whitespace from the scanner are stripped", () => {
  assert.equal(normalizeBarcode("\u00028901234567890\r\n"), "8901234567890");
  assert.equal(normalizeBarcode("  8901234567890  "), "8901234567890");
  assert.equal(normalizeBarcode(null), "");
});

test("a configured prefix and suffix are removed", () => {
  assert.equal(
    normalizeBarcode("SCAN:8901234567890#", { prefix: "SCAN:", suffix: "#" }),
    "8901234567890",
  );
  // Only removed when actually present, so an unconfigured scanner is unaffected.
  assert.equal(
    normalizeBarcode("8901234567890", { prefix: "SCAN:", suffix: "#" }),
    "8901234567890",
  );
});

test("the GS1 check digit is computed correctly", () => {
  // Published examples: Maggi noodles (India) and a Nestle bar.
  assert.equal(gs1CheckDigit("890123456789"), 0);
  assert.equal(gs1CheckDigit("400638133393"), 1);
});

test("valid codes pass and a single transposed digit fails", () => {
  assert.equal(hasValidCheckDigit("8901234567890"), true);
  assert.equal(hasValidCheckDigit("4006381333931"), true);
  assert.equal(
    hasValidCheckDigit("8901234567891"),
    false,
    "wrong check digit must be caught",
  );
  assert.equal(
    hasValidCheckDigit("890123456789"),
    false,
    "UPC-A length with an EAN body",
  );
});

test("codes of the wrong shape are rejected rather than guessed at", () => {
  assert.equal(hasValidCheckDigit("ABC123"), false);
  assert.equal(hasValidCheckDigit("123"), false);
  assert.equal(hasValidCheckDigit(""), false);
  assert.equal(hasValidCheckDigit(null), false);
});

test("UPC-A and EAN-13 convert both ways", () => {
  assert.equal(upcAToEan13("036000291452"), "0036000291452");
  assert.equal(ean13ToUpcA("0036000291452"), "036000291452");
  // A 13-digit code that does not start with zero is not a UPC-A.
  assert.equal(ean13ToUpcA("8901234567890"), null);
  assert.equal(upcAToEan13("8901234567890"), null);
});

test("UPC-E expands to its UPC-A form", () => {
  // Last body digit 0-2: it moves up to become the third digit, then four zeros.
  assert.equal(upcEToUpcA("04210000"), "042000001000");
  // Last body digit 5-9: the digit itself is the final product digit.
  assert.equal(upcEToUpcA("01234565"), "012345000065");
  // Number system 1 is also valid UPC-E.
  assert.equal(upcEToUpcA("11234565"), "112345000065");
  // Number system is only ever 0 or 1, so anything else is not UPC-E.
  assert.equal(upcEToUpcA("22345678"), null);
  assert.equal(upcEToUpcA("1234567"), null, "wrong length");
  assert.equal(upcEToUpcA("0123456A"), null, "not all digits");
});

test("symbologies are labelled by length and content", () => {
  assert.equal(detectSymbology("8901234567890"), SYMBOLOGIES.EAN_13);
  assert.equal(detectSymbology("036000291452"), SYMBOLOGIES.UPC_A);
  assert.equal(detectSymbology("96385074"), SYMBOLOGIES.EAN_8);
  assert.equal(detectSymbology("10890123456789"), SYMBOLOGIES.ITF_14);
  assert.equal(detectSymbology("SHOP-APPLE-1KG"), SYMBOLOGIES.CODE_128);
  assert.equal(detectSymbology(""), SYMBOLOGIES.UNKNOWN);
});

test("the GS1 in-store range is recognised as a shop-printed label", () => {
  // 20-29 is reserved for in-store use: this is what a weighing scale prints.
  assert.equal(detectSymbology("2012345678903"), SYMBOLOGIES.INTERNAL);
  const parsed = parseInStoreLabel("2012345678903");
  assert.equal(parsed.prefix, "20");
  assert.equal(parsed.itemReference, "12345");
  assert.equal(parsed.embedded, "67890");
  assert.equal(
    parseInStoreLabel("8901234567890"),
    null,
    "a normal EAN-13 is not an in-store label",
  );
});

// The case that causes duplicate products in a real catalogue.
test("a scan offers every equivalent form, so UPC and EAN entries both match", () => {
  const fromUpc = lookupCandidates("036000291452");
  assert.equal(fromUpc[0], "036000291452", "what was scanned is tried first");
  assert.ok(
    fromUpc.includes("0036000291452"),
    "the EAN-13 form must also be tried",
  );

  const fromEan = lookupCandidates("0036000291452");
  assert.ok(
    fromEan.includes("036000291452"),
    "the UPC-A form must also be tried",
  );
});

test("candidates are unique and a plain code yields just itself", () => {
  const list = lookupCandidates("8901234567890");
  assert.deepEqual(list, ["8901234567890"]);
  assert.equal(
    new Set(lookupCandidates("036000291452")).size,
    lookupCandidates("036000291452").length,
  );
});

test("an empty scan produces no candidates", () => {
  assert.deepEqual(lookupCandidates(""), []);
  assert.deepEqual(lookupCandidates("   "), []);
});

test("a 14-digit ITF also offers the EAN-13 inside it", () => {
  assert.ok(lookupCandidates("08901234567890").includes("8901234567890"));
});

test("scannability is judged on length only, so store codes still work", () => {
  assert.equal(looksScannable("8901234567890"), true);
  assert.equal(
    looksScannable("APL1"),
    true,
    "a short alphanumeric store code is valid",
  );
  assert.equal(looksScannable("ABC"), false, "under the minimum length");
  assert.equal(looksScannable("has space"), false);
  assert.equal(looksScannable("AB", { minLength: 2 }), true);
});
