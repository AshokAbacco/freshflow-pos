import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";

const app = createApp();

/**
 * Say plainly whether online payment is switched on.
 *
 * Without this line the only way to discover that the Razorpay keys did not load is to sign in and
 * notice the Billing page saying "Payments not set up", which gives no clue as to why.
 */
function describePayments() {
  switch (env.razorpayMode) {
    case "live":
      return "Razorpay LIVE — real money will be charged";
    case "test":
      return "Razorpay test mode — no real money moves";
    default:
      return `payments OFF (no RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET in ${env.envFile})`;
  }
}

const server = app.listen(env.port, () => {
  console.log(
    `FreshFlow API listening on http://localhost:${env.port} (${env.nodeEnv}, reports in ${env.reportTimezone})`,
  );
  console.log(`  Billing: ${describePayments()}`);
});

async function shutdown(signal) {
  console.log(`${signal} received — closing server`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
