import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { signToken, requireAuth, loadUser } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, z } from '../lib/validate.js';

const r = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

r.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = parse(
    z.object({ username: z.string().trim().min(1), password: z.string().min(1) }),
    req.body,
  );
  const { rows } = await query('SELECT id, password_hash, active FROM users WHERE lower(username) = lower($1)', [username]);
  const row = rows[0];
  if (!row || !row.active || !(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, 'Wrong username or password');
  }
  const user = await loadUser(row.id);
  res.json({ token: signToken(user), user });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default r;
