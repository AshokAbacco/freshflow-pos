/**
 * /api/v1/platform/search
 *
 * One box that finds a store by name, a person by name, email or phone however it was typed,
 * or a payment by its Razorpay reference. A support call starts with whatever the caller has
 * to hand -- usually a phone number or an order id off an email -- so the search has to accept
 * all three without the operator choosing a category first.
 */
import { Router } from "express";
import { z } from "zod";
import {
  authenticatePlatform,
  rejectStoreToken,
  PLATFORM_ROLES,
} from "../../middleware/platform-auth.js";
import { validate } from "../../middleware/validate.js";
import { universalSearch } from "../../services/store-directory.service.js";

const router = Router();
router.use(rejectStoreToken, authenticatePlatform);

router.get(
  "/",
  validate({
    query: z.object({
      q: z.string().trim().min(2, "Type at least two characters").max(120),
      limit: z.coerce.number().int().min(1).max(10).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const results = await universalSearch(req.query.q, {
        limit: req.query.limit,
      });

      // Payment references are money. A support login can find the store and the person, but
      // the payment rail stays with the roles that are accountable for it.
      if (req.platformAdmin.role === PLATFORM_ROLES.SUPPORT) {
        results.payments = [];
      }

      return res.json({
        query: req.query.q,
        ...results,
        total:
          results.stores.length +
          results.users.length +
          results.payments.length,
      });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
