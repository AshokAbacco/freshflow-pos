import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorize, invalidateUserCache, ROLES } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { publicUser } from '../utils/serialize.js';
import { idParam } from './schemas.js';

const router = Router();
router.use(authorize(ROLES.ADMIN));

const password = z.string().min(8, 'Password needs at least 8 characters').max(128);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password,
  role: z.enum(['CASHIER', 'ADMIN']).default('CASHIER'),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(['CASHIER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: [{ role: 'desc' }, { name: 'asc' }] });
    res.json({ users: users.map(publicUser) });
  }),
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const { password: plain, ...data } = req.body;
    const user = await prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(plain, 12) } });
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const { password: plain, ...data } = req.body;
    if (req.params.id === req.user.id && (data.isActive === false || data.role === 'CASHIER')) {
      throw new HttpError(400, 'You cannot deactivate or demote your own account');
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...data, ...(plain ? { passwordHash: await bcrypt.hash(plain, 12) } : {}) },
    });
    invalidateUserCache(user.id);
    res.json({ user: publicUser(user) });
  }),
);

export default router;
