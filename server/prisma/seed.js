
/**
 * Seeds the production baseline: store profile, the two role accounts, the category tree and
 * the product catalog from the store blueprint. Safe to re-run (upserts; never touches sales).
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const { Pool } = pg;

/**
 * Render PostgreSQL requires SSL/TLS connections.
 *
 * We use a pg Pool here so the same SSL configuration is explicitly applied
 * to the PrismaPg adapter used by the seed script.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'production'
    ? ['error']
    : ['warn', 'error'],
});

const img = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=80`;

const CATEGORY_TREE = [
  {
    slug: 'fresh-produce',
    name: 'Fresh Produce',
    icon: '🥦',
    sortOrder: 1,
    children: [
      {
        slug: 'fresh-produce-fruits',
        name: 'Fruits',
        icon: '🍎',
        sortOrder: 1,
      },
      {
        slug: 'fresh-produce-leafy-greens',
        name: 'Leafy Greens & Herbs',
        icon: '🥬',
        sortOrder: 2,
      },
      {
        slug: 'fresh-produce-vegetables',
        name: 'Vegetables',
        icon: '🥕',
        sortOrder: 3,
      },
    ],
  },
  {
    slug: 'dairy-bakery',
    name: 'Dairy & Bakery',
    icon: '🥛',
    sortOrder: 2,
  },
  {
    slug: 'grains-staples',
    name: 'Grains & Staples',
    icon: '🌾',
    sortOrder: 3,
  },
  {
    slug: 'snacks-drinks',
    name: 'Snacks & Drinks',
    icon: '🥨',
    sortOrder: 4,
  },
  {
    slug: 'stationery-supplies',
    name: 'Stationery & Supplies',
    icon: '✏️',
    sortOrder: 5,
  },
];

// [code, name, categorySlug, barcode, price, unit, soldByWeight, stock, discount%, quickKey, image]
const PRODUCTS = [
  [
    '101',
    'Crisp Washington Apples',
    'fresh-produce-fruits',
    '890123450001',
    160,
    'kg',
    true,
    42.5,
    0,
    true,
    'photo-1560806887-1e4cd0b6cbd6',
  ],
  [
    '102',
    'Organic Cavendish Bananas',
    'fresh-produce-fruits',
    '890123450002',
    48,
    'kg',
    true,
    28,
    20,
    true,
    'photo-1571771894821-ce9b6c11b08e',
  ],
  [
    '103',
    'Farm Fresh Roma Tomatoes',
    'fresh-produce-vegetables',
    '890123450003',
    35,
    'kg',
    true,
    65,
    0,
    true,
    'photo-1592924357228-91a4daadcfea',
  ],
  [
    '104',
    'Hass Avocados (Pack of 2)',
    'fresh-produce-fruits',
    '890123450004',
    190,
    'pack',
    false,
    15,
    0,
    false,
    'photo-1523049673857-eb18f1d7b578',
  ],
  [
    '105',
    'Nagpur Sweet Oranges',
    'fresh-produce-fruits',
    '890123450013',
    80,
    'kg',
    true,
    35,
    0,
    false,
    'photo-1582979512210-99b6a53386f9',
  ],
  [
    '106',
    'Ruby Red Pomegranate',
    'fresh-produce-fruits',
    '890123450014',
    175,
    'kg',
    true,
    22,
    0,
    false,
    'photo-1541344999736-83eca872f240',
  ],
  [
    '107',
    'Fresh Hydroponic Spinach (Palak)',
    'fresh-produce-leafy-greens',
    '890123450015',
    30,
    'bunch',
    false,
    40,
    0,
    true,
    'photo-1576045057995-568f588f82fb',
  ],
  [
    '108',
    'Organic Coriander Leaves (Dhaniya)',
    'fresh-produce-leafy-greens',
    '890123450016',
    20,
    'bunch',
    false,
    50,
    0,
    true,
    'photo-1588879462719-75702ee61586',
  ],
  [
    '109',
    'Aromatic Fresh Mint (Pudina)',
    'fresh-produce-leafy-greens',
    '890123450017',
    15,
    'bunch',
    false,
    35,
    0,
    false,
    'photo-1628556270448-4d4e4148e1b1',
  ],
  [
    '110',
    'Fresh Fenugreek Leaves (Methi)',
    'fresh-produce-leafy-greens',
    '890123450018',
    25,
    'bunch',
    false,
    30,
    0,
    false,
    'photo-1540420773420-3366772f4999',
  ],
  [
    '111',
    'Nashik Red Onions',
    'fresh-produce-vegetables',
    '890123450019',
    38,
    'kg',
    true,
    80,
    0,
    true,
    'photo-1618512496248-a07fe83aa8cb',
  ],
  [
    '112',
    'Farm Fresh Jyoti Potatoes',
    'fresh-produce-vegetables',
    '890123450020',
    30,
    'kg',
    true,
    95,
    0,
    false,
    'photo-1518977676601-b53f82aba655',
  ],
  [
    '113',
    'Crisp English Cucumbers',
    'fresh-produce-vegetables',
    '890123450021',
    42,
    'kg',
    true,
    30,
    0,
    false,
    'photo-1604977042946-1eecc30f269e',
  ],
  [
    '114',
    'Fresh Crunchy Carrots',
    'fresh-produce-vegetables',
    '890123450022',
    48,
    'kg',
    true,
    45,
    0,
    false,
    'photo-1598170845058-32b9d6a5da37',
  ],
  [
    '201',
    'Farm Pasteurized Whole Milk (1L)',
    'dairy-bakery',
    '890123450005',
    68,
    'pouch',
    false,
    50,
    0,
    true,
    'photo-1563636619-e9143da7973b',
  ],
  [
    '202',
    'Whole Wheat Sliced Bread (400g)',
    'dairy-bakery',
    '890123450006',
    45,
    'pack',
    false,
    24,
    20,
    false,
    'photo-1509440159596-0249088772ff',
  ],
  [
    '301',
    'Royal Basmati Rice (5kg)',
    'grains-staples',
    '890123450007',
    540,
    'bag',
    false,
    30,
    0,
    true,
    'photo-1586201375761-83865001e31c',
  ],
  [
    '302',
    'Organic Yellow Toor Dal (1kg)',
    'grains-staples',
    '890123450008',
    165,
    'pack',
    false,
    40,
    0,
    false,
    'photo-1546069901-ba9599a7e63c',
  ],
  [
    '401',
    'Classic Potato Chips (150g)',
    'snacks-drinks',
    '890123450009',
    50,
    'pack',
    false,
    60,
    0,
    false,
    'photo-1566478989037-eec170784d0b',
  ],
  [
    '601',
    'Hardbound Spiral Notebook (180 pgs)',
    'stationery-supplies',
    '890123450010',
    85,
    'pcs',
    false,
    35,
    0,
    true,
    'photo-1544716278-ca5e3f4abd8c',
  ],
  [
    '602',
    'Quick-Dry Gel Pens (Pack of 5)',
    'stationery-supplies',
    '890123450011',
    120,
    'pack',
    false,
    50,
    0,
    false,
    'photo-1585336261026-8f5786372966',
  ],
  [
    '603',
    'Pastel Sticky Notes (400 Sheets)',
    'stationery-supplies',
    '890123450012',
    65,
    'pcs',
    false,
    45,
    0,
    false,
    'photo-1586075010923-2dd4570fb338',
  ],
];

async function upsertUser(name, email, password, role) {
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return {
      user: existing,
      created: false,
    };
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      role,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  return {
    user,
    created: true,
  };
}

async function main() {
  const env = process.env;

  await prisma.storeSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: 'FreshFlow Supermarket',
      tagline: 'Fresh quality, daily low prices',
      gstin: '29AAAAA0000A1Z5',
      address: '123 Retail Hub, MG Road, Bengaluru 560001',
      phone: '+91 98765 43210',
      upiVpa: env.SEED_UPI_VPA || null,
      upiPayeeName: 'FreshFlow Supermarket',
      taxRate: 5,
      maxCashierDiscountPct: 10,
      receiptFooter: 'Returns accepted within 7 days with this bill.',
    },
  });

  const admin = await upsertUser(
    env.SEED_ADMIN_NAME || 'Store Admin',
    env.SEED_ADMIN_EMAIL || 'admin@freshflow.local',
    env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    'ADMIN',
  );

  const cashier = await upsertUser(
    env.SEED_CASHIER_NAME || 'Front Desk Cashier',
    env.SEED_CASHIER_EMAIL || 'cashier@freshflow.local',
    env.SEED_CASHIER_PASSWORD || 'Cashier@12345',
    'CASHIER',
  );

  const categoryIds = {};

  for (const top of CATEGORY_TREE) {
    const { children = [], ...data } = top;

    const parent = await prisma.category.upsert({
      where: { slug: data.slug },
      update: {},
      create: data,
    });

    categoryIds[data.slug] = parent.id;

    for (const child of children) {
      const c = await prisma.category.upsert({
        where: { slug: child.slug },
        update: {},
        create: {
          ...child,
          parentId: parent.id,
        },
      });

      categoryIds[child.slug] = c.id;
    }
  }

  let createdProducts = 0;

  for (const [
    code,
    name,
    slug,
    barcode,
    price,
    unit,
    soldByWeight,
    stock,
    discountPercent,
    isQuickKey,
    image,
  ] of PRODUCTS) {
    const exists = await prisma.product.findUnique({
      where: { code },
      select: { id: true },
    });

    if (exists) {
      continue;
    }

    await prisma.product.create({
      data: {
        code,
        name,
        barcode,
        unit,
        soldByWeight,
        isQuickKey,
        categoryId: categoryIds[slug],
        price: price.toFixed(2),
        stock: stock.toFixed(3),
        lowStockThreshold: soldByWeight ? '10.000' : '8.000',
        discountPercent: discountPercent.toFixed(2),
        imageUrl: img(image),

        stockMovements: {
          create: {
            type: 'RESTOCK',
            quantity: stock.toFixed(3),
            reason: 'Opening stock',
            userId: admin.user.id,
          },
        },
      },
    });

    createdProducts += 1;
  }

  console.log('Seed complete');
  console.log(
    `  Admin   ${admin.user.email}${
      admin.created
        ? `  (password: ${env.SEED_ADMIN_PASSWORD || 'Admin@12345'})`
        : '  (already existed)'
    }`,
  );

  console.log(
    `  Cashier ${cashier.user.email}${
      cashier.created
        ? `  (password: ${env.SEED_CASHIER_PASSWORD || 'Cashier@12345'})`
        : '  (already existed)'
    }`,
  );

  console.log(
    `  Products created: ${createdProducts} of ${PRODUCTS.length}`,
  );

  if (admin.created || cashier.created) {
    console.log('  Change these passwords after first sign-in.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

