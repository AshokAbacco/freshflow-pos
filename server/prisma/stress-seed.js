/**
 * LOAD-TEST DATA GENERATOR — not for production databases.
 * Creates N extra sub-categories (default 1,200) each with one product, then rings up bills over the
 * last 60 days through the real ingest service, so reports/charts can be verified at 1K+ categories.
 *
 *   STRESS_CATEGORIES=1200 STRESS_BILLS=4000 npm run db:seed:stress
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { ingestTransaction } from '../src/services/transaction.service.js';
import { getSettings } from '../src/services/settings.service.js';
import { computeBill, fromPaise } from '../src/utils/pricing.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to generate load-test data with NODE_ENV=production');
  process.exit(1);
}

const CATEGORY_COUNT = Number(process.env.STRESS_CATEGORIES || 1200);
const BILL_COUNT = Number(process.env.STRESS_BILLS || 4000);
const DAYS = 60;

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
  if (!admin) throw new Error('Run `npm run db:seed` first');
  const settings = await getSettings({ fresh: true });

  const dept = await prisma.category.upsert({
    where: { slug: 'load-test-lines' },
    update: {},
    create: { slug: 'load-test-lines', name: 'Load-test lines', icon: '🧪', sortOrder: 99 },
  });

  const existing = await prisma.category.count({ where: { parentId: dept.id } });
  for (let i = existing; i < CATEGORY_COUNT; i += 1) {
    const n = String(i + 1).padStart(4, '0');
    const cat = await prisma.category.create({ data: { slug: `load-test-${n}`, name: `Line ${n}`, parentId: dept.id, sortOrder: i } });
    await prisma.product.create({
      data: {
        code: `LT${n}`,
        name: `Load-test item ${n}`,
        categoryId: cat.id,
        price: (10 + Math.floor(rand() * 490)).toFixed(2),
        unit: 'pcs',
        stock: '100000.000',
      },
    });
  }
  console.log(`Categories ready: ${CATEGORY_COUNT}`);

  const products = await prisma.product.findMany({ where: { isActive: true }, select: { id: true, price: true, soldByWeight: true, discountPercent: true } });
  // Skewed popularity so the Pareto view looks like a real store.
  const weighted = products.flatMap((p, idx) => Array(Math.max(1, Math.round(40 / (1 + idx / 25)))).fill(p));

  for (let b = 0; b < BILL_COUNT; b += 1) {
    const lines = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => {
      const p = pick(weighted);
      return {
        productId: p.id,
        quantity: p.soldByWeight ? Math.round((0.25 + rand() * 2) * 1000) / 1000 : 1 + Math.floor(rand() * 3),
        unitPrice: Number(p.price),
        discountPercent: Number(p.discountPercent),
      };
    });
    const soldAt = new Date(Date.now() - rand() * DAYS * 86_400_000);
    const billDiscount = { type: 'PERCENT', value: rand() < 0.1 ? 5 : 0 };
    const bill = computeBill({ items: lines, billDiscount, taxRate: Number(settings.taxRate) });
    const result = await ingestTransaction(
      {
        clientId: crypto.randomUUID(),
        terminalId: 'LOADTEST',
        soldAt: soldAt.toISOString(),
        paymentMethod: pick(['UPI', 'UPI', 'CASH', 'CARD']),
        taxRate: Number(settings.taxRate),
        billDiscount,
        grandTotal: fromPaise(bill.grandTotal),
        items: lines,
      },
      admin,
      settings,
    );
    if (result.status === 'rejected') throw new Error(result.error.message);
    if ((b + 1) % 500 === 0) console.log(`Bills: ${b + 1}/${BILL_COUNT}`);
  }
  console.log('Load-test data ready');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
