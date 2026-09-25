import { subscriptionActive } from '../services/billing.service.js';
import { HttpError } from '../utils/http.js';

/**
 * Blocks work that adds data once a trial or paid period has lapsed, while leaving
 * sign-in, billing and read-only screens reachable so the store can pay and carry on.
 * Bills already queued on a till are never rejected for this reason — they describe
 * sales that already happened.
 */
export function requireActiveSubscription(req, _res, next) {
  if (subscriptionActive(req.subscription)) return next();
  const isAdmin = req.user?.role === 'ADMIN';
  return next(
    new HttpError(
      402,
      isAdmin
        ? 'Your subscription has ended. Choose a plan in Billing to carry on.'
        : 'This store’s subscription has ended. Ask the store admin to renew it.',
      'SUBSCRIPTION_REQUIRED',
    ),
  );
}
