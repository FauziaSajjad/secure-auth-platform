const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { pool, query } = require('../src/db');
const { migrate } = require('../src/migrate');
const { outbox } = require('../src/utils/mailer');

const PASSWORD = 'Sup3rSecretPass';
const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

const tokenFromLastEmail = () => outbox[outbox.length - 1].text.match(/token=([\w-]+)/)[1];
const cookieOf = (res) => res.headers['set-cookie'].find((c) => c.startsWith('refresh_token=')).split(';')[0];

const register = (email, password = PASSWORD) =>
  request(app).post('/api/auth/register').send({ name: 'Test User', email, password });
const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

async function createVerifiedUser(email) {
  await register(email);
  await request(app).post('/api/auth/verify-email').send({ token: tokenFromLastEmail() });
}

async function loginSession(email) {
  await createVerifiedUser(email);
  const res = await login(email);
  return { accessToken: res.body.accessToken, cookie: cookieOf(res), res };
}

beforeAll(migrate);
beforeEach(async () => {
  await query('TRUNCATE users, refresh_tokens, one_time_tokens, audit_log RESTART IDENTITY CASCADE');
  outbox.length = 0;
});
afterAll(() => pool.end());

describe('registration and verification', () => {
  test('registers a user and sends a verification email', async () => {
    const res = await register('a@example.com');
    expect(res.status).toBe(201);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe('a@example.com');
  });

  test('does not reveal whether an email is already registered', async () => {
    const first = await register('a@example.com');
    const second = await register('a@example.com');
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(outbox).toHaveLength(1);
  });

  test('rejects weak passwords and bad emails', async () => {
    expect((await register('a@example.com', 'short1')).status).toBe(400);
    expect((await register('a@example.com', 'onlyletterslong')).status).toBe(400);
    expect((await register('not-an-email')).status).toBe(400);
  });

  test('stores only a bcrypt hash, never the password', async () => {
    await register('a@example.com');
    const { rows } = await query('SELECT password_hash FROM users');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
  });

  test('blocks login until the email is verified, and tokens are single-use', async () => {
    await register('a@example.com');
    const blocked = await login('a@example.com');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

    const token = tokenFromLastEmail();
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
    expect((await login('a@example.com')).status).toBe(200);
  });
});

describe('login and sessions', () => {
  test('returns an access token and an httpOnly SameSite=Strict refresh cookie', async () => {
    const { res } = await loginSession('a@example.com');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('a@example.com');
    expect(res.body.user.password_hash).toBeUndefined();
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('refresh_token='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  test('gives the same error for unknown emails and wrong passwords', async () => {
    await createVerifiedUser('a@example.com');
    const wrong = await login('a@example.com', 'WrongPassword1');
    const unknown = await login('nobody@example.com');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  test('locks the account after 5 failed attempts', async () => {
    await createVerifiedUser('a@example.com');
    for (let i = 0; i < 5; i++) await login('a@example.com', 'WrongPassword1');
    const res = await login('a@example.com'); // correct password, still locked
    expect(res.status).toBe(429);
  });

  test('protects /me and rejects tampered or foreign tokens', async () => {
    const { accessToken } = await loginSession('a@example.com');
    expect((await request(app).get('/api/users/me')).status).toBe(401);
    expect((await request(app).get('/api/users/me').set('Authorization', 'Bearer nope')).status).toBe(401);

    const forged = jwt.sign({ role: 'admin' }, 'a-different-secret-a-different-secret-12', { subject: 'x', issuer: 'secure-auth-platform' });
    expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);

    const ok = await request(app).get('/api/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('a@example.com');
  });
});

describe('refresh token rotation', () => {
  test('rotates the refresh token and issues a new access token', async () => {
    const { cookie } = await loginSession('a@example.com');
    const res = await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(cookieOf(res)).not.toBe(cookie);
  });

  test('requires the X-Requested-With header (CSRF defence)', async () => {
    const { cookie } = await loginSession('a@example.com');
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  test('reusing an old refresh token revokes the whole token family', async () => {
    const { cookie: first } = await loginSession('a@example.com');
    const rotated = await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', first);
    const second = cookieOf(rotated);

    const reuse = await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', first);
    expect(reuse.status).toBe(401);

    const afterReuse = await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', second);
    expect(afterReuse.status).toBe(401);
  });

  test('logout revokes the refresh token', async () => {
    const { cookie } = await loginSession('a@example.com');
    expect((await request(app).post('/api/auth/logout').set(XHR).set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie)).status).toBe(401);
  });
});

describe('password reset and change', () => {
  test('reset flow updates the password and signs out all devices', async () => {
    const { cookie } = await loginSession('a@example.com');
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@example.com' });
    const token = tokenFromLastEmail();

    const NEW_PASSWORD = 'BrandNewPass99';
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD })).status).toBe(400);

    expect((await login('a@example.com')).status).toBe(401);
    expect((await login('a@example.com', NEW_PASSWORD)).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie)).status).toBe(401);
  });

  test('forgot-password gives the same response for unknown emails', async () => {
    await createVerifiedUser('a@example.com');
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'a@example.com' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  test('change-password needs the current password', async () => {
    const { accessToken } = await loginSession('a@example.com');
    const auth = { Authorization: `Bearer ${accessToken}` };
    const bad = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: 'WrongPassword1', newPassword: 'AnotherPass123' });
    expect(bad.status).toBe(400);
    const good = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: PASSWORD, newPassword: 'AnotherPass123' });
    expect(good.status).toBe(200);
  });
});

describe('role-based access control', () => {
  test('regular users cannot list users; admins can', async () => {
    const user = await loginSession('user@example.com');
    const denied = await request(app).get('/api/users').set('Authorization', `Bearer ${user.accessToken}`);
    expect(denied.status).toBe(403);

    await query("UPDATE users SET role = 'admin' WHERE email = 'user@example.com'");
    const relog = await login('user@example.com');
    const allowed = await request(app).get('/api/users').set('Authorization', `Bearer ${relog.body.accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.total).toBe(1);
  });

  test('admins can change roles but not their own', async () => {
    await createVerifiedUser('other@example.com');
    await createVerifiedUser('admin@example.com');
    await query("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'");
    const adminLogin = await login('admin@example.com');
    const auth = { Authorization: `Bearer ${adminLogin.body.accessToken}` };

    const { rows } = await query("SELECT id FROM users WHERE email = 'other@example.com'");
    const promote = await request(app).patch(`/api/users/${rows[0].id}/role`).set(auth).send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe('admin');

    const self = await query("SELECT id FROM users WHERE email = 'admin@example.com'");
    expect((await request(app).patch(`/api/users/${self.rows[0].id}/role`).set(auth).send({ role: 'user' })).status).toBe(400);
  });
});

describe('rate limiting', () => {
  afterEach(() => delete process.env.TEST_RATE_LIMIT);

  test('throttles repeated auth attempts', async () => {
    process.env.TEST_RATE_LIMIT = '1';
    let last;
    for (let i = 0; i < 21; i++) last = await login('nobody@example.com');
    expect(last.status).toBe(429);
  });
});
