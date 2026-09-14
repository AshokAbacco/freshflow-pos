import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    throw new Error(`REPORT_TIMEZONE "${tz}" is not a valid IANA timezone`);
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = required('JWT_SECRET');

if (nodeEnv === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

export const env = Object.freeze({
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  reportTimezone: validTimezone(process.env.REPORT_TIMEZONE || 'Asia/Kolkata'),
});
