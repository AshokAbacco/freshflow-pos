import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/*
 * Load server/.env by its own location rather than the current working directory, so the server
 * starts the same way whether it is launched from the server folder, the repo root, a systemd
 * unit or a process manager. Real environment variables already set (Docker, PM2, a host's
 * dashboard) always win: dotenv does not overwrite them.
 */
const envFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.env",
);
dotenv.config({ path: envFile });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Checked real environment variables and ${envFile}. ` +
        "Copy .env.example to .env and fill it in.",
    );
  }
  return value;
}

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    throw new Error(`REPORT_TIMEZONE "${tz}" is not a valid IANA timezone`);
  }
}

const nodeEnv = process.env.NODE_ENV || "development";
const jwtSecret = required("JWT_SECRET");

if (nodeEnv === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

/*
 * Razorpay keys are easy to get wrong in ways that only show up when money is involved:
 * swapping the key id and secret, or shipping test keys to production. Both are caught here,
 * at boot, rather than at the moment a customer tries to pay.
 */
const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || "").trim();
const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const razorpayWebhookSecret = (
  process.env.RAZORPAY_WEBHOOK_SECRET || ""
).trim();

if (razorpayKeyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(razorpayKeyId)) {
  throw new Error(
    "RAZORPAY_KEY_ID should look like rzp_test_xxxxxxxx or rzp_live_xxxxxxxx. Check you have not pasted the key secret here.",
  );
}
if (razorpayKeySecret && /^rzp_(test|live)_/.test(razorpayKeySecret)) {
  throw new Error(
    "RAZORPAY_KEY_SECRET holds a key id. The secret is the second value Razorpay showed you, and it has no rzp_ prefix.",
  );
}
if (Boolean(razorpayKeyId) !== Boolean(razorpayKeySecret)) {
  throw new Error(
    "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET together, or leave both empty to run without online payments.",
  );
}

const razorpayMode = razorpayKeyId.startsWith("rzp_live_")
  ? "live"
  : razorpayKeyId
    ? "test"
    : "off";

/*
 * Where outgoing calls to Razorpay are sent. This is Razorpay's API, not this application's
 * webhook endpoint — the two are opposite directions of travel, and pointing this at our own
 * webhook makes every checkout POST an order to ourselves. Only Razorpay's own host, or a local
 * mock during testing, is accepted.
 */
const razorpayApiUrl = (
  process.env.RAZORPAY_API_URL || "https://api.razorpay.com/v1"
)
  .trim()
  .replace(/\/+$/, "");
const apiHost = (() => {
  try {
    return new URL(razorpayApiUrl);
  } catch {
    throw new Error(`RAZORPAY_API_URL is not a valid URL: ${razorpayApiUrl}`);
  }
})();

const isRazorpayHost = apiHost.hostname === "api.razorpay.com";
const isLocalMock = ["localhost", "127.0.0.1"].includes(apiHost.hostname);

if (!isRazorpayHost && !isLocalMock) {
  throw new Error(
    `RAZORPAY_API_URL points at ${apiHost.origin}, which is neither Razorpay nor a local mock.\n` +
      "  This setting is where this server SENDS requests to Razorpay. It is not your webhook URL;\n" +
      "  the webhook is configured in the Razorpay dashboard and arrives here on its own.\n" +
      "  Remove the line to use https://api.razorpay.com/v1, which is what production needs.",
  );
}
if (isRazorpayHost && !/\/v\d+$/.test(apiHost.pathname)) {
  throw new Error(
    `RAZORPAY_API_URL should end with the API version, e.g. https://api.razorpay.com/v1 (got ${razorpayApiUrl})`,
  );
}
if (isLocalMock && nodeEnv === "production") {
  throw new Error(
    "RAZORPAY_API_URL points at a local mock while NODE_ENV=production. Remove it so real payments reach Razorpay.",
  );
}

/*
 * The webhook secret is an HMAC key: Razorpay signs each delivery with it, and this server trusts
 * any correctly signed `payment.captured` enough to activate a paid plan. A guessable value means
 * anyone who guesses it can forge that event and grant themselves a subscription, so it is held to
 * the same standard as the JWT secret rather than treated as a password.
 */
if (razorpayWebhookSecret && razorpayWebhookSecret.length < 20) {
  const warning =
    `RAZORPAY_WEBHOOK_SECRET is only ${razorpayWebhookSecret.length} characters. A short or guessable ` +
    'value lets someone forge a "payment captured" webhook and activate a paid plan without paying. ' +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";
  if (nodeEnv === "production") throw new Error(warning);
  console.warn(`[billing] ${warning}`);
}

if (nodeEnv === "production" && razorpayMode === "test") {
  console.warn(
    "[billing] Razorpay is in TEST mode on a production server. No real money will be collected.",
  );
}
if (razorpayMode !== "off" && !razorpayWebhookSecret) {
  console.warn(
    "[billing] RAZORPAY_WEBHOOK_SECRET is not set. Payments still work, but if a customer closes the browser " +
      "before returning, that payment will not activate their plan until the webhook is configured.",
  );
}

export const env = Object.freeze({
  nodeEnv,
  isProd: nodeEnv === "production",
  /// Where configuration was read from, quoted in startup messages when something is missing
  envFile,
  port: Number(process.env.PORT || 4000),
  databaseUrl: required("DATABASE_URL"),
  dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "true",
  reportTimezone: validTimezone(process.env.REPORT_TIMEZONE || "Asia/Kolkata"),
  appUrl: process.env.APP_URL || "http://localhost:5173",
  razorpayKeyId,
  razorpayKeySecret,
  razorpayWebhookSecret,
  /// 'live' | 'test' | 'off' — shown in the admin billing screen so nobody demos with live keys
  razorpayMode,
  razorpayApiUrl,
});
