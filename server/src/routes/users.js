const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

const toUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  emailVerified: u.email_verified,
  createdAt: u.created_at,
});

router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: toUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// Admin only: paginated user list with optional search
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const search = `%${String(req.query.search || '').trim().toLowerCase()}%`;

    const [{ rows }, { rows: count }] = await Promise.all([
      query(
        `SELECT * FROM users WHERE LOWER(email) LIKE $1 OR LOWER(name) LIKE $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [search, limit, (page - 1) * limit]
      ),
      query('SELECT COUNT(*)::int AS total FROM users WHERE LOWER(email) LIKE $1 OR LOWER(name) LIKE $1', [search]),
    ]);
    res.json({ users: rows.map(toUser), page, limit, total: count[0].total });
  } catch (err) {
    next(err);
  }
});

// Admin only: change a user's role (admins cannot change their own)
router.patch(
  '/:id/role',
  requireRole('admin'),
  validate(z.object({ role: z.enum(['user', 'admin']) })),
  async (req, res, next) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid user id' });
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role' });
      const { rows } = await query('UPDATE users SET role = $2 WHERE id = $1 RETURNING *', [req.params.id, req.body.role]);
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      res.json({ user: toUser(rows[0]) });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
