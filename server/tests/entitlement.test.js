import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GRACE_DAYS,
  STATES,
  checkUsageFitsLimits,
  evaluateEntitlement,
  isInactive,
  statusForState,
} from "../src/utils/../services/entitlement.service.js";

const NOW = new Date("2026-06-15T10:00:00.000Z");
const days = (n) => new Date(+NOW + n * 86_400_000);

const sub = (over = {}) => ({
  status: "ACTIVE",
  plan: "STANDARD",
  seats: 3,
  currentPeriodEnd: days(10),
  trialEndsAt: null,
  graceEndsAt: null,
  suspendedAt: null,
  suspendedReason: null,
  cancelledAt: null,
  ...over,
});

test("a paid period that has not ended is active and may write", () => {
  const e = evaluateEntitlement({}, sub(), NOW);
  assert.equal(e.state, STATES.ACTIVE);
  assert.equal(e.canWrite, true);
  assert.equal(e.daysLeft, 10);
  assert.equal(e.reason, null);
});

test("a running trial may write and reports days left", () => {
  const e = evaluateEntitlement(
    {},
    sub({ status: "TRIALING", currentPeriodEnd: null, trialEndsAt: days(4) }),
    NOW,
  );
  assert.equal(e.state, STATES.TRIAL);
  assert.equal(e.canWrite, true);
  assert.equal(e.daysLeft, 4);
});

test("a failed payment inside a paid period is past due but still selling", () => {
  const e = evaluateEntitlement(
    {},
    sub({ status: "PAST_DUE", currentPeriodEnd: days(5) }),
    NOW,
  );
  assert.equal(e.state, STATES.PAST_DUE);
  assert.equal(
    e.canWrite,
    true,
    "paid time remains, so the till must keep working",
  );
  assert.match(e.reason, /payment attempt failed/i);
});

test("just past the period end falls into grace, not expiry", () => {
  const e = evaluateEntitlement({}, sub({ currentPeriodEnd: days(-1) }), NOW);
  assert.equal(e.state, STATES.GRACE_PERIOD);
  assert.equal(e.canWrite, true);
  assert.equal(e.daysLeft, DEFAULT_GRACE_DAYS - 1);
});

test("past the grace window writes stop but reads do not", () => {
  const e = evaluateEntitlement(
    {},
    sub({ currentPeriodEnd: days(-(DEFAULT_GRACE_DAYS + 1)) }),
    NOW,
  );
  assert.equal(e.state, STATES.EXPIRED);
  assert.equal(e.canWrite, false);
  assert.equal(
    e.canRead,
    true,
    "an expired store must still reach its data and the renewal page",
  );
});

test("an explicit graceEndsAt overrides the platform default", () => {
  const e = evaluateEntitlement(
    {},
    sub({ currentPeriodEnd: days(-30), graceEndsAt: days(3) }),
    NOW,
  );
  assert.equal(e.state, STATES.GRACE_PERIOD);
  assert.equal(e.daysLeft, 3);
});

test("a shorter platform grace setting is honoured", () => {
  const e = evaluateEntitlement({}, sub({ currentPeriodEnd: days(-3) }), NOW, {
    graceDays: 2,
  });
  assert.equal(e.state, STATES.EXPIRED);
});

// The rule that matters most: paying must not undo moderation.
test("suspension outranks a paid, in-date subscription", () => {
  const e = evaluateEntitlement(
    {},
    sub({
      status: "ACTIVE",
      currentPeriodEnd: days(300),
      suspendedAt: days(-1),
    }),
    NOW,
  );
  assert.equal(e.state, STATES.SUSPENDED);
  assert.equal(e.canWrite, false);
});

test("suspension outranks a running trial and carries its reason", () => {
  const e = evaluateEntitlement(
    {},
    sub({
      status: "SUSPENDED",
      trialEndsAt: days(20),
      suspendedReason: "chargeback fraud",
    }),
    NOW,
  );
  assert.equal(e.state, STATES.SUSPENDED);
  assert.match(e.reason, /chargeback fraud/);
});

test("cancellation stops writes even with period time left", () => {
  const e = evaluateEntitlement(
    {},
    sub({ status: "CANCELLED", currentPeriodEnd: days(45) }),
    NOW,
  );
  assert.equal(e.state, STATES.CANCELLED);
  assert.equal(e.canWrite, false);
});

test("a store with no subscription row is expired, not an error", () => {
  const e = evaluateEntitlement({}, null, NOW);
  assert.equal(e.state, STATES.EXPIRED);
  assert.equal(e.canWrite, false);
  assert.equal(e.canRead, true);
});

test("an elapsed trial with no payment goes to grace then expiry", () => {
  const inGrace = evaluateEntitlement(
    {},
    sub({ status: "TRIALING", currentPeriodEnd: null, trialEndsAt: days(-2) }),
    NOW,
  );
  assert.equal(inGrace.state, STATES.GRACE_PERIOD);

  const expired = evaluateEntitlement(
    {},
    sub({ status: "TRIALING", currentPeriodEnd: null, trialEndsAt: days(-40) }),
    NOW,
  );
  assert.equal(expired.state, STATES.EXPIRED);
});

test("plan limits and features are surfaced through the injected resolver", () => {
  const e = evaluateEntitlement({}, sub(), NOW, {
    resolvePlan: () => ({
      plan: "STANDARD",
      limits: { maxOutlets: 1 },
      features: { multiOutlet: false },
    }),
  });
  assert.equal(e.limits.maxOutlets, 1);
  assert.equal(e.features.multiOutlet, false);
});

test("every state maps back to a storable status", () => {
  for (const state of Object.values(STATES)) {
    assert.ok(
      typeof statusForState(state) === "string" &&
        statusForState(state).length > 0,
    );
  }
  assert.equal(statusForState(STATES.TRIAL), "TRIALING");
  assert.equal(
    statusForState("NONSENSE"),
    "EXPIRED",
    "an unknown state must fail closed",
  );
});

test("change-plan refuses a plan the store has already outgrown", () => {
  const usage = { outlets: 3, counters: 4, users: 9 };
  const tooSmall = checkUsageFitsLimits(usage, {
    outlets: 1,
    counters: 2,
    users: 5,
  });
  assert.equal(tooSmall.ok, false);
  assert.deepEqual(tooSmall.violations.map((v) => v.key).sort(), [
    "counters",
    "outlets",
    "users",
  ]);

  const roomy = checkUsageFitsLimits(usage, {
    outlets: 5,
    counters: 10,
    users: 25,
  });
  assert.equal(roomy.ok, true);
});

test("a null or missing limit means unlimited", () => {
  assert.equal(
    checkUsageFitsLimits({ bills: 999_999 }, { bills: null }).ok,
    true,
  );
  assert.equal(checkUsageFitsLimits({ bills: 999_999 }, {}).ok, true);
});

test("exactly at the limit still fits", () => {
  assert.equal(checkUsageFitsLimits({ users: 5 }, { users: 5 }).ok, true);
  assert.equal(checkUsageFitsLimits({ users: 6 }, { users: 5 }).ok, false);
});

test("a store that has never been seen counts as inactive", () => {
  assert.equal(isInactive({ lastActiveAt: null }, NOW), true);
  assert.equal(isInactive({ lastActiveAt: days(-20) }, NOW), true);
  assert.equal(isInactive({ lastActiveAt: days(-2) }, NOW), false);
});
