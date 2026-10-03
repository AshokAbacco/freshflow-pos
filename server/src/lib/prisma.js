import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

/*
 * SSL comes from DATABASE_URL, not from code. A local PostgreSQL offers no SSL and needs nothing;
 * a hosted one takes `?sslmode=require` on the end of the URL. Hardcoding an `ssl` option here
 * forces TLS even where the database does not support it, and `rejectUnauthorized: false` would
 * silently switch off certificate checking everywhere, including production.
 */
const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
});

export const prisma = new PrismaClient({
  adapter,
  log: env.isProd ? ["error"] : ["warn", "error"],
});
