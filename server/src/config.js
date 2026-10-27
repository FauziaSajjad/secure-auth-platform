require('dotenv').config();

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

function accessSecret() {
  const s = env.JWT_ACCESS_SECRET || (isTest ? 'test-secret-test-secret-test-secret-123' : undefined);
  if (!s || s.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be set and at least 32 characters long');
  }
  return s;
}

module.exports = {
  isProd,
  isTest,
  port: Number(env.PORT) || 4000,
  databaseUrl: isTest
    ? env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/authdb_test'
    : env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/authdb',
  clientUrl: env.CLIENT_URL || 'http://localhost:5173',
  trustProxy: env.TRUST_PROXY === '1',
  jwtAccessSecret: accessSecret(),
  accessTtl: '15m',
  refreshTtlDays: Number(env.REFRESH_TTL_DAYS) || 7,
  bcryptRounds: isTest ? 4 : 12,
  maxFailedAttempts: 5,
  lockMinutes: 15,
  adminEmail: (env.ADMIN_EMAIL || '').toLowerCase(),
  // Demo mode: accounts are verified on sign-up and no email is needed.
  autoVerifyEmail: env.AUTO_VERIFY_EMAIL === '1',
  brevoApiKey: env.BREVO_API_KEY,
  mailFrom: { name: env.MAIL_FROM_NAME || 'Secure Auth', email: env.MAIL_FROM_EMAIL },
  smtp: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || 'Secure Auth <no-reply@example.com>',
  },
};
