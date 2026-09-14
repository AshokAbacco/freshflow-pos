import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`FreshFlow API listening on http://localhost:${env.port} (${env.nodeEnv}, reports in ${env.reportTimezone})`);
});

async function shutdown(signal) {
  console.log(`${signal} received — closing server`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
