import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireRole } from '../auth.js';
import { HttpError, normalizeMobile } from '../lib/util.js';
import { parse, z, id } from '../lib/validate.js';

const r = Router();
const COLS = 'id, name, username, role, mobile, active, created_at';

// All staff can list users (to assign mechanics).
r.get('/', async (_req, res) => {
  const { rows } = await query(`SELECT ${COLS} FROM users ORDER BY active DESC, role, name`);
  res.json(rows);
});

const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'letters, numbers, . _ - only'),
  password: z.string().min(6).max(100),
  role: z.enum(['admin', 'advisor', 'mechanic']),
  mobile: z.string().optional().nullable(),
});

r.post('/', requireRole('admin'), async (req, res) => {
  const d = parse(userSchema, req.body);
  const hash = await bcrypt.hash(d.password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, username, password_hash, role, mobile) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`,
    [d.name, d.username.toLowerCase(), hash, d.role, normalizeMobile(d.mobile)],
  );
  res.status(201).json(rows[0]);
});

r.patch('/:id', requireRole('admin'), async (req, res) => {
  const userId = parse(id, req.params.id);
  const d = parse(userSchema.partial().extend({ active: z.boolean().optional() }), req.body);
  if (userId === req.user.id && (d.active === false || (d.role && d.role !== 'admin'))) {
    throw new HttpError(400, 'You cannot disable or demote your own account');
  }
  const sets = [];
  const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (d.name !== undefined) add('name', d.name);
  if (d.username !== undefined) add('username', d.username.toLowerCase());
  if (d.role !== undefined) add('role', d.role);
  if (d.mobile !== undefined) add('mobile', normalizeMobile(d.mobile));
  if (d.active !== undefined) add('active', d.active);
  if (d.password) add('password_hash', await bcrypt.hash(d.password, 10));
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  vals.push(userId);
  const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${COLS}`, vals);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json(rows[0]);
});

// Any user can change their own password.
r.post('/me/password', async (req, res) => {
  const d = parse(z.object({ current: z.string().min(1), password: z.string().min(6) }), req.body);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(d.current, rows[0].password_hash))) throw new HttpError(400, 'Current password is wrong');
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(d.password, 10), req.user.id]);
  res.json({ ok: true });
});

export default r;
