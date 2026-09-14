import { Router } from 'express';
import { z } from 'zod';
import { authorize, ROLES } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { asyncHandler } from '../utils/http.js';
import { serializeSettings } from '../utils/serialize.js';
import { emptyToNull } from './schemas.js';

const router = Router();

const settingsSchema = z.object({
  storeName: z.string().trim().min(1, 'Store name is required').max(80),
  tagline: emptyToNull(z.string().trim().max(120)),
  gstin: emptyToNull(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5'),
  ),
  address: emptyToNull(z.string().trim().max(250)),
  phone: emptyToNull(z.string().trim().max(20).regex(/^[+\d\s-]+$/, 'Phone can only contain digits, spaces, + and -')),
  upiVpa: emptyToNull(
    z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, 'UPI ID looks like name@bank'),
  ),
  upiPayeeName: emptyToNull(z.string().trim().max(60)),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
  taxRate: z.coerce.number().min(0).max(50),
  maxCashierDiscountPct: z.coerce.number().min(0).max(100),
  receiptFooter: emptyToNull(z.string().trim().max(200)),
});

router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.CASHIER),
  asyncHandler(async (_req, res) => {
    res.json({ settings: serializeSettings(await getSettings()) });
  }),
);

router.put(
  '/',
  authorize(ROLES.ADMIN),
  validate({ body: settingsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ settings: serializeSettings(await updateSettings(req.body)) });
  }),
);

export default router;
