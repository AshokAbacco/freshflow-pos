import assert from "node:assert/strict";
import test from "node:test";
import {
  digitsOf,
  formatPhone,
  isMobileNumber,
  looksLikePhone,
  phoneKey,
  samePhone,
} from "../src/utils/phone.js";

test("the three ways people write one mobile all reduce to the same key", () => {
  const key = "9876543210";
  for (const written of [
    "+91 98765 43210",
    "09876543210",
    "9876543210",
    "+919876543210",
    "98765-43210",
    "(+91) 98765 43210",
  ]) {
    assert.equal(phoneKey(written), key, `${written} should match ${key}`);
  }
});

test("a different number does not match", () => {
  assert.equal(samePhone("+91 98765 43210", "98765 43299"), false);
});

test("short numbers return null rather than matching by prefix", () => {
  // A 4-digit extension must never be treated as "the start of" a mobile.
  assert.equal(phoneKey("4321"), null);
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey(null), null);
  assert.equal(phoneKey(undefined), null);
  assert.equal(samePhone("4321", "9876544321"), false);
});

test("a longer international number is compared on its last ten digits", () => {
  assert.equal(phoneKey("+91-098765-43210"), "9876543210");
  assert.equal(samePhone("0091 98765 43210", "9876543210"), true);
});

test("digitsOf strips everything that is not a digit", () => {
  assert.equal(digitsOf("+91 (98765) 43-210"), "919876543210");
  assert.equal(digitsOf(null), "");
});

test("only 6-9 openers count as a sign-in mobile", () => {
  assert.equal(isMobileNumber("9876543210"), true);
  assert.equal(isMobileNumber("6012345678"), true);
  assert.equal(isMobileNumber("5012345678"), false, "landline/invalid opener");
  assert.equal(isMobileNumber("0123456789"), false);
  assert.equal(isMobileNumber("12345"), false);
});

test("a search term is routed to phone matching only when it looks like one", () => {
  assert.equal(looksLikePhone("98765 43210"), true);
  assert.equal(looksLikePhone("+91-9876543210"), true);
  assert.equal(looksLikePhone("priya@store.com"), false);
  assert.equal(looksLikePhone("Sri Lakshmi"), false);
  assert.equal(looksLikePhone(""), false);
  assert.equal(
    looksLikePhone("12"),
    false,
    "two digits is not worth a phone lookup",
  );
});

test("display formatting groups Indian mobiles and leaves anything else alone", () => {
  assert.equal(formatPhone("9876543210"), "98765 43210");
  assert.equal(formatPhone("919876543210"), "+91 98765 43210");
  assert.equal(
    formatPhone("09876543210"),
    "09876543210",
    "11 digits from 0 is ambiguous, so it is left alone",
  );
  assert.equal(
    formatPhone("080 2667 1420"),
    "080 2667 1420",
    "landline kept as written",
  );
  assert.equal(formatPhone(null), "");
});

/*
 * Shared-number sign-in (platform setting PHONE). Several staff at one counter sometimes
 * share the shop's mobile, so the number alone cannot identify the account: the password
 * decides. If one password matches exactly one of them, sign that person in; if it matches
 * more than one, refuse and ask for email, because picking one would be a coin toss.
 */
function resolveSharedNumberLogin(candidates, password, verify) {
  const matches = candidates.filter((user) =>
    verify(password, user.passwordHash),
  );
  if (matches.length === 1) return { ok: true, user: matches[0] };
  if (matches.length === 0) return { ok: false, code: "BAD_CREDENTIALS" };
  return { ok: false, code: "AMBIGUOUS_USE_EMAIL" };
}

const verify = (plain, hash) => hash === `hashed:${plain}`;

test("one account on a shared number signs in when its password matches", () => {
  const users = [
    { id: "u1", passwordHash: "hashed:priya-pw" },
    { id: "u2", passwordHash: "hashed:ravi-pw" },
  ];
  const result = resolveSharedNumberLogin(users, "ravi-pw", verify);
  assert.equal(result.ok, true);
  assert.equal(result.user.id, "u2");
});

test("no match on a shared number is a plain credential failure", () => {
  const users = [
    { id: "u1", passwordHash: "hashed:a" },
    { id: "u2", passwordHash: "hashed:b" },
  ];
  assert.equal(
    resolveSharedNumberLogin(users, "c", verify).code,
    "BAD_CREDENTIALS",
  );
});

test("two accounts with the same password must be sent to email sign-in", () => {
  const users = [
    { id: "u1", passwordHash: "hashed:same" },
    { id: "u2", passwordHash: "hashed:same" },
  ];
  const result = resolveSharedNumberLogin(users, "same", verify);
  assert.equal(result.ok, false);
  assert.equal(
    result.code,
    "AMBIGUOUS_USE_EMAIL",
    "never guess which of two people is signing in",
  );
});
