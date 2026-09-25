import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorize, ROLES } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError, notFound } from '../utils/http.js';
import { roundQty } from '../utils/pricing.js';
import { serializeProduct } from '../utils/serialize.js';
import { emptyToNull, idParam, pagination } from './schemas.js';

const router = Router();

const productSchema = z
  .object({
    code: z.string().trim().min(1, 'Code is required').max(20).regex(/^[A-Za-z0-9-]+$/, 'Code can use letters, digits and -'),
    barcode: emptyToNull(z.string().trim().min(4).max(32).regex(/^[A-Za-z0-9]+$/, 'Barcode can use letters and digits')),
    name: z.string().trim().min(1, 'Name is required').max(120),
    description: emptyToNull(z.string().trim().max(500)),
    categoryId: z.string().uuid('Choose a category'),
    price: z.coerce.number().min(0).max(10_000_000),
    unit: z.string().trim().min(1).max(12).default('pcs'),
    soldByWeight: z.coerce.boolean().default(false),
    lowStockThreshold: z.coerce.number().min(0).max(1_000_000).default(5),
    discountPercent: z.coerce.number().min(0).max(100).default(0),
    isQuickKey: z.coerce.boolean().default(false),
    imageUrl: emptyToNull(z.string().trim().url('Image must be a full https:// URL').max(500)),
    isActive: z.coerce.boolean().default(true),
  });

const createSchema = productSchema.extend({
  stock: z.coerce.number().min(0).max(1_000_000).default(0),
});

const listQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).default(''),
  categoryId: emptyToNull(z.string().uuid()),
  stock: z.enum(['all', 'low', 'out']).default('all'),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  sort: z.enum(['name', 'stock', 'price', 'updated']).default('name'),
});

const stockSchema = z.object({
  mode: z.enum(['ADD', 'REMOVE', 'SET']),
  quantity: z.coerce.number().min(0).max(1_000_000),
  reason: z.string().trim().min(2, 'Add a short reason').max(200),
});

const SORTS = {
  name: { name: 'asc' },
  stock: { stock: 'asc' },
  price: { price: 'desc' },
  updated: { updatedAt: 'desc' },
};

async function assertLeafCategory(organizationId, categoryId) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    include: { _count: { select: { children: true } } },
  });
  if (!category) throw new HttpError(400, 'Category not found');
  if (category._count.children) throw new HttpError(400, `"${category.name}" has sub-categories. Choose one of them.`);
}

/** Compact catalog for POS terminals (cached in IndexedDB for offline selling). */
router.get(
  '/catalog',
  authorize(ROLES.ADMIN, ROLES.CASHIER),
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      where: { organizationId: req.user.organizationId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, code: true, barcode: true, name: true, categoryId: true, price: true, unit: true,
        soldByWeight: true, stock: true, lowStockThreshold: true, discountPercent: true, isQuickKey: true, imageUrl: true,
      },
    });
    res.json({ products: products.map(serializeProduct), generatedAt: new Date().toISOString() });
  }),
);

router.get(
  '/',
  authorize(ROLES.ADMIN),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, categoryId, stock, status, sort } = req.query;
    const where = {
      organizationId: req.user.organizationId,
      ...(status === 'all' ? {} : { isActive: status === 'active' }),
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { equals: q, mode: 'insensitive' } }, { barcode: q }] }
        : {}),
      ...(stock === 'out' ? { stock: { lte: 0 } } : {}),
      ...(stock === 'low' ? { stock: { gt: 0, lte: prisma.product.fields.lowStockThreshold } } : {}),
    };
    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: [SORTS[sort], { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { name: true } } },
      }),
    ]);
    res.json({ page, pageSize, total, products: products.map(serializeProduct) });
  }),
);

router.post(
  '/',
  authorize(ROLES.ADMIN),
  requireActiveSubscription,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const organizationId = req.user.organizationId;
    await assertLeafCategory(organizationId, req.body.categoryId);
    const { stock, ...data } = req.body;
    const product = await prisma.$transaction(async (db) => {
      const created = await db.product.create({ data: { ...data, organizationId, stock: roundQty(stock).toFixed(3) } });
      if (stock > 0) {
        await db.stockMovement.create({
          data: {
            organizationId,
            productId: created.id,
            type: 'RESTOCK',
            quantity: roundQty(stock).toFixed(3),
            reason: 'Opening stock',
            userId: req.user.id,
          },
        });
      }
      return db.product.findUnique({ where: { id: created.id }, include: { category: { select: { name: true } } } });
    });
    res.status(201).json({ product: serializeProduct(product) });
  }),
);

router.put(
  '/:id',
  authorize(ROLES.ADMIN),
  requireActiveSubscription,
  validate({ params: idParam, body: productSchema }),
  asyncHandler(async (req, res) => {
    const exists = await prisma.product.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
      select: { id: true },
    });
    if (!exists) throw notFound('Product');
    await assertLeafCategory(req.user.organizationId, req.body.categoryId);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body,
      include: { category: { select: { name: true } } },
    });
    res.json({ product: serializeProduct(product) });
  }),
);

/** Stock ledger adjustment. Row-locked so a concurrent sale cannot be overwritten by a "set". */
router.patch(
  '/:id/stock',
  authorize(ROLES.ADMIN),
  requireActiveSubscription,
  validate({ params: idParam, body: stockSchema }),
  asyncHandler(async (req, res) => {
    const { mode, quantity, reason } = req.body;
    const product = await prisma.$transaction(async (db) => {
      const [locked] = await db.$queryRaw`
        SELECT stock::float8 AS stock FROM products
        WHERE id = ${req.params.id}::text AND organization_id = ${req.user.organizationId}::text
        FOR UPDATE`;
      if (!locked) throw notFound('Product');
      const current = roundQty(locked.stock);
      const next = mode === 'SET' ? roundQty(quantity) : mode === 'ADD' ? roundQty(current + quantity) : roundQty(current - quantity);
      const change = roundQty(next - current);
      if (change === 0) throw new HttpError(400, 'Stock is already at that level');

      await db.product.update({ where: { id: req.params.id }, data: { stock: next.toFixed(3) } });
      await db.stockMovement.create({
        data: {
          organizationId: req.user.organizationId,
          productId: req.params.id,
          type: mode === 'ADD' ? 'RESTOCK' : 'ADJUSTMENT',
          quantity: change.toFixed(3),
          reason,
          userId: req.user.id,
        },
      });
      return db.product.findUnique({ where: { id: req.params.id }, include: { category: { select: { name: true } } } });
    });
    res.json({ product: serializeProduct(product) });
  }),
);

router.get(
  '/:id/movements',
  authorize(ROLES.ADMIN),
  validate({ params: idParam, query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) }),
  asyncHandler(async (req, res) => {
    const movements = await prisma.stockMovement.findMany({
      where: { productId: req.params.id, organizationId: req.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: req.query.limit,
    });
    res.json({
      movements: movements.map((m) => ({ ...m, quantity: Number(m.quantity) })),
    });
  }),
);

/** Products on past bills are never hard-deleted; deactivating hides them from terminals. */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN),
  requireActiveSubscription,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const target = await prisma.product.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
      select: { id: true },
    });
    if (!target) throw notFound('Product');
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false, isQuickKey: false },
      include: { category: { select: { name: true } } },
    });
    res.json({ product: serializeProduct(product) });
  }),
);

export default router;
