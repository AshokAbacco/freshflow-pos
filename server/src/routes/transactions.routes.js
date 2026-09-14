import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorize, ROLES } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { periodBounds } from '../services/report.service.js';
import { getSettings } from '../services/settings.service.js';
import { ingestTransaction, voidTransaction } from '../services/transaction.service.js';
import { asyncHandler, HttpError, notFound } from '../utils/http.js';
import { serializeTransaction } from '../utils/serialize.js';
import { dateRangeQuery, emptyToNull, idParam, pagination } from './schemas.js';

const router = Router();

/**
 * Upload bills from a terminal's outbox. Every bill (online or queued offline) goes through here.
 * Bills are validated individually so one bad bill doesn't block the rest of the queue.
 */
router.post(
  '/sync',
  authorize(ROLES.CASHIER, ROLES.ADMIN),
  validate({ body: z.object({ transactions: z.array(z.unknown()).min(1).max(50) }) }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const results = [];
    for (const tx of req.body.transactions) {
      results.push(await ingestTransaction(tx, req.user, settings));
    }
    res.json({ results });
  }),
);

const ledgerQuery = z
  .object({
    ...pagination,
    from: z.string(),
    to: z.string(),
    method: z.enum(['ALL', 'CASH', 'UPI', 'CARD']).default('ALL'),
    status: z.enum(['ALL', 'COMPLETED', 'VOIDED']).default('ALL'),
    q: z.string().trim().max(40).default(''),
  })
  .superRefine((v, ctx) => {
    const r = dateRangeQuery.safeParse({ from: v.from, to: v.to });
    if (!r.success) r.error.issues.forEach((i) => ctx.addIssue(i));
  });

router.get(
  '/',
  authorize(ROLES.ADMIN),
  validate({ query: ledgerQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, from, to, method, status, q } = req.query;
    const { start, end } = await periodBounds(from, to);
    const invoiceNo = /^\d{1,9}$/.test(q.replace(/^#|^INV-?/i, '')) ? Number(q.replace(/^#|^INV-?/i, '')) : null;

    const where = {
      soldAt: { gte: start, lt: end },
      ...(method !== 'ALL' ? { paymentMethod: method } : {}),
      ...(status !== 'ALL' ? { status } : {}),
      ...(q ? { OR: [...(invoiceNo ? [{ invoiceNo }] : []), { customerPhone: { contains: q } }] } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { soldAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { cashier: { select: { id: true, name: true } }, _count: { select: { items: true } } },
      }),
    ]);
    res.json({ page, pageSize, total, transactions: rows.map(serializeTransaction) });
  }),
);

router.get(
  '/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const tx = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: { items: { orderBy: { productName: 'asc' } }, cashier: { select: { id: true, name: true } } },
    });
    if (!tx) throw notFound('Transaction');
    res.json({ transaction: serializeTransaction(tx) });
  }),
);

router.post(
  '/:id/void',
  authorize(ROLES.ADMIN),
  validate({ params: idParam, body: z.object({ reason: emptyToNull(z.string().trim().min(3).max(200)) }) }),
  asyncHandler(async (req, res) => {
    if (!req.body.reason) throw new HttpError(400, 'Add a reason for voiding this bill');
    const result = await voidTransaction(req.params.id, req.body.reason, req.user);
    if (result.error === 'NOT_FOUND') throw notFound('Transaction');
    if (result.error === 'ALREADY_VOIDED') throw new HttpError(409, 'This bill is already voided');
    res.json({ transaction: serializeTransaction(result.transaction) });
  }),
);

export default router;
