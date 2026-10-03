#!/usr/bin/env node
/**
 * Pre-deployment check.
 *
 * Looks at the configuration and the database for the mistakes that are easy to make and
 * expensive to discover in production: the payment mock still wired in, a guessable JWT secret,
 * the published demo passwords still working, CORS left open to localhost.
 *
 *   npm run check:prod
 *
 * Exits 1 if anything would break or expose the deployment, 0 otherwise.
 * It only reads; nothing here changes configuration or data.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
dotenv.config({ path: envFile });

const WEAK_SECRET_HINTS = [
  'replace-with',
  'change-me',
  'changeme',
  'secret',
  'sandbox',
  'example',
  'your-',
  'abacco',
  'freshflow',
  '1234',
  'password',
];

const blockers = [];
const warnings = [];
const passes = [];

const block = (title, ...detail) => blockers.push({ title, detail });
const warn = (title, ...detail) => warnings.push({ title, detail });
const pass = (title) => passes.push(title);

const env = process.env;
const isProd = env.NODE_ENV === 'production';

/* ---------------------------------------------------------------- payments */


if (env.RAZORPAY_API_URL) {
  let host = null;
  try {
    host = new URL(env.RAZORPAY_API_URL).hostname;
  } catch {
    /* reported below as unparseable */
  }

  if (host === 'api.razorpay.com') {
    warn('RAZORPAY_API_URL is set to the default. Harmless, but the line can be removed.');
  } else if (host && ['localhost', '127.0.0.1'].includes(host)) {
    block(
      'RAZORPAY_API_URL points at the local test mock.',
      `Currently: ${env.RAZORPAY_API_URL}`,
      'Remove the line. Left in, every checkout tries to reach an address that does not exist in',
      'production, and no customer can pay.',
    );
  } else {
    block(
      'RAZORPAY_API_URL points somewhere that is not Razorpay.',
      `Currently: ${env.RAZORPAY_API_URL}`,
      'This is where the server SENDS requests to Razorpay. It is NOT your webhook URL — the',
      'webhook is configured in the Razorpay dashboard and arrives here by itself.',
      'Remove the line so the default https://api.razorpay.com/v1 is used.',
    );
  }
} else {
  pass('Payments go to the real Razorpay API');
}

const keyId = (env.RAZORPAY_KEY_ID || '').trim();
const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();

if (!keyId || !keySecret) {
  warn(
    'No Razorpay keys configured, so online payment will be switched off.',
    'Fine if that is deliberate; the Billing page says so and the rest of the app works.',
  );
} else if (keyId.startsWith('rzp_test_')) {
  block(
    'Razorpay TEST keys are configured.',
    'Test keys never collect real money. Generate live keys from the Razorpay dashboard',
    '(Account & Settings -> API Keys, with the Test/Live switch on Live) and use those.',
  );
} else if (keyId.startsWith('rzp_live_')) {
  pass('Razorpay live keys are configured');
} else {
  block('RAZORPAY_KEY_ID does not look like a Razorpay key.', `Currently: ${keyId.slice(0, 12)}…`);
}

if (keyId && keySecret && !env.RAZORPAY_WEBHOOK_SECRET) {
  block(
    'RAZORPAY_WEBHOOK_SECRET is not set.',
    'Without it, a customer who pays and then closes the browser is charged without their plan',
    'activating, and the webhook endpoint refuses every delivery. Add the webhook in the Razorpay',
    'dashboard pointing at https://your-api/api/billing/webhook and put its secret here.',
  );
} else if (env.RAZORPAY_WEBHOOK_SECRET) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  const looksGuessable =
    secret.length < 24 ||
    /^[A-Za-z]+[@#_-]?\d{1,6}$/.test(secret) ||
    WEAK_SECRET_HINTS.some((hint) => secret.toLowerCase().includes(hint));

  if (looksGuessable) {
    block(
      'RAZORPAY_WEBHOOK_SECRET is short or guessable.',
      `It is ${secret.length} characters.`,
      'This is the key Razorpay signs webhooks with, and a correctly signed "payment captured"',
      'event activates a paid plan. Anyone who guesses it can give themselves a subscription for',
      'free. Treat it like the JWT secret, not like a password:',
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      'Update it in the Razorpay dashboard webhook and here at the same time.',
    );
  } else {
    pass('Webhook secret is set and has reasonable entropy');
  }
}

const jwtSecret = env.JWT_SECRET || '';

if (!jwtSecret) {
  block('JWT_SECRET is not set.');
} else if (jwtSecret.length < 32) {
  block(
    `JWT_SECRET is only ${jwtSecret.length} characters.`,
    'Use at least 32. Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  );
} else if (WEAK_SECRET_HINTS.some((hint) => jwtSecret.toLowerCase().includes(hint))) {
  block(
    'JWT_SECRET looks like a placeholder or a value copied from the docs.',
    'Anyone with this value can mint a token for any account, including an admin of any store.',
    'Generate a fresh one:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  );
} else {
  pass('JWT_SECRET is long and does not look like a placeholder');
}

/* ------------------------------------------------------------- environment */

if (!isProd) {
  block(
    `NODE_ENV is "${env.NODE_ENV || '(unset)'}", not "production".`,
    'In development the sign-in rate limit is 500 instead of 20, request logging is verbose,',
    'and the JWT secret length check is skipped.',
  );
} else {
  pass('NODE_ENV is production');
}

const corsOrigins = (env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!corsOrigins.length) {
  warn('CORS_ORIGIN is not set, so it falls back to http://localhost:5173.');
} else if (corsOrigins.some((o) => o === '*')) {
  block('CORS_ORIGIN is "*", which lets any website call this API with a signed-in user\'s session.');
} else if (corsOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o))) {
  warn(
    'CORS_ORIGIN still includes a localhost address.',
    `Currently: ${corsOrigins.join(', ')}`,
    'Harmless but untidy; set it to the real site address only.',
  );
} else if (corsOrigins.some((o) => o.startsWith('http://'))) {
  block(
    'CORS_ORIGIN uses http:// rather than https://.',
    `Currently: ${corsOrigins.join(', ')}`,
    'Razorpay checkout, the service worker and the weighing-scale integration all need HTTPS.',
  );
} else {
  pass('CORS_ORIGIN is set to an https origin');
}

if (env.TRUST_PROXY !== 'true') {
  warn(
    'TRUST_PROXY is not true.',
    'If the API sits behind nginx, a load balancer or a platform like Render, rate limiting will',
    'see every request as coming from the proxy instead of the real client.',
  );
} else {
  pass('TRUST_PROXY is enabled');
}

if (env.LOGIN_RATE_LIMIT && Number(env.LOGIN_RATE_LIMIT) > 50) {
  warn(
    `LOGIN_RATE_LIMIT is ${env.LOGIN_RATE_LIMIT}, which is high for production.`,
    'Remove it to use the default of 20 sign-in attempts per 15 minutes.',
  );
}

if (env.SEED_RESET_PASSWORDS === 'true') {
  block(
    'SEED_RESET_PASSWORDS=true is left in the environment.',
    'Every run of the seed will reset the admin and cashier passwords back to the values in this',
    'file, silently undoing any password people have changed. It is meant as a one-off command:',
    '  SEED_RESET_PASSWORDS=true npm run db:seed',
  );
}

const weakSeedPasswords = ['SEED_ADMIN_PASSWORD', 'SEED_CASHIER_PASSWORD'].filter(
  (k) => env[k] && (env[k].length < 10 || /^\d+$/.test(env[k])),
);
if (weakSeedPasswords.length) {
  block(
    `Weak seeded password${weakSeedPasswords.length === 1 ? '' : 's'}: ${weakSeedPasswords.join(', ')}.`,
    'These become real sign-ins for a store admin. Use something long and random.',
  );
}

if (/localhost|127\.0\.0\.1/.test(env.APP_URL || '')) {
  warn(`APP_URL still points at localhost (${env.APP_URL}).`);
}

/* -------------------------------------------------------------------- data */

const dbUrl = env.DATABASE_URL || '';
if (!dbUrl) {
  block('DATABASE_URL is not set.');
} else {
  const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  if (isLocalDb) {
    warn(
      'DATABASE_URL points at localhost.',
      'Right if the database runs on the same machine; wrong if you meant a managed database.',
    );
  } else if (!/sslmode=/.test(dbUrl)) {
    warn(
      'DATABASE_URL has no sslmode and the database is on another host.',
      'Most managed providers require TLS. Append ?sslmode=require to the URL.',
    );
  } else {
    pass('DATABASE_URL uses an explicit sslmode');
  }
}

/* The published demo passwords, which this project prints on every seed. */
const KNOWN_DEMO_PASSWORDS = ['Admin@12345', 'Cashier@12345', '123456', 'password'];

const DB_PROBE_TIMEOUT_MS = 8000;

async function checkSeededAccounts() {
  if (!dbUrl) return;
  let prisma;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    /*
     * A short connect timeout matters here: this check is often run against a database that is
     * firewalled, asleep or simply wrong, and the default would leave the command hanging with no
     * output at all. Better to say the database is unreachable and carry on with the other checks.
     */
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl, connectionTimeoutMillis: DB_PROBE_TIMEOUT_MS, max: 1 }),
    });

    const withTimeout = (promise) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`no response within ${DB_PROBE_TIMEOUT_MS / 1000}s`)), DB_PROBE_TIMEOUT_MS),
        ),
      ]);

    const users = await withTimeout(
      prisma.user.findMany({
        where: { isActive: true },
        select: { email: true, role: true, passwordHash: true },
      }),
    );

    if (!users.length) {
      warn('No active user accounts found in this database.');
      return;
    }

    const exposed = [];
    for (const user of users) {
      for (const candidate of KNOWN_DEMO_PASSWORDS) {
        if (await bcrypt.compare(candidate, user.passwordHash)) {
          exposed.push(`${user.email} (${user.role}) still uses "${candidate}"`);
          break;
        }
      }
    }

    if (exposed.length) {
      block(
        'Accounts are still using the documented demo passwords.',
        ...exposed,
        'These appear in this project\'s README and setup output, so they are public knowledge.',
        'Change them in Settings -> Team, or re-seed with your own SEED_ADMIN_PASSWORD and',
        'SEED_RESET_PASSWORDS=true.',
      );
    } else {
      pass(`None of the ${users.length} active accounts use a known demo password`);
    }

    const orgs = await withTimeout(prisma.organization.count());
    const demoStore = await withTimeout(prisma.organization.findUnique({ where: { slug: 'freshflow-supermarket' } }));
    if (demoStore && orgs === 1) {
      warn(
        'The only store in this database is the seeded demo "FreshFlow Supermarket" with 22 sample products.',
        'Fine as a starting point; remove it if real customers will sign up here.',
      );
    }
  } catch (err) {
    warn(
      'Could not reach the database, so accounts were not checked for weak passwords.',
      String(err.message).split('\n').filter(Boolean)[0],
      'Run this again from somewhere that can reach the database before trusting a clean result.',
    );
  } finally {
    await prisma?.$disconnect().catch(() => {});
  }
}

/* ------------------------------------------------------------------ report */

await checkSeededAccounts();

const line = '─'.repeat(72);

/*
 * Run on a laptop this reads a development .env, and every production rule fails by design.
 * Saying so stops the report being mistaken for "the project is broken": what matters is the
 * configuration the deployed service runs with, which on a host like Render is set in its
 * dashboard rather than in a file.
 */
const looksLocal =
  !isProd &&
  (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || corsOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o)));

console.log(`\n${line}`);
console.log(`Production readiness — ${envFile}`);
if (looksLocal) {
  console.log('');
  console.log('  This is a development configuration, so the production rules below fail by design.');
  console.log('  Leave this file as it is for local work. What needs to be clean is the configuration');
  console.log('  your deployed service runs with — on Render that is set under');
  console.log('  Dashboard -> your service -> Environment, not in this file.');
  console.log('');
  console.log('  To check the deployed configuration, run this command there:');
  console.log('    Render -> your service -> Shell:   npm run check:prod');
}
console.log(line);

for (const title of passes) console.log(`  ok        ${title}`);

if (warnings.length) {
  console.log('');
  for (const { title, detail } of warnings) {
    console.log(`  check     ${title}`);
    for (const d of detail) console.log(`            ${d}`);
  }
}

if (blockers.length) {
  console.log('');
  for (const { title, detail } of blockers) {
    console.log(`  BLOCKER   ${title}`);
    for (const d of detail) console.log(`            ${d}`);
  }
}

console.log(`${line}`);
if (blockers.length) {
  const summary = `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}, ${warnings.length} to check.`;
  console.log(looksLocal ? `${summary} Expected for a local setup — fix these where the app is deployed.\n` : `${summary} Not ready to deploy.\n`);
  process.exit(1);
}
console.log(`No blockers, ${warnings.length} to check.\n`);
