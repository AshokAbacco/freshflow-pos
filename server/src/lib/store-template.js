/**
 * The starter store every new organization gets: category tree, product catalog, default
 * settings and the trial subscription. Used by the signup flow (provisionOrganization) and by
 * the seed script, so there is one source of truth for "what a fresh store looks like".
 *
 * Every function takes `db`, which can be the PrismaClient or a transaction client (`tx`), so
 * signup can create the organization, its admin and its catalog all-or-nothing.
 */
import { randomUUID } from "node:crypto";

export const TRIAL_DAYS = 30;
export const TRIAL_SEATS = 3;

const img = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=80`;

export const CATEGORY_TREE = [
  {
    slug: "fresh-produce",
    name: "Fresh Produce",
    icon: "🥦",
    sortOrder: 1,
    children: [
      {
        slug: "fresh-produce-fruits",
        name: "Fruits",
        icon: "🍎",
        sortOrder: 1,
      },
      {
        slug: "fresh-produce-leafy-greens",
        name: "Leafy Greens & Herbs",
        icon: "🥬",
        sortOrder: 2,
      },
      {
        slug: "fresh-produce-vegetables",
        name: "Vegetables",
        icon: "🥕",
        sortOrder: 3,
      },
    ],
  },
  { slug: "dairy-bakery", name: "Dairy & Bakery", icon: "🥛", sortOrder: 2 },
  {
    slug: "grains-staples",
    name: "Grains & Staples",
    icon: "🌾",
    sortOrder: 3,
  },
  { slug: "snacks-drinks", name: "Snacks & Drinks", icon: "🥨", sortOrder: 4 },
  {
    slug: "stationery-supplies",
    name: "Stationery & Supplies",
    icon: "✏️",
    sortOrder: 5,
  },
];

/*
 * `stock` is the demo opening stock. New signups get every product at 0 stock by default
 * (see applyStoreTemplate's `openingStock` option) so their inventory and reports start clean.
 */
export const PRODUCTS = [
  {
    code: "101",
    name: "Crisp Washington Apples",
    category: "fresh-produce-fruits",
    barcode: "890123450001",
    price: 160,
    unit: "kg",
    soldByWeight: true,
    stock: 42.5,
    discount: 0,
    quickKey: true,
    image: "photo-1560806887-1e4cd0b6cbd6",
  },
  {
    code: "102",
    name: "Organic Cavendish Bananas",
    category: "fresh-produce-fruits",
    barcode: "890123450002",
    price: 48,
    unit: "kg",
    soldByWeight: true,
    stock: 28,
    discount: 20,
    quickKey: true,
    image: "photo-1571771894821-ce9b6c11b08e",
  },
  {
    code: "103",
    name: "Farm Fresh Roma Tomatoes",
    category: "fresh-produce-vegetables",
    barcode: "890123450003",
    price: 35,
    unit: "kg",
    soldByWeight: true,
    stock: 65,
    discount: 0,
    quickKey: true,
    image: "photo-1592924357228-91a4daadcfea",
  },
  {
    code: "104",
    name: "Hass Avocados (Pack of 2)",
    category: "fresh-produce-fruits",
    barcode: "890123450004",
    price: 190,
    unit: "pack",
    soldByWeight: false,
    stock: 15,
    discount: 0,
    quickKey: false,
    image: "photo-1523049673857-eb18f1d7b578",
  },
  {
    code: "105",
    name: "Nagpur Sweet Oranges",
    category: "fresh-produce-fruits",
    barcode: "890123450013",
    price: 80,
    unit: "kg",
    soldByWeight: true,
    stock: 35,
    discount: 0,
    quickKey: false,
    image: "photo-1582979512210-99b6a53386f9",
  },
  {
    code: "106",
    name: "Ruby Red Pomegranate",
    category: "fresh-produce-fruits",
    barcode: "890123450014",
    price: 175,
    unit: "kg",
    soldByWeight: true,
    stock: 22,
    discount: 0,
    quickKey: false,
    image: "photo-1541344999736-83eca872f240",
  },
  {
    code: "107",
    name: "Fresh Hydroponic Spinach (Palak)",
    category: "fresh-produce-leafy-greens",
    barcode: "890123450015",
    price: 30,
    unit: "bunch",
    soldByWeight: false,
    stock: 40,
    discount: 0,
    quickKey: true,
    image: "photo-1576045057995-568f588f82fb",
  },
  {
    code: "108",
    name: "Organic Coriander Leaves (Dhaniya)",
    category: "fresh-produce-leafy-greens",
    barcode: "890123450016",
    price: 20,
    unit: "bunch",
    soldByWeight: false,
    stock: 50,
    discount: 0,
    quickKey: true,
    image: "photo-1588879462719-75702ee61586",
  },
  {
    code: "109",
    name: "Aromatic Fresh Mint (Pudina)",
    category: "fresh-produce-leafy-greens",
    barcode: "890123450017",
    price: 15,
    unit: "bunch",
    soldByWeight: false,
    stock: 35,
    discount: 0,
    quickKey: false,
    image: "photo-1628556270448-4d4e4148e1b1",
  },
  {
    code: "110",
    name: "Fresh Fenugreek Leaves (Methi)",
    category: "fresh-produce-leafy-greens",
    barcode: "890123450018",
    price: 25,
    unit: "bunch",
    soldByWeight: false,
    stock: 30,
    discount: 0,
    quickKey: false,
    image: "photo-1540420773420-3366772f4999",
  },
  {
    code: "111",
    name: "Nashik Red Onions",
    category: "fresh-produce-vegetables",
    barcode: "890123450019",
    price: 38,
    unit: "kg",
    soldByWeight: true,
    stock: 80,
    discount: 0,
    quickKey: true,
    image: "photo-1618512496248-a07fe83aa8cb",
  },
  {
    code: "112",
    name: "Farm Fresh Jyoti Potatoes",
    category: "fresh-produce-vegetables",
    barcode: "890123450020",
    price: 30,
    unit: "kg",
    soldByWeight: true,
    stock: 95,
    discount: 0,
    quickKey: false,
    image: "photo-1518977676601-b53f82aba655",
  },
  {
    code: "113",
    name: "Crisp English Cucumbers",
    category: "fresh-produce-vegetables",
    barcode: "890123450021",
    price: 42,
    unit: "kg",
    soldByWeight: true,
    stock: 30,
    discount: 0,
    quickKey: false,
    image: "photo-1604977042946-1eecc30f269e",
  },
  {
    code: "114",
    name: "Fresh Crunchy Carrots",
    category: "fresh-produce-vegetables",
    barcode: "890123450022",
    price: 48,
    unit: "kg",
    soldByWeight: true,
    stock: 45,
    discount: 0,
    quickKey: false,
    image: "photo-1598170845058-32b9d6a5da37",
  },
  {
    code: "201",
    name: "Farm Pasteurized Whole Milk (1L)",
    category: "dairy-bakery",
    barcode: "890123450005",
    price: 68,
    unit: "pouch",
    soldByWeight: false,
    stock: 50,
    discount: 0,
    quickKey: true,
    image: "photo-1563636619-e9143da7973b",
  },
  {
    code: "202",
    name: "Whole Wheat Sliced Bread (400g)",
    category: "dairy-bakery",
    barcode: "890123450006",
    price: 45,
    unit: "pack",
    soldByWeight: false,
    stock: 24,
    discount: 20,
    quickKey: false,
    image: "photo-1509440159596-0249088772ff",
  },
  {
    code: "301",
    name: "Royal Basmati Rice (5kg)",
    category: "grains-staples",
    barcode: "890123450007",
    price: 540,
    unit: "bag",
    soldByWeight: false,
    stock: 30,
    discount: 0,
    quickKey: true,
    image: "photo-1586201375761-83865001e31c",
  },
  {
    code: "302",
    name: "Organic Yellow Toor Dal (1kg)",
    category: "grains-staples",
    barcode: "890123450008",
    price: 165,
    unit: "pack",
    soldByWeight: false,
    stock: 40,
    discount: 0,
    quickKey: false,
    image: "photo-1546069901-ba9599a7e63c",
  },
  {
    code: "401",
    name: "Classic Potato Chips (150g)",
    category: "snacks-drinks",
    barcode: "890123450009",
    price: 50,
    unit: "pack",
    soldByWeight: false,
    stock: 60,
    discount: 0,
    quickKey: false,
    image: "photo-1566478989037-eec170784d0b",
  },
  {
    code: "601",
    name: "Hardbound Spiral Notebook (180 pgs)",
    category: "stationery-supplies",
    barcode: "890123450010",
    price: 85,
    unit: "pcs",
    soldByWeight: false,
    stock: 35,
    discount: 0,
    quickKey: true,
    image: "photo-1544716278-ca5e3f4abd8c",
  },
  {
    code: "602",
    name: "Quick-Dry Gel Pens (Pack of 5)",
    category: "stationery-supplies",
    barcode: "890123450011",
    price: 120,
    unit: "pack",
    soldByWeight: false,
    stock: 50,
    discount: 0,
    quickKey: false,
    image: "photo-1585336261026-8f5786372966",
  },
  {
    code: "603",
    name: "Pastel Sticky Notes (400 Sheets)",
    category: "stationery-supplies",
    barcode: "890123450012",
    price: 65,
    unit: "pcs",
    soldByWeight: false,
    stock: 45,
    discount: 0,
    quickKey: false,
    image: "photo-1586075010923-2dd4570fb338",
  },
];

/** Neutral store settings for a new business. Never copies another store's GSTIN, UPI or address. */
export function defaultStoreSettings({
  storeName,
  phone = null,
  address = null,
}) {
  return {
    storeName,
    tagline: null,
    gstin: null,
    address,
    phone,
    upiVpa: null,
    upiPayeeName: storeName,
    taxRate: "5.00",
    maxCashierDiscountPct: "10.00",
    receiptFooter: "Returns accepted within 7 days with this bill.",
  };
}

export function trialSubscription() {
  const ends = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  return {
    plan: "TRIAL",
    interval: "MONTHLY",
    seats: TRIAL_SEATS,
    status: "TRIALING",
    pricePerUser: "0.00",
    trialEndsAt: ends,
    currentPeriodEnd: ends,
  };
}

/**
 * Copies the starter categories and products into one organization.
 *
 * Idempotent: categories whose slug already exists, and products whose code or barcode already
 * exists in that organization, are skipped. So it is safe to re-run, and safe to run for older
 * organizations to backfill the catalog.
 *
 * @param db              PrismaClient or transaction client
 * @param organizationId  the store to fill
 * @param userId          recorded on the opening-stock movements
 * @param openingStock    false (default) = every product starts at 0 stock;
 *                        true = use the demo stock levels and log a RESTOCK movement for each
 */
export async function applyStoreTemplate(
  db,
  { organizationId, userId = null, openingStock = false },
) {
  const existingCategories = await db.category.findMany({
    where: { organizationId },
    select: { id: true, slug: true },
  });
  const categoryIds = Object.fromEntries(
    existingCategories.map((c) => [c.slug, c.id]),
  );

  // IDs are generated here so children can point at parents without a round trip per row.
  const parents = [];
  const children = [];
  for (const { children: kids = [], ...top } of CATEGORY_TREE) {
    if (!categoryIds[top.slug]) {
      categoryIds[top.slug] = randomUUID();
      parents.push({ ...top, id: categoryIds[top.slug], organizationId });
    }
    for (const child of kids) {
      if (categoryIds[child.slug]) continue;
      categoryIds[child.slug] = randomUUID();
      children.push({
        ...child,
        id: categoryIds[child.slug],
        organizationId,
        parentId: categoryIds[top.slug],
      });
    }
  }
  if (parents.length) await db.category.createMany({ data: parents });
  if (children.length) await db.category.createMany({ data: children });

  const existingProducts = await db.product.findMany({
    where: { organizationId },
    select: { code: true, barcode: true },
  });
  const takenCodes = new Set(existingProducts.map((p) => p.code));
  const takenBarcodes = new Set(
    existingProducts.map((p) => p.barcode).filter(Boolean),
  );

  const products = [];
  const movements = [];
  for (const p of PRODUCTS) {
    if (takenCodes.has(p.code) || takenBarcodes.has(p.barcode)) continue;
    const id = randomUUID();
    const stock = openingStock ? p.stock : 0;
    products.push({
      id,
      organizationId,
      code: p.code,
      name: p.name,
      barcode: p.barcode,
      unit: p.unit,
      soldByWeight: p.soldByWeight,
      isQuickKey: p.quickKey,
      categoryId: categoryIds[p.category],
      price: p.price.toFixed(2),
      stock: stock.toFixed(3),
      lowStockThreshold: p.soldByWeight ? "10.000" : "8.000",
      discountPercent: p.discount.toFixed(2),
      imageUrl: img(p.image),
    });
    if (stock > 0) {
      movements.push({
        organizationId,
        productId: id,
        type: "RESTOCK",
        quantity: stock.toFixed(3),
        reason: "Opening stock",
        userId,
      });
    }
  }
  if (products.length) await db.product.createMany({ data: products });
  if (movements.length) await db.stockMovement.createMany({ data: movements });

  return {
    categoriesCreated: parents.length + children.length,
    productsCreated: products.length,
    productsInTemplate: PRODUCTS.length,
  };
}

/**
 * Everything a brand-new signup needs, in one call. Run it inside a transaction so a failure
 * part-way leaves no half-built store behind:
 *
 *   const passwordHash = await bcrypt.hash(password, 12);   // hash BEFORE opening the transaction
 *   const { organization, admin } = await prisma.$transaction(
 *     (tx) => provisionOrganization(tx, { storeName, slug, adminName, adminEmail, passwordHash }),
 *     { timeout: 15_000 },
 *   );
 */
export async function provisionOrganization(
  db,
  {
    storeName,
    slug,
    adminName,
    adminEmail,
    passwordHash,
    phone = null,
    address = null,
    openingStock = false,
  },
) {
  const organization = await db.organization.create({
    data: {
      name: storeName,
      slug,
      subscription: { create: trialSubscription() },
      settings: { create: defaultStoreSettings({ storeName, phone, address }) },
    },
    include: { subscription: true },
  });

  const admin = await db.user.create({
    data: {
      organizationId: organization.id,
      name: adminName,
      email: adminEmail.trim().toLowerCase(),
      role: "ADMIN",
      passwordHash,
    },
  });

  const catalog = await applyStoreTemplate(db, {
    organizationId: organization.id,
    userId: admin.id,
    openingStock,
  });

  return { organization, admin, catalog };
}
