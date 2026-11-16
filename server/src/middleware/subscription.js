import {
  STATES,
  evaluateEntitlement,
} from "../services/entitlement.service.js";
import { getGraceDays } from "../services/platform-settings.service.js";
import { HttpError } from "../utils/http.js";

/**
 * Blocks work that adds data once a trial or paid period has lapsed, while leaving sign-in,
 * billing and read-only screens reachable so the store can pay and carry on. Bills already
 * queued on a till are never rejected for this reason -- they describe sales that already
 * happened.
 *
 * This now asks `evaluateEntitlement`, the same function the platform panel uses, instead of
 * its own shorter rule. Two things were wrong with having two rules:
 *
 *   1. The grace period did nothing for the shop. The panel reported a lapsed store as "in
 *      grace, can still sell for 7 days" while this middleware blocked it the moment the
 *      period ended. The shopkeeper saw "your subscription has ended" on a day support had
 *      been told they were still trading.
 *
 *   2. A suspension recorded only as `suspendedAt`, without the status column being moved,
 *      would not have stopped anything here. Entitlement treats either as suspended.
 *
 * The grace window comes from platform settings, so changing it in the panel changes what
 * tills actually do.
 */

const MESSAGES = {
  [STATES.SUSPENDED]: {
    admin:
      "This store has been suspended. Contact FreshFlow support to resolve it.",
    staff:
      "This store has been suspended. Ask the store owner to contact FreshFlow support.",
  },
  [STATES.CANCELLED]: {
    admin:
      "Your subscription was cancelled. Choose a plan in Billing to start again.",
    staff:
      "This store’s subscription was cancelled. Ask the store admin to renew it.",
  },
  [STATES.EXPIRED]: {
    admin: "Your subscription has ended. Choose a plan in Billing to carry on.",
    staff:
      "This store’s subscription has ended. Ask the store admin to renew it.",
  },
};

export async function requireActiveSubscription(req, _res, next) {
  try {
    const graceDays = await getGraceDays();
    const entitlement = evaluateEntitlement(
      req.organization,
      req.subscription,
      new Date(),
      {
        graceDays,
      },
    );

    if (entitlement.canWrite) {
      // Handed on so a route can warn without blocking, e.g. "3 days left in your grace period".
      req.entitlement = entitlement;
      return next();
    }

    const isAdmin = req.user?.role === "ADMIN";
    const copy = MESSAGES[entitlement.state] ?? MESSAGES[STATES.EXPIRED];

    return next(
      new HttpError(
        402,
        isAdmin ? copy.admin : copy.staff,
        entitlement.state === STATES.SUSPENDED
          ? "STORE_SUSPENDED"
          : "SUBSCRIPTION_REQUIRED",
        { state: entitlement.state },
      ),
    );
  } catch (err) {
    return next(err);
  }
}
