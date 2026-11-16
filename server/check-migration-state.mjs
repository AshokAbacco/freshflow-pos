/**
 * Works out which migrations your database already contains, and prints the exact commands
 * to get Prisma's history back in step.
 *
 * Why this is needed: a database built with `prisma db push`, or one whose _prisma_migrations
 * table was lost, holds all the tables but no record of how they got there. `migrate deploy`
 * then tries to replay the first migration from scratch and stops on "type Role already
 * exists". The database is fine; only the bookkeeping is missing.
 *
 * `migrate resolve --applied` writes that bookkeeping without running any SQL. This script
 * never changes anything -- it only looks and tells you what to run.
 *
 *     node scripts/check-migration-state.mjs
 *
 * Reads DATABASE_URL from the environment or .env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const name of [".env", ".env.local"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const match = fs
      .readFileSync(file, "utf8")
      .match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
    if (match) return match[1].trim();
  }
  return null;
}

/*
 * One cheap probe per migration: something it creates that nothing else does. If the probe
 * finds the object, that migration's work is already in the database.
 */
const PROBES = [
  {
    name: "20260919000000_init",
    what: "the original schema",
    sql: `SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'Role') AS present`,
  },
  {
    name: "20261113000000_repair_payment_drift",
    what: "webhook_events and the extra payment columns",
    sql: `SELECT (to_regclass('public.webhook_events') IS NOT NULL)
                 AND EXISTS (
                   SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'payments' AND column_name = 'amount_captured'
                 ) AS present`,
  },
  {
    name: "20261113010000_platform_admin",
    what: "the platform admin tables",
    sql: `SELECT to_regclass('public.platform_admins') IS NOT NULL AS present`,
  },
  {
    name: "20261114000000_plans_and_messages",
    what: "plans and in-app messages",
    sql: `SELECT (to_regclass('public.plans') IS NOT NULL)
                 AND (to_regclass('public.platform_messages') IS NOT NULL) AS present`,
  },
  {
    name: "20261116000000_message_threads",
    what: "reply threads",
    sql: `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'platform_messages' AND column_name = 'in_reply_to_id'
          ) AS present`,
  },
];

/**
 * Is the generated client built from the schema that is on disk right now?
 *
 * Prisma copies the schema it generated from into node_modules/.prisma/client. If that copy
 * differs from prisma/schema.prisma, the client does not know about the newest fields, and
 * every query using one fails at runtime with "Unknown argument" -- which reads like a bug in
 * the query rather than a missing build step.
 */
function clientFreshness() {
  const current = path.join(root, "prisma", "schema.prisma");
  if (!fs.existsSync(current)) return { state: "no-schema" };

  const candidates = [
    path.join(root, "node_modules", ".prisma", "client", "schema.prisma"),
    path.join(
      root,
      "node_modules",
      "@prisma",
      "client",
      ".prisma",
      "client",
      "schema.prisma",
    ),
  ];
  const generated = candidates.find((p) => fs.existsSync(p));
  if (!generated) return { state: "not-generated" };

  const a = fs.readFileSync(current, "utf8").replace(/\s+/g, " ").trim();
  const b = fs.readFileSync(generated, "utf8").replace(/\s+/g, " ").trim();
  if (a === b) return { state: "fresh" };

  /*
   * Name a field the schema has and the client does not, so the message is concrete.
   * Scanned line by line: a regex stopping at the first "}" breaks on models containing
   * @default("{}").
   */
  const modelFields = (src) => {
    const out = new Map();
    let model = null;
    for (const line of src.split("\n")) {
      const open = line.match(/^model (\w+) \{/);
      if (open) {
        model = open[1];
        out.set(model, []);
        continue;
      }
      if (model && /^\}/.test(line)) {
        model = null;
        continue;
      }
      if (!model) continue;
      const field = line.match(/^\s{2,}(\w+)\s+\S/);
      if (field && !line.trim().startsWith("@@")) out.get(model).push(field[1]);
    }
    return out;
  };

  const want = modelFields(fs.readFileSync(current, "utf8"));
  const have = modelFields(fs.readFileSync(generated, "utf8"));
  const missing = [];
  for (const [model, fields] of want) {
    const known = have.get(model) ?? [];
    for (const f of fields)
      if (!known.includes(f)) missing.push(`${model}.${f}`);
  }

  return { state: "stale", missing };
}

const url = databaseUrl();
if (!url) {
  console.error("No DATABASE_URL found in the environment or .env.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const onDisk = fs
  .readdirSync(path.join(root, "prisma", "migrations"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

// What Prisma currently believes.
let recorded = new Map();
let hasHistory = false;
try {
  const { rows } = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
     FROM _prisma_migrations ORDER BY started_at`,
  );
  hasHistory = true;
  recorded = new Map(rows.map((r) => [r.migration_name, r]));
} catch {
  // No history table at all: a db push database, or the table was dropped.
}

console.log(`database : ${url.replace(/:[^:@/]*@/, ":****@")}`);
console.log(
  `history  : ${hasHistory ? `${recorded.size} migration(s) recorded` : "no _prisma_migrations table"}`,
);

const generated = clientFreshness();
if (generated.state === "fresh") {
  console.log("client   : generated from the current schema");
} else if (generated.state === "not-generated") {
  console.log("client   : NOT GENERATED — run `npx prisma generate`");
} else if (generated.state === "stale") {
  console.log("client   : STALE — generated from an older schema");
  if (generated.missing.length) {
    console.log(
      `           the client does not know about: ${generated.missing.slice(0, 8).join(", ")}`,
    );
  }
  console.log(
    '           queries using those fields fail with "Unknown argument". Fix with:',
  );
  console.log("           npx prisma generate   (then restart the server)");
}
console.log("");

const toResolve = [];
const toDeploy = [];
const failed = [];

for (const name of onDisk) {
  const probe = PROBES.find((p) => p.name === name);
  const row = recorded.get(name);

  let inDatabase = null;
  if (probe) {
    const { rows } = await client.query(probe.sql);
    inDatabase = rows[0]?.present === true;
  }

  if (row && row.finished_at && !row.rolled_back_at) {
    console.log(`  recorded, done      ${name}`);
    continue;
  }
  if (row && !row.finished_at) {
    // A half-applied row is what blocks every later migration.
    console.log(
      `  FAILED in history   ${name}  ${inDatabase ? "(its objects DO exist)" : "(its objects do NOT exist)"}`,
    );
    failed.push({ name, inDatabase });
    continue;
  }
  if (inDatabase === true) {
    console.log(`  in database, not recorded   ${name}  — ${probe.what}`);
    toResolve.push(name);
  } else if (inDatabase === false) {
    console.log(`  not applied         ${name}  — ${probe.what}`);
    toDeploy.push(name);
  } else {
    console.log(`  unknown (no probe)  ${name}`);
  }
}

console.log("");

if (!toResolve.length && !failed.length) {
  console.log(
    "Nothing to repair. `npx prisma migrate deploy` will apply what is left.",
  );
} else {
  console.log("Run these, in this order:");
  console.log("");
  for (const f of failed) {
    // A failed row must be cleared before anything else will run.
    console.log(
      f.inDatabase
        ? `  npx prisma migrate resolve --applied ${f.name}`
        : `  npx prisma migrate resolve --rolled-back ${f.name}`,
    );
  }
  for (const name of toResolve) {
    console.log(`  npx prisma migrate resolve --applied ${name}`);
  }
  console.log("");
  console.log("  npx prisma migrate deploy");
  console.log("  npx prisma generate");
  console.log("");
  console.log(
    "`resolve --applied` only writes a history row. It runs no SQL and touches no data.",
  );
}

await client.end();
