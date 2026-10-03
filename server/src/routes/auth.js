import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { signToken, requireAuth } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, z } from '../lib/validate.js';

const r = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

r.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = parse(
    z.object({ username: z.string().trim().min(1), password: z.string().min(1) }),
    req.body,
  );
  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  const user = rows[0];
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Wrong username or password');
  }
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default r;
