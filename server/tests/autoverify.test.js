process.env.AUTO_VERIFY_EMAIL = '1';

const request = require('supertest');
const app = require('../src/app');
const { pool, query } = require('../src/db');
const { migrate } = require('../src/migrate');
const { outbox } = require('../src/utils/mailer');

beforeAll(migrate);
beforeEach(async () => {
  await query('TRUNCATE users, refresh_tokens, one_time_tokens, audit_log RESTART IDENTITY CASCADE');
  outbox.length = 0;
});
afterAll(() => pool.end());

test('demo mode: new accounts can log in immediately and no email is sent', async () => {
  const reg = await request(app).post('/api/auth/register').send({ name: 'Demo', email: 'demo@example.com', password: 'Sup3rSecretPass' });
  expect(reg.status).toBe(201);
  expect(reg.body.autoVerified).toBe(true);
  expect(outbox).toHaveLength(0);

  const res = await request(app).post('/api/auth/login').send({ email: 'demo@example.com', password: 'Sup3rSecretPass' });
  expect(res.status).toBe(200);
  expect(res.body.user.emailVerified).toBe(true);
});
