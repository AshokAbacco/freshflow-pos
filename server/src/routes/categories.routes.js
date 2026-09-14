import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorize, ROLES } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError, notFound } from '../utils/http.js';
import { serializeCategory } from '../utils/serialize.js';
import { emptyToNull, idParam } from './schemas.js';

const router = Router();

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60) || 'category';

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  icon: emptyToNull(z.string().trim().max(8)),
  parentId: emptyToNull(z.string().uuid()),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

async function assertValidParent(parentId, selfId) {
  if (!parentId) return;
  if (parentId === selfId) throw new HttpError(400, 'A category cannot be its own parent');
  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
  if (!parent) throw new HttpError(400, 'Parent category not found');
  if (parent.parentId) throw new HttpError(400, 'Sub-categories can only be one level deep');
  if (selfId) {
    const children = await prisma.category.count({ where: { parentId: selfId } });
    if (children) throw new HttpError(400, 'A category with sub-categories cannot itself become a sub-category');
  }
}

async function uniqueSlug(name, parentId, excludeId) {
  let prefix = '';
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { slug: true } });
    prefix = parent ? `${parent.slug}-` : '';
  }
  const base = `${prefix}${slugify(name)}`;
  for (let n = 1; n < 1000; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.category.findFirst({ where: { slug, NOT: excludeId ? { id: excludeId } : undefined }, select: { id: true } });
    if (!taken) return slug;
  }
  throw new HttpError(409, 'Could not generate a unique category slug');
}

router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.CASHIER),
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    res.json({ categories: categories.map(serializeCategory) });
  }),
);

router.post(
  '/',
  authorize(ROLES.ADMIN),
  validate({ body: categorySchema }),
  asyncHandler(async (req, res) => {
    await assertValidParent(req.body.parentId);
    const category = await prisma.category.create({
      data: { ...req.body, slug: await uniqueSlug(req.body.name, req.body.parentId) },
    });
    res.status(201).json({ category: serializeCategory(category) });
  }),
);

router.put(
  '/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParam, body: categorySchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Category');
    await assertValidParent(req.body.parentId, req.params.id);
    const slugChanged = existing.name !== req.body.name || existing.parentId !== (req.body.parentId ?? null);
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { ...req.body, ...(slugChanged ? { slug: await uniqueSlug(req.body.name, req.body.parentId, req.params.id) } : {}) },
    });
    res.json({ category: serializeCategory(category) });
  }),
);

router.delete(
  '/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { products: true, children: true, soldItems: true } } },
    });
    if (!category) throw notFound('Category');
    const { products, children, soldItems } = category._count;
    if (children) throw new HttpError(409, `Move or delete its ${children} sub-categories first`, 'IN_USE');
    if (products) throw new HttpError(409, `Move its ${products} products to another category first`, 'IN_USE');
    if (soldItems) throw new HttpError(409, 'This category appears on past bills and is kept for reporting', 'IN_USE');
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

export default router;
