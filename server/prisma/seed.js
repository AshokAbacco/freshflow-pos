/**
 * Seeds the demo store: FreshFlow Supermarket, its settings, trial and the starter catalog from
 * store-template.js (the same catalog every new signup gets). Safe to re-run; never touches sales.
 *
 * Staff accounts are NOT created by default. Real users sign up through POST /auth/register.
 * Create the demo admin + cashier only when you ask for them:
 *
 *   npm run db:seed                        → store, settings, catalog. No users.
 *   npm run db:seed -- --with-users        → also create the demo admin and cashier
 *   SEED_CREATE_USERS=true npm run db:seed → same as --with-users
 *
 *   SEED_RESET_PASSWORDS=true npm run db:seed -- --with-users
 *                                          → also force the .env passwords back onto them
 *
 * Even with --with-users, an account that already exists is never created twice or changed
 * (unless SEED_RESET_PASSWORDS=true).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { reportDbError } from "./db-errors.js";
import {
  applyStoreTemplate,
  defaultStoreSettings,
  trialSubscription,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from "../src/lib/store-template.js";

/*
 * SSL is decided by DATABASE_URL, never hardcoded here. A local PostgreSQL has no SSL and needs
 * no settings; a hosted one takes `?sslmode=require` on the end of the URL. Passing an `ssl`
 * option in code forces TLS even against a database that does not offer it, which fails with
 * "The server does not support SSL connections".
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const WITH_USERS =
  process.argv.includes("--with-users") ||
  process.env.SEED_CREATE_USERS === "true";

/*
 * Creates the account if it does not exist. An existing account is left alone, so a re-seed
 * never duplicates a user or quietly changes a password someone has since set themselves.
 * Run with SEED_RESET_PASSWORDS=true to force the .env passwords back on.
 */
async function upsertUser(organizationId, name, rawEmail, password, role) {
  // Lowercase before the lookup too, or a mixed-case email in .env would miss the existing
  // row on a re-run and then fail the unique constraint on create.
  const email = rawEmail.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.organizationId !== organizationId) {
      // The email belongs to someone in another store; never touch their account.
      return { user: existing, created: false, reset: false, foreign: true };
    }
    if (process.env.SEED_RESET_PASSWORDS === "true") {
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await bcrypt.hash(password, 12), isActive: true },
      });
      return { user, created: false, reset: true };
    }
    return { user: existing, created: false, reset: false };
  }

  const user = await prisma.user.create({
    data: {
      organizationId,
      name,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  return { user, created: true, reset: false };
}

const describeAccount = (result, password) => {
  if (result.foreign) return "  (email used by another store, skipped)";
  if (result.created) return `  (created, password: ${password})`;
  if (result.reset) return `  (password reset to: ${password})`;
  return "  (already existed, unchanged)";
};

async function main() {
  const env = process.env;

  const organization = await prisma.organization.upsert({
    where: { slug: "freshflow-supermarket" },
    update: {},
    create: { name: "FreshFlow Supermarket", slug: "freshflow-supermarket" },
  });
  const organizationId = organization.id;

  await prisma.subscription.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, ...trialSubscription() },
  });

  // The demo store keeps its own sample identity on top of the neutral defaults.
  await prisma.storeSetting.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      ...defaultStoreSettings({
        storeName: "FreshFlow Supermarket",
        phone: "+91 98765 43210",
        address: "123 Retail Hub, MG Road, Bengaluru 560001",
      }),
      tagline: "Fresh quality, daily low prices",
      gstin: "29AAAAA0000A1Z5",
      upiVpa: env.SEED_UPI_VPA || null,
    },
  });

  const adminPassword = env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const cashierPassword = env.SEED_CASHIER_PASSWORD || "Cashier@12345";
  let admin = null;
  let cashier = null;

  if (WITH_USERS) {
    admin = await upsertUser(
      organizationId,
      env.SEED_ADMIN_NAME || "Store Admin",
      env.SEED_ADMIN_EMAIL || "admin@freshflow.local",
      adminPassword,
      "ADMIN",
    );
    cashier = await upsertUser(
      organizationId,
      env.SEED_CASHIER_NAME || "Front Desk Cashier",
      env.SEED_CASHIER_EMAIL || "cashier@freshflow.local",
      cashierPassword,
      "CASHIER",
    );
  }

  // Opening-stock entries are credited to this store's admin when there is one, else left blank.
  const stockUserId =
    (admin && !admin.foreign ? admin.user.id : null) ??
    (
      await prisma.user.findFirst({
        where: { organizationId, role: "ADMIN" },
        select: { id: true },
      })
    )?.id ??
    null;

  // Demo store gets the sample stock levels; real signups start at zero.
  const catalog = await prisma.$transaction(
    (tx) =>
      applyStoreTemplate(tx, {
        organizationId,
        userId: stockUserId,
        openingStock: true,
      }),
    { timeout: 15_000 },
  );

  console.log("Seed complete");
  console.log(
    `  Store   ${organization.name} (${TRIAL_DAYS}-day free trial, ${TRIAL_SEATS} seats)`,
  );
  console.log(`  Categories created: ${catalog.categoriesCreated}`);
  console.log(
    `  Products created: ${catalog.productsCreated} of ${catalog.productsInTemplate}`,
  );

  if (!WITH_USERS) {
    console.log("\n  Users   skipped (none created or changed)");
    console.log("  To create the demo admin and cashier:");
    console.log("    npm run db:seed -- --with-users");
    return;
  }

  console.log(
    `  Admin   ${admin.user.email}${describeAccount(admin, adminPassword)}`,
  );
  console.log(
    `  Cashier ${cashier.user.email}${describeAccount(cashier, cashierPassword)}`,
  );
  if (admin.created || cashier.created)
    console.log("\n  Change these passwords after first sign-in.");
  if (!admin.created && !admin.reset && !admin.foreign) {
    console.log("\n  To force the passwords in .env back onto these accounts:");
    console.log(
      "    SEED_RESET_PASSWORDS=true npm run db:seed -- --with-users",
    );
  }
}

main()
  .catch((err) => {
    reportDbError(err, process.env.DATABASE_URL);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
