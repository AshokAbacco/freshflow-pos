/**
 * Gives existing stores the starter catalog (8 categories, 22 products at zero stock).
 *
 * Use it for stores that signed up before the catalog was added to sign-up, which is why their
 * item list is empty.
 *
 *   node prisma/backfill-catalog.js            → only stores that have NO products at all
 *   node prisma/backfill-catalog.js --all      → every store; adds only the items it is missing
 *   node prisma/backfill-catalog.js --dry-run  → list what would change, write nothing
 *
 * Safe to re-run: existing categories, product codes and barcodes are always skipped, and
 * nothing that already exists is changed.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { reportDbError } from "./db-errors.js";
import { applyStoreTemplate } from "../src/lib/store-template.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ALL = process.argv.includes("--all");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const stores = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const targets = ALL ? stores : stores.filter((s) => s._count.products === 0);

  console.log(
    `${stores.length} store(s) found, ${targets.length} to fill` +
      `${ALL ? " (--all)" : " (stores with no products)"}${DRY_RUN ? " [dry run]" : ""}\n`,
  );

  for (const store of targets) {
    if (DRY_RUN) {
      console.log(
        `  would fill  ${store.name} (${store.slug}), ${store._count.products} products now`,
      );
      continue;
    }
    const admin = await prisma.user.findFirst({
      where: { organizationId: store.id, role: "ADMIN" },
      select: { id: true },
    });
    const result = await prisma.$transaction(
      (tx) =>
        applyStoreTemplate(tx, {
          organizationId: store.id,
          userId: admin?.id ?? null,
          openingStock: false,
        }),
      { timeout: 15_000 },
    );
    console.log(
      `  filled      ${store.name} (${store.slug}): ` +
        `+${result.categoriesCreated} categories, +${result.productsCreated} products`,
    );
  }

  if (!targets.length) console.log("  Nothing to do.");
}

main()
  .catch((err) => {
    reportDbError(err, process.env.DATABASE_URL);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
