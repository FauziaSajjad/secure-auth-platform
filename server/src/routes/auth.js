const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const config = require('../config');
const { query, withTransaction } = require('../db');
const { sha256, randomToken, signAccessToken } = require('../utils/tokens');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');
const { authenticate, requireCustomHeader } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const COOKIE = 'refresh_token';
const cookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'strict',
  path: '/api/auth',
};

// ---------- schemas ----------
const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[a-z]/i, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');
const token = z.string().min(20).max(200);

const schemas = {
  register: z.object({ name: z.string().trim().min(1, 'Name is required').max(80), email, password }),
  login: z.object({ email, password: z.string().min(1).max(200) }),
  email: z.object({ email }),
  token: z.object({ token }),
  reset: z.object({ token, password }),
  change: z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }),
};

// ---------- helpers ----------
const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  emailVerified: u.email_verified,
  createdAt: u.created_at,
});

// Used to keep login timing similar whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

const audit = (userId, event, req) =>
  query('INSERT INTO audit_log (user_id, event, ip) VALUES ($1, $2, $3)', [userId, event, req.ip]).catch(() => {});

async function createOneTimeToken(client, userId, purpose, ttlMinutes) {
  const raw = randomToken();
  await client.query(
    `INSERT INTO one_time_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)`,
    [userId, purpose, sha256(raw), String(ttlMinutes)]
  );
  return raw;
}

// Marks a one-time token as used and returns its user_id, or null if invalid.
async function consumeOneTimeToken(client, raw, purpose) {
  const { rows } = await client.query(
    `UPDATE one_time_tokens SET used_at = NOW()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [sha256(raw), purpose]
  );
  return rows[0]?.user_id ?? null;
}

async function issueRefreshToken(client, user, req, familyId) {
  const raw = randomToken();
  const { rows } = await client.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, COALESCE($2, gen_random_uuid()), $3, NOW() + ($4 || ' days')::interval, $5, $6)
     RETURNING id, family_id`,
    [user.id, familyId || null, sha256(raw), String(config.refreshTtlDays), (req.get('User-Agent') || '').slice(0, 255), req.ip]
  );
  return { raw, id: rows[0].id, familyId: rows[0].family_id };
}

const setRefreshCookie = (res, raw) =>
  res.cookie(COOKIE, raw, { ...cookieOptions, maxAge: config.refreshTtlDays * 24 * 60 * 60 * 1000 });

const clearRefreshCookie = (res) => res.clearCookie(COOKIE, cookieOptions);

const revokeAllForUser = (client, userId) =>
  client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);

const GENERIC_REGISTER = config.autoVerifyEmail
  ? { message: 'Account created. You can log in now.', autoVerified: true }
  : { message: 'If this email can be registered, a verification link is on its way.', autoVerified: false };
const GENERIC_RESET = { message: 'If an account exists for that email, a reset link is on its way.' };

// ---------- routes ----------
router.post('/register', authLimiter, validate(schemas.register), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, config.bcryptRounds); // always hash, so timing doesn't reveal duplicates
    const role = email === config.adminEmail ? 'admin' : 'user';

    let created;
    try {
      created = await withTransaction(async (client) => {
        const { rows } = await client.query(
          'INSERT INTO users (email, name, password_hash, role, email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [email, name, hash, role, config.autoVerifyEmail]
        );
        const verifyToken = config.autoVerifyEmail ? null : await createOneTimeToken(client, rows[0].id, 'verify_email', 24 * 60);
        return { user: rows[0], verifyToken };
      });
    } catch (err) {
      if (err.code === '23505') return res.status(201).json(GENERIC_REGISTER); // email already registered
      throw err;
    }

    if (created.verifyToken) await sendVerificationEmail(created.user, created.verifyToken);
    audit(created.user.id, 'register', req);
    res.status(201).json(GENERIC_REGISTER);
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', authLimiter, validate(schemas.token), async (req, res, next) => {
  try {
    const ok = await withTransaction(async (client) => {
      const userId = await consumeOneTimeToken(client, req.body.token, 'verify_email');
      if (!userId) return false;
      await client.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
      return true;
    });
    if (!ok) return res.status(400).json({ error: 'This verification link is invalid or has expired' });
    res.json({ message: 'Email verified. You can log in now.' });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-verification', authLimiter, validate(schemas.email), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1 AND email_verified = FALSE', [req.body.email]);
    if (rows[0]) {
      const raw = await withTransaction((client) => createOneTimeToken(client, rows[0].id, 'verify_email', 24 * 60));
      await sendVerificationEmail(rows[0], raw);
    }
    res.json({ message: 'If that account needs verification, a new link is on its way.' });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, validate(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes or reset your password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= config.maxFailedAttempts;
      await query(
        `UPDATE users SET failed_attempts = $2,
           locked_until = CASE WHEN $3 THEN NOW() + ($4 || ' minutes')::interval ELSE locked_until END
         WHERE id = $1`,
        [user.id, lock ? 0 : attempts, lock, String(config.lockMinutes)]
      );
      audit(user.id, lock ? 'account_locked' : 'login_failed', req);
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Verify your email before logging in', code: 'EMAIL_NOT_VERIFIED' });
    }

    await query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
    const session = await withTransaction((client) => issueRefreshToken(client, user, req));
    setRefreshCookie(res, session.raw);
    audit(user.id, 'login', req);
    res.json({ accessToken: signAccessToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Rotates the refresh token. Presenting an already-used token means it was likely
// stolen, so the whole token family is revoked.
router.post('/refresh', requireCustomHeader, async (req, res, next) => {
  try {
    const raw = req.cookies[COOKIE];
    if (!raw) return res.status(401).json({ error: 'No session' });

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [sha256(raw)]);
      const current = rows[0];
      if (!current) return { status: 401 };

      if (current.revoked_at) {
        await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL', [
          current.family_id,
        ]);
        return { status: 401, reuse: current.user_id };
      }
      if (new Date(current.expires_at) < new Date()) return { status: 401 };

      const { rows: users } = await client.query('SELECT * FROM users WHERE id = $1', [current.user_id]);
      if (!users[0]) return { status: 401 };

      const next = await issueRefreshToken(client, users[0], req, current.family_id);
      await client.query('UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2 WHERE id = $1', [current.id, next.id]);
      return { status: 200, user: users[0], raw: next.raw };
    });

    if (result.status !== 200) {
      clearRefreshCookie(res);
      if (result.reuse) audit(result.reuse, 'refresh_token_reuse_detected', req);
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    setRefreshCookie(res, result.raw);
    res.json({ accessToken: signAccessToken(result.user), user: publicUser(result.user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireCustomHeader, async (req, res, next) => {
  try {
    const raw = req.cookies[COOKIE];
    if (raw) {
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE revoked_at IS NULL AND family_id IN (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
        [sha256(raw)]
      );
    }
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/logout-all', authenticate, requireCustomHeader, async (req, res, next) => {
  try {
    await withTransaction((client) => revokeAllForUser(client, req.user.id));
    clearRefreshCookie(res);
    audit(req.user.id, 'logout_all', req);
    res.json({ message: 'Signed out of all devices.' });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', authLimiter, validate(schemas.email), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [req.body.email]);
    if (rows[0]) {
      const raw = await withTransaction(async (client) => {
        await client.query(
          "UPDATE one_time_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = 'reset_password' AND used_at IS NULL",
          [rows[0].id]
        );
        return createOneTimeToken(client, rows[0].id, 'reset_password', 30);
      });
      await sendPasswordResetEmail(rows[0], raw);
      audit(rows[0].id, 'password_reset_requested', req);
    }
    res.json(GENERIC_RESET);
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', authLimiter, validate(schemas.reset), async (req, res, next) => {
  try {
    const hash = await bcrypt.hash(req.body.password, config.bcryptRounds);
    const userId = await withTransaction(async (client) => {
      const id = await consumeOneTimeToken(client, req.body.token, 'reset_password');
      if (!id) return null;
      await client.query(
        'UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL, email_verified = TRUE WHERE id = $1',
        [id, hash]
      );
      await revokeAllForUser(client, id); // sign out every device
      return id;
    });
    if (!userId) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    audit(userId, 'password_reset', req);
    res.json({ message: 'Password updated. Log in with your new password.' });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', authenticate, validate(schemas.change), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(req.body.newPassword, config.bcryptRounds);
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, hash]);
      await revokeAllForUser(client, user.id);
    });
    clearRefreshCookie(res);
    audit(user.id, 'password_changed', req);
    res.json({ message: 'Password changed. Log in again to continue.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
