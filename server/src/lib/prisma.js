import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const adapter = new PrismaPg({ connectionString: env.databaseUrl, max: env.dbPoolMax });

export const prisma = new PrismaClient({
  adapter,
  log: env.isProd ? ['error'] : ['warn', 'error'],
});
