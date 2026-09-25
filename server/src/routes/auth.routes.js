import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { publicUser } from '../utils/serialize.js';

const router = Router();

// Compared against when the email is unknown, so response time doesn't reveal which accounts exist.
const TIMING_HASH = bcrypt.hashSync('freshflow-timing-guard', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Wait 15 minutes and try again.' } },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(200),
});

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? TIMING_HASH);

    if (!user || !passwordOk) throw new HttpError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
    if (!user.isActive) throw new HttpError(403, 'This account has been deactivated. Contact your store admin.', 'ACCOUNT_DISABLED');

    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, slug: true },
    });
    res.json({ token: signToken(user), user: publicUser(user), organization });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new HttpError(401, 'Sign in to continue', 'UNAUTHENTICATED');
    res.json({
      user: publicUser(user),
      organization: req.organization
        ? { id: req.organization.id, name: req.organization.name, slug: req.organization.slug }
        : null,
    });
  }),
);

export default router;
