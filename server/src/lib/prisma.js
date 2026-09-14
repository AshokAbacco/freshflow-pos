import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.isProd ? ["error"] : ["warn", "error"],
});
