#!/usr/bin/env node
/**
 * Creates the first platform super admin, or resets an existing one â€” without touching SQL.
 *
 *   npm run admin:set -- --email you@company.com --password 'A-strong-one-12' --name 'Your Name'
 *   npm run admin:set -- --email support@company.com --role SUPPORT --generate-password
 *   npm run admin:set -- --email you@company.com --disable-totp
 *   npm run admin:set -- --list
 *
 * Deliberately refuses to leave the platform unreachable: it will not demote or disable the
 * last active SUPER_ADMIN. It also refuses an email that already belongs to a store user,
 * because platform staff and store staff must stay separate accounts.
 */
import crypto from "node:crypto";
import process from "node:process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const ROLES = ["SUPER_ADMIN", "SUPPORT", "FINANCE"];
const BCRYPT_ROUNDS = 12;

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out.flags.add(key);
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function die(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

/** Readable, and strong enough that nobody is tempted to "simplify" it. */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const pick = (n) =>
    Array.from(crypto.randomBytes(n))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  // Guarantees the mix the API's own policy requires.
  return `${pick(6)}-${pick(6)}-${crypto.randomInt(10, 99)}A`;
}

function checkPassword(password) {
  const value = String(password ?? "");
  if (value.length < 12)
    die(
      "That password is under 12 characters.",
      "Or pass --generate-password and let this script choose one.",
    );
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    die(
      "Use at least one lower-case letter, one capital and one digit.",
      "Or pass --generate-password.",
    );
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.flags.has("help") || (!args.email && !args.flags.has("list"))) {
  console.log(`
  Platform admin accounts

    --list                       show every platform admin
    --email <address>            the account to create or change   (required)
    --password '<value>'         set this password
    --generate-password          choose a strong password and print it once
    --name '<Full Name>'         name, required when creating
    --phone '<number>'           optional contact number
    --role <ROLE>                ${ROLES.join(" | ")}   (default SUPER_ADMIN on create)
    --activate | --deactivate    enable or disable the account
    --disable-totp               clear two-factor, for a lost authenticator
    --sign-out                   revoke every session for the account
`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  die(
    "DATABASE_URL is not set.",
    "Run this from the server/ folder, where the .env file lives.",
  );
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  if (args.flags.has("list")) {
    const admins = await prisma.platformAdmin.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        email: true,
        name: true,
        role: true,
        isActive: true,
        totpEnabled: true,
        lastLoginAt: true,
      },
    });
    if (!admins.length) {
      console.log("\n  No platform admins yet. Create one:");
      console.log(
        "  npm run admin:set -- --email you@company.com --name 'Your Name' --generate-password\n",
      );
      return;
    }
    console.log("");
    for (const a of admins) {
      const bits = [
        a.isActive ? "active" : "DISABLED",
        a.totpEnabled ? "2fa" : null,
        a.lastLoginAt
          ? `last in ${a.lastLoginAt.toISOString().slice(0, 16).replace("T", " ")}`
          : "never signed in",
      ].filter(Boolean);
      console.log(
        `  ${a.role.padEnd(12)} ${a.email.padEnd(32)} ${a.name.padEnd(20)} ${bits.join(", ")}`,
      );
    }
    console.log("");
    return;
  }

  const email = String(args.email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    die(`"${args.email}" does not look like an email address.`);

  if (args.role && !ROLES.includes(args.role)) {
    die(`Unknown role "${args.role}".`, `Use one of: ${ROLES.join(", ")}`);
  }

  // Platform staff and store staff are separate accounts on purpose. Sharing an address
  // between them would make "is this person a platform admin?" ambiguous.
  const storeUser = await prisma.user.findUnique({
    where: { email },
    select: { organization: { select: { name: true } } },
  });
  if (storeUser) {
    die(
      `${email} is already a store user at "${storeUser.organization?.name ?? "a store"}".`,
      "Platform staff need their own address â€” a store login must never double as a platform login.",
    );
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });

  let password = args.password ?? null;
  if (args.flags.has("generate-password")) password = generatePassword();
  if (password) checkPassword(password);

  if (!existing && !password) {
    die(
      "A new account needs a password.",
      "Pass --password '<value>' or --generate-password.",
    );
  }
  if (!existing && !args.name) {
    die("A new account needs a name.", "Pass --name 'Your Name'.");
  }

  const nextRole = args.role ?? (existing ? undefined : "SUPER_ADMIN");
  const nextActive = args.flags.has("deactivate")
    ? false
    : args.flags.has("activate")
      ? true
      : undefined;

  // Never strand the platform without a way in.
  if (existing && existing.role === "SUPER_ADMIN" && existing.isActive) {
    const losingSuperAdmin =
      (nextRole && nextRole !== "SUPER_ADMIN") || nextActive === false;
    if (losingSuperAdmin) {
      const others = await prisma.platformAdmin.count({
        where: {
          role: "SUPER_ADMIN",
          isActive: true,
          id: { not: existing.id },
        },
      });
      if (others === 0) {
        die(
          `${email} is the only active super admin.`,
          "Promote someone else first, or this would lock everyone out of the panel.",
        );
      }
    }
  }

  const data = {
    ...(password
      ? {
          passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
          passwordSetAt: new Date(),
        }
      : {}),
    ...(args.name ? { name: String(args.name).trim() } : {}),
    ...(args.phone ? { phone: String(args.phone).trim() } : {}),
    ...(nextRole ? { role: nextRole } : {}),
    ...(nextActive === undefined ? {} : { isActive: nextActive }),
    ...(args.flags.has("disable-totp")
      ? { totpSecret: null, totpEnabled: false }
      : {}),
    // Any admin:set run clears a lockout: that is usually why it is being run.
    failedLogins: 0,
    lockedUntil: null,
  };

  const admin = existing
    ? await prisma.platformAdmin.update({ where: { id: existing.id }, data })
    : await prisma.platformAdmin.create({ data: { email, ...data } });

  // A password change should not leave old sessions alive.
  if (args.flags.has("sign-out") || password) {
    const { count } = await prisma.platformSession.updateMany({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count)
      console.log(
        `\n  Signed out ${count} existing session${count === 1 ? "" : "s"}.`,
      );
  }

  await prisma.auditLog.create({
    data: {
      actorLabel: "cli:admin-set",
      action: existing ? "platform_admin.updated" : "platform_admin.created",
      targetType: "platform_admin",
      targetId: admin.id,
      reason: "admin:set script",
      changes: {
        email,
        role: admin.role,
        isActive: admin.isActive,
        passwordChanged: Boolean(password),
      },
    },
  });

  console.log(
    `\n  ${existing ? "Updated" : "Created"} ${admin.role} ${admin.email}`,
  );
  console.log(`  Name:   ${admin.name}`);
  console.log(`  Active: ${admin.isActive ? "yes" : "no"}`);
  if (args.flags.has("generate-password")) {
    console.log(`\n  Password: ${password}`);
    console.log(
      "  Copy it now â€” it is not stored anywhere and will not be shown again.",
    );
  }
  console.log(
    `\n  Sign in at: ${process.env.APP_URL ?? "http://localhost:5173"}/platform/login\n`,
  );
}

main()
  .catch((err) => {
    console.error(`\n  ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
