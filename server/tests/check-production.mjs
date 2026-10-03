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
  block(
    'RAZORPAY_API_URL is set, so payments are pointed at the test mock.',
    `Currently: ${env.RAZORPAY_API_URL}`,
    'Remove this line entirely. Left in, every checkout in production tries to reach a local',
    'address that does not exist there, and no customer can pay.',
  );
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
  pass('Webhook secret is set');
}

/* ------------------------------------------------------------------ secrets */

const jwtSecret = env.JWT_SECRET || '';
const WEAK_SECRET_HINTS = [
  'replace-with',
  'change-me',
  'changeme',
  'secret',
  'sandbox',
  'test',
  'example',
  'your-',
  'freshflow',
];

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

async function checkSeededAccounts() {
  if (!dbUrl) return;
  let prisma;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { email: true, role: true, passwordHash: true },
    });

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

    const orgs = await prisma.organization.count();
    const demoStore = await prisma.organization.findUnique({ where: { slug: 'freshflow-supermarket' } });
    if (demoStore && orgs === 1) {
      warn(
        'The only store in this database is the seeded demo "FreshFlow Supermarket" with 22 sample products.',
        'Fine as a starting point; remove it if real customers will sign up here.',
      );
    }
  } catch (err) {
    warn('Could not inspect the database for weak accounts.', String(err.message).split('\n')[0]);
  } finally {
    await prisma?.$disconnect().catch(() => {});
  }
}

/* ------------------------------------------------------------------ report */

await checkSeededAccounts();

const line = '─'.repeat(72);
console.log(`\n${line}\nProduction readiness — ${envFile}\n${line}`);

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
  console.log(`${blockers.length} blocker${blockers.length === 1 ? '' : 's'}, ${warnings.length} to check. Not ready to deploy.\n`);
  process.exit(1);
}
console.log(`No blockers, ${warnings.length} to check.\n`);
