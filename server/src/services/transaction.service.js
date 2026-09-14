import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { computeBill, fromPaise, roundQty, toPaise } from '../utils/pricing.js';

const money = (paise) => fromPaise(paise).toFixed(2);
const qty = (q) => roundQty(q).toFixed(3);

export const syncTransactionSchema = z.object({
  clientId: z.string().uuid(),
  terminalId: z.string().trim().min(1).max(40),
  cashierId: z.string().uuid().optional(),
  soldAt: z.string().datetime({ offset: true }),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD']),
  customerPhone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, 'Phone number can only contain digits, spaces, + and -')
    .nullish(),
  amountTendered: z.number().nonnegative().max(100_000_000).nullish(),
  taxRate: z.number().min(0).max(50),
  billDiscount: z
    .object({
      type: z.enum(['PERCENT', 'FLAT']),
      value: z.number().min(0).max(100_000_000),
      reason: z.string().trim().max(200).nullish(),
    })
    .default({ type: 'PERCENT', value: 0 }),
  grandTotal: z.number().nonnegative(),
  wasOffline: z.boolean().default(false),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive().max(100_000),
        unitPrice: z.number().nonnegative().max(10_000_000),
        discountPercent: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1, 'A bill needs at least one item')
    .max(500),
});

const rejected = (clientId, code, message) => ({ clientId, status: 'rejected', error: { code, message } });

function isUniqueViolation(err) {
  return err?.code === 'P2002';
}

/**
 * Persist one bill from a terminal. Safe to call repeatedly with the same clientId:
 * a retry after a dropped connection returns the already-stored invoice instead of double-counting
 * revenue or stock. Returns { status: 'created' | 'duplicate' | 'rejected' }.
 */
export async function ingestTransaction(rawInput, actor, settings) {
  const parsed = syncTransactionSchema.safeParse(rawInput);
  const clientId = typeof rawInput?.clientId === 'string' ? rawInput.clientId : null;
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return rejected(clientId, 'VALIDATION_ERROR', `${issue.path.join('.') || 'bill'}: ${issue.message}`);
  }
  const input = parsed.data;

  const existing = await prisma.transaction.findUnique({
    where: { clientId: input.clientId },
    select: { id: true, invoiceNo: true },
  });
  if (existing) return { clientId: input.clientId, status: 'duplicate', id: existing.id, invoiceNo: existing.invoiceNo };

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, code: true, name: true, unit: true, soldByWeight: true, categoryId: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !byId.has(id));
  if (missing.length) {
    return rejected(input.clientId, 'PRODUCT_NOT_FOUND', `${missing.length} item(s) on this bill are no longer in the catalog`);
  }

  for (const item of input.items) {
    const product = byId.get(item.productId);
    if (!product.soldByWeight && !Number.isInteger(item.quantity)) {
      return rejected(input.clientId, 'INVALID_QUANTITY', `${product.name} is sold per ${product.unit} and needs a whole-number quantity`);
    }
  }

  const bill = computeBill({ items: input.items, billDiscount: input.billDiscount, taxRate: input.taxRate });

  if (bill.grandTotal !== toPaise(input.grandTotal)) {
    return rejected(
      input.clientId,
      'TOTAL_MISMATCH',
      `Bill total ${input.grandTotal.toFixed(2)} does not match the recalculated total ${money(bill.grandTotal)}`,
    );
  }

  if (actor.role === 'CASHIER' && bill.billDiscountEffectivePct > Number(settings.maxCashierDiscountPct) + 0.005) {
    return rejected(
      input.clientId,
      'DISCOUNT_LIMIT',
      `Cashier discounts are limited to ${Number(settings.maxCashierDiscountPct)}% of the bill`,
    );
  }

  let changeDue = null;
  if (input.paymentMethod === 'CASH' && input.amountTendered != null) {
    const tendered = toPaise(input.amountTendered);
    if (tendered < bill.grandTotal) {
      return rejected(input.clientId, 'INSUFFICIENT_TENDER', 'Cash received is less than the bill total');
    }
    changeDue = tendered - bill.grandTotal;
  }

  // Bills queued offline may be uploaded by whoever signs in next; keep the original cashier when valid.
  let cashierId = actor.id;
  if (input.cashierId && input.cashierId !== actor.id) {
    const original = await prisma.user.findUnique({ where: { id: input.cashierId }, select: { id: true } });
    if (original) cashierId = original.id;
  }

  const now = new Date();
  const soldAt = new Date(input.soldAt);
  const safeSoldAt = soldAt > now ? now : soldAt; // never trust a terminal clock that runs ahead

  try {
    const created = await prisma.$transaction(async (db) => {
      const tx = await db.transaction.create({
        data: {
          clientId: input.clientId,
          terminalId: input.terminalId,
          cashierId,
          syncedById: actor.id,
          paymentMethod: input.paymentMethod,
          customerPhone: input.customerPhone || null,
          subtotal: money(bill.subtotal),
          itemDiscount: money(bill.itemDiscount),
          billDiscount: money(bill.billDiscount),
          discountReason: bill.billDiscount > 0 ? input.billDiscount.reason || null : null,
          taxRate: bill.taxRate.toFixed(2),
          taxableAmount: money(bill.taxableAmount),
          taxTotal: money(bill.taxTotal),
          grandTotal: money(bill.grandTotal),
          amountTendered: input.amountTendered != null ? Number(input.amountTendered).toFixed(2) : null,
          changeDue: changeDue != null ? money(changeDue) : null,
          wasOffline: input.wasOffline,
          soldAt: safeSoldAt,
          items: {
            create: bill.lines.map((line) => {
              const product = byId.get(line.productId);
              return {
                productId: product.id,
                categoryId: product.categoryId,
                productName: product.name,
                productCode: product.code,
                unit: product.unit,
                soldByWeight: product.soldByWeight,
                quantity: qty(line.quantity),
                unitPrice: Number(line.unitPrice).toFixed(2),
                discountPercent: line.discountPercent.toFixed(2),
                lineSubtotal: money(line.lineSubtotal),
                lineDiscount: money(line.lineDiscount),
                billDiscountShare: money(line.billDiscountShare),
                netAmount: money(line.netAmount),
              };
            }),
          },
        },
        select: { id: true, invoiceNo: true },
      });

      const soldQty = new Map();
      for (const line of bill.lines) soldQty.set(line.productId, roundQty((soldQty.get(line.productId) || 0) + line.quantity));

      for (const [productId, quantity] of soldQty) {
        await db.product.update({ where: { id: productId }, data: { stock: { decrement: qty(quantity) } } });
      }

      await db.stockMovement.createMany({
        data: [...soldQty].map(([productId, quantity]) => ({
          productId,
          type: 'SALE',
          quantity: qty(-quantity),
          referenceId: tx.id,
          userId: cashierId,
          reason: `Invoice #${tx.invoiceNo}`,
        })),
      });

      return tx;
    });

    return { clientId: input.clientId, status: 'created', id: created.id, invoiceNo: created.invoiceNo };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Two uploads of the same bill raced; the other one won.
      const winner = await prisma.transaction.findUnique({ where: { clientId: input.clientId }, select: { id: true, invoiceNo: true } });
      if (winner) return { clientId: input.clientId, status: 'duplicate', id: winner.id, invoiceNo: winner.invoiceNo };
    }
    throw err;
  }
}

/** Void a completed bill and return its items to stock. */
export async function voidTransaction(id, reason, actor) {
  return prisma.$transaction(async (db) => {
    const tx = await db.transaction.findUnique({ where: { id }, include: { items: true } });
    if (!tx) return { error: 'NOT_FOUND' };
    if (tx.status === 'VOIDED') return { error: 'ALREADY_VOIDED' };

    const restock = new Map();
    for (const item of tx.items) restock.set(item.productId, roundQty((restock.get(item.productId) || 0) + Number(item.quantity)));

    for (const [productId, quantity] of restock) {
      await db.product.update({ where: { id: productId }, data: { stock: { increment: qty(quantity) } } });
    }
    await db.stockMovement.createMany({
      data: [...restock].map(([productId, quantity]) => ({
        productId,
        type: 'VOID',
        quantity: qty(quantity),
        referenceId: tx.id,
        userId: actor.id,
        reason: `Void of invoice #${tx.invoiceNo}: ${reason}`,
      })),
    });

    const updated = await db.transaction.update({
      where: { id },
      data: { status: 'VOIDED', voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
    });
    return { transaction: updated };
  });
}
