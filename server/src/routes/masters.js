// Maintainable dropdown lists: service types (with default price) and lookup lists.
import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, z, id, money, optText } from '../lib/validate.js';

const r = Router();
export const LOOKUP_TYPES = ['part_category', 'expense_category', 'designation', 'unit'];

// ----- Service types -----
r.get('/service-types', async (req, res) => {
  const all = req.query.all === '1';
  const { rows } = await query(
    `SELECT s.*, (SELECT count(*)::int FROM job_items ji WHERE ji.service_type_id = s.id) AS used
     FROM service_types s ${all ? '' : 'WHERE active'} ORDER BY s.sort_order, s.name`,
  );
  res.json(rows);
});

const stSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: optText,
  default_price: money.default(0),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

r.post('/service-types', requirePerm('masters.manage'), async (req, res) => {
  const d = parse(stSchema, req.body);
  const { rows } = await query(
    'INSERT INTO service_types (name, description, default_price, sort_order, active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [d.name, d.description, d.default_price, d.sort_order, d.active],
  );
  res.status(201).json(rows[0]);
});

r.put('/service-types/:id', requirePerm('masters.manage'), async (req, res) => {
  const sid = parse(id, req.params.id);
  const d = parse(stSchema, req.body);
  const { rows } = await query(
    'UPDATE service_types SET name=$1, description=$2, default_price=$3, sort_order=$4, active=$5 WHERE id=$6 RETURNING *',
    [d.name, d.description, d.default_price, d.sort_order, d.active, sid],
  );
  if (!rows[0]) throw new HttpError(404, 'Service type not found');
  res.json(rows[0]);
});

// Delete if never used; otherwise it is deactivated (kept for history)
r.delete('/service-types/:id', requirePerm('masters.manage'), async (req, res) => {
  const sid = parse(id, req.params.id);
  const used = (await query('SELECT 1 FROM job_items WHERE service_type_id = $1 LIMIT 1', [sid])).rows[0];
  if (used) {
    await query('UPDATE service_types SET active = FALSE WHERE id = $1', [sid]);
    return res.json({ ok: true, deactivated: true });
  }
  await query('DELETE FROM service_types WHERE id = $1', [sid]);
  res.json({ ok: true, deleted: true });
});

// ----- Lookup lists -----
r.get('/lookups', async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.type) { params.push(req.query.type); where.push(`type = $${params.length}`); }
  if (req.query.all !== '1') where.push('active');
  const { rows } = await query(
    `SELECT * FROM lookups ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY type, sort_order, name`,
    params,
  );
  res.json(rows);
});

const lkSchema = z.object({
  type: z.enum(LOOKUP_TYPES),
  name: z.string().trim().min(1).max(100),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

r.post('/lookups', requirePerm('masters.manage'), async (req, res) => {
  const d = parse(lkSchema, req.body);
  const { rows } = await query('INSERT INTO lookups (type, name, sort_order, active) VALUES ($1,$2,$3,$4) RETURNING *', [d.type, d.name, d.sort_order, d.active]);
  res.status(201).json(rows[0]);
});

r.put('/lookups/:id', requirePerm('masters.manage'), async (req, res) => {
  const lid = parse(id, req.params.id);
  const d = parse(lkSchema.omit({ type: true }), req.body);
  const cur = (await query('SELECT * FROM lookups WHERE id = $1', [lid])).rows[0];
  if (!cur) throw new HttpError(404, 'Not found');
  const { rows } = await query('UPDATE lookups SET name=$1, sort_order=$2, active=$3 WHERE id=$4 RETURNING *', [d.name, d.sort_order, d.active, lid]);
  // Keep existing records in step when a category is renamed
  if (cur.name !== d.name) {
    if (cur.type === 'part_category') await query('UPDATE parts SET category = $1 WHERE category = $2', [d.name, cur.name]);
    if (cur.type === 'expense_category') await query('UPDATE expenses SET category = $1 WHERE category = $2', [d.name, cur.name]);
    if (cur.type === 'designation') await query('UPDATE employees SET designation = $1 WHERE designation = $2', [d.name, cur.name]);
    if (cur.type === 'unit') await query('UPDATE parts SET unit = $1 WHERE unit = $2', [d.name, cur.name]);
  }
  res.json(rows[0]);
});

r.delete('/lookups/:id', requirePerm('masters.manage'), async (req, res) => {
  const lid = parse(id, req.params.id);
  await query('UPDATE lookups SET active = FALSE WHERE id = $1', [lid]);
  res.json({ ok: true });
});

export async function assertLookup(type, name) {
  const { rows } = await query('SELECT 1 FROM lookups WHERE type = $1 AND name = $2', [type, name]);
  if (!rows[0]) throw new HttpError(400, `"${name}" is not in the ${type.replace('_', ' ')} list. Add it under Masters first.`);
}

export default r;
