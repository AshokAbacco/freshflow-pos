/**
 * Turns the common database connection failures into something actionable.
 *
 * Prisma reports these as a P1xxx code wrapped in a long stack trace, which says what went wrong
 * but not what to change. These are the three that come up when setting the project up or moving
 * it between a local machine and a hosted database.
 */

const REDACT = /\/\/([^:]+):([^@]+)@/;

/** Hide the password before printing a connection string. */
export const safeUrl = (url) => String(url || "").replace(REDACT, "//$1:****@");

export function explainDbError(err, databaseUrl) {
  const url = safeUrl(databaseUrl);
  const message = String(err?.message ?? "");
  const code = err?.code;

  // The database refused TLS because it is not configured for it — the usual case for a local
  // PostgreSQL, which does not enable SSL by default.
  if (code === "P1011" || /does not support SSL/i.test(message)) {
    return [
      "The database refused an encrypted connection.",
      `  URL: ${url}`,
      "",
      "  Something is asking for SSL that this database does not offer. Either:",
      "    • DATABASE_URL ends with ?sslmode=require (or prefer / no-verify) — remove it for a local database, or",
      "    • an `ssl` option is hardcoded in the Prisma adapter — remove it and let DATABASE_URL decide.",
      "",
      "  A local PostgreSQL normally needs no SSL settings at all.",
    ].join("\n");
  }

  // The opposite: a hosted database that will not accept an unencrypted connection.
  if (/no encryption|SSL.*required|pg_hba\.conf/i.test(message)) {
    return [
      "The database requires an encrypted connection and the URL does not ask for one.",
      `  URL: ${url}`,
      "",
      "  Add sslmode to DATABASE_URL rather than hardcoding an ssl option:",
      '    DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"',
      "",
      "  Avoid rejectUnauthorized: false on a production database — it turns off certificate",
      "  checking, which is what makes the encryption worth having.",
    ].join("\n");
  }

  if (
    code === "P1001" ||
    /Can't reach database server|ECONNREFUSED/i.test(message)
  ) {
    return [
      "Cannot reach the database server.",
      `  URL: ${url}`,
      "",
      "  Check it is running and that the host, port and database name are right.",
      "    Local Docker:  docker compose up -d",
      "    macOS (brew):  brew services start postgresql@16",
    ].join("\n");
  }

  if (code === "P1000" || /authentication failed|password/i.test(message)) {
    return [
      "The database rejected the username or password.",
      `  URL: ${url}`,
      "",
      "  Check the credentials in DATABASE_URL in server/.env.",
    ].join("\n");
  }

  if (code === "P1003" || /does not exist/i.test(message)) {
    return [
      "That database does not exist yet.",
      `  URL: ${url}`,
      "",
      "  Create it, then apply the migrations:",
      "    createdb freshflow        # or CREATE DATABASE freshflow; in psql",
      "    npm run db:deploy",
    ].join("\n");
  }

  if (code === "P2021" || /table .* does not exist/i.test(message)) {
    return [
      "The tables are missing, so the migrations have not been applied to this database.",
      `  URL: ${url}`,
      "",
      "  Run:  npm run db:deploy",
    ].join("\n");
  }

  return null;
}

/** Print a readable explanation when there is one, and the raw error when there is not. */
export function reportDbError(err, databaseUrl) {
  const explanation = explainDbError(err, databaseUrl);
  if (explanation) {
    console.error(`\n${explanation}\n`);
  } else {
    console.error(err);
  }
}
