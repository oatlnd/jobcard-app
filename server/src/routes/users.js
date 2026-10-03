import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, normalizeMobile } from '../lib/util.js';
import { parse, z, id } from '../lib/validate.js';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '../lib/permissions.js';

const r = Router();
const COLS = `u.id, u.name, u.username, u.role_id, r.name AS role, u.mobile, u.active, u.created_at,
  ('jobs.status' = ANY(r.permissions)) AS can_work,
  ('jobs.status' = ANY(r.permissions) AND NOT ('jobs.view_all' = ANY(r.permissions))) AS is_mechanic`;

// All staff can list users (to assign mechanics).
r.get('/', async (_req, res) => {
  const { rows } = await query(`SELECT ${COLS} FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.active DESC, r.name, u.name`);
  res.json(rows);
});

// ----- Roles & permissions -----
r.get('/roles', async (_req, res) => {
  const { rows } = await query(
    `SELECT r.*, (SELECT count(*)::int FROM users u WHERE u.role_id = r.id AND u.active) AS user_count FROM roles r ORDER BY r.is_system DESC, r.name`,
  );
  res.json({ roles: rows, groups: PERMISSION_GROUPS });
});

const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().nullable(),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).default([]),
});

r.post('/roles', requirePerm('users.manage'), async (req, res) => {
  const d = parse(roleSchema, req.body);
  const { rows } = await query(
    'INSERT INTO roles (name, description, permissions) VALUES ($1,$2,$3) RETURNING *',
    [d.name, d.description, [...new Set(d.permissions)]],
  );
  res.status(201).json(rows[0]);
});

r.put('/roles/:id', requirePerm('users.manage'), async (req, res) => {
  const rid = parse(id, req.params.id);
  const d = parse(roleSchema, req.body);
  const cur = (await query('SELECT * FROM roles WHERE id = $1', [rid])).rows[0];
  if (!cur) throw new HttpError(404, 'Role not found');
  if (cur.is_system) throw new HttpError(400, 'The Admin role always has full access and cannot be changed');
  const { rows } = await query(
    'UPDATE roles SET name = $1, description = $2, permissions = $3 WHERE id = $4 RETURNING *',
    [d.name, d.description, [...new Set(d.permissions)], rid],
  );
  res.json(rows[0]);
});

r.delete('/roles/:id', requirePerm('users.manage'), async (req, res) => {
  const rid = parse(id, req.params.id);
  const { rows } = await query(
    `DELETE FROM roles WHERE id = $1 AND NOT is_system AND NOT EXISTS (SELECT 1 FROM users WHERE role_id = $1) RETURNING id`,
    [rid],
  );
  if (!rows[0]) throw new HttpError(400, 'Only unused, non-system roles can be deleted. Move its staff to another role first.');
  res.json({ ok: true });
});

// ----- Staff logins -----
const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'letters, numbers, . _ - only'),
  password: z.string().min(6).max(100),
  role_id: id,
  mobile: z.string().optional().nullable(),
});

async function isAdminRole(roleId) {
  const { rows } = await query('SELECT is_system FROM roles WHERE id = $1', [roleId]);
  if (!rows[0]) throw new HttpError(400, 'Role not found');
  return rows[0].is_system;
}

r.post('/', requirePerm('users.manage'), async (req, res) => {
  const d = parse(userSchema, req.body);
  await isAdminRole(d.role_id);
  const hash = await bcrypt.hash(d.password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, username, password_hash, role_id, mobile) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [d.name, d.username.toLowerCase(), hash, d.role_id, normalizeMobile(d.mobile)],
  );
  const out = await query(`SELECT ${COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [rows[0].id]);
  res.status(201).json(out.rows[0]);
});

r.patch('/:id', requirePerm('users.manage'), async (req, res) => {
  const userId = parse(id, req.params.id);
  const d = parse(userSchema.partial().extend({ active: z.boolean().optional() }), req.body);
  if (userId === req.user.id) {
    if (d.active === false) throw new HttpError(400, 'You cannot disable your own account');
    if (d.role_id && d.role_id !== req.user.role_id) throw new HttpError(400, 'You cannot change your own role');
  }
  if (d.role_id) await isAdminRole(d.role_id);
  const sets = [];
  const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (d.name !== undefined) add('name', d.name);
  if (d.username !== undefined) add('username', d.username.toLowerCase());
  if (d.role_id !== undefined) add('role_id', d.role_id);
  if (d.mobile !== undefined) add('mobile', normalizeMobile(d.mobile));
  if (d.active !== undefined) add('active', d.active);
  if (d.password) add('password_hash', await bcrypt.hash(d.password, 10));
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  vals.push(userId);
  const { rowCount } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  if (!rowCount) throw new HttpError(404, 'User not found');
  const out = await query(`SELECT ${COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [userId]);
  res.json(out.rows[0]);
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
