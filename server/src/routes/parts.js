import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm, hasPerm } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, z, id, money, optText } from '../lib/validate.js';
import { emitPartsChanged } from '../realtime.js';
import { assertLookup } from './masters.js';

const r = Router();

const canSeeCost = (u) => hasPerm(u, 'parts.manage') || hasPerm(u, 'purchasing.view');
const strip = (u) => (p) => {
  const out = { ...p };
  if (!canSeeCost(u)) delete out.cost_price;
  if (!hasPerm(u, 'jobs.pricing') && !hasPerm(u, 'parts.manage')) delete out.unit_price;
  return out;
};

r.get('/categories', async (_req, res) => {
  const { rows } = await query(`SELECT name FROM lookups WHERE type = 'part_category' AND active ORDER BY sort_order, name`);
  res.json(rows.map((r) => r.name));
});

r.get('/', requirePerm('parts.view', 'jobs.items', 'purchasing.view'), async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const params = [];
  const where = ['active'];
  if (q) { params.push(`%${q}%`); where.push(`(lower(name) LIKE $${params.length} OR lower(part_no) LIKE $${params.length})`); }
  if (req.query.category) { params.push(req.query.category); where.push(`category = $${params.length}`); }
  if (req.query.low === '1') where.push('stock_qty <= reorder_level');
  const { rows } = await query(
    `SELECT * FROM parts WHERE ${where.join(' AND ')} ORDER BY category, name LIMIT 500`,
    params,
  );
  res.json(rows.map(strip(req.user)));
});

const partSchema = z.object({
  part_no: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).default('General'),
  unit: z.string().trim().min(1).max(20).default('Nos'),
  brand: optText,
  location: optText,
  unit_price: money,
  cost_price: money.default(0),
  stock_qty: z.coerce.number().int().min(0).default(0),
  reorder_level: z.coerce.number().int().min(0).default(0),
});

r.post('/', requirePerm('parts.manage'), async (req, res) => {
  const d = parse(partSchema, req.body);
  await assertLookup('part_category', d.category);
  const { rows } = await query(
    `INSERT INTO parts (part_no, name, category, unit, brand, location, unit_price, cost_price, stock_qty, reorder_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [d.part_no, d.name, d.category, d.unit, d.brand, d.location, d.unit_price, d.cost_price, d.stock_qty, d.reorder_level],
  );
  emitPartsChanged();
  res.status(201).json(rows[0]);
});

r.patch('/:id', requirePerm('parts.manage'), async (req, res) => {
  const pid = parse(id, req.params.id);
  const d = parse(partSchema.partial().omit({ stock_qty: true }).extend({ active: z.boolean().optional() }), req.body);
  if (d.category) await assertLookup('part_category', d.category);
  const cols = ['part_no', 'name', 'category', 'unit', 'brand', 'location', 'unit_price', 'cost_price', 'reorder_level', 'active'].filter((k) => d[k] !== undefined);
  if (!cols.length) throw new HttpError(400, 'Nothing to update');
  const { rows } = await query(
    `UPDATE parts SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
    [...cols.map((k) => d[k]), pid],
  );
  if (!rows[0]) throw new HttpError(404, 'Part not found');
  emitPartsChanged();
  res.json(rows[0]);
});

// Manual stock adjustment (+ found / - write off). Normal receiving goes through GRN.
r.post('/:id/stock', requirePerm('stock.adjust'), async (req, res) => {
  const pid = parse(id, req.params.id);
  const { delta } = parse(z.object({ delta: z.coerce.number().int().refine((n) => n !== 0, 'cannot be 0') }), req.body);
  const { rows } = await query(
    'UPDATE parts SET stock_qty = stock_qty + $1 WHERE id = $2 AND stock_qty + $1 >= 0 RETURNING *',
    [delta, pid],
  );
  if (!rows[0]) throw new HttpError(400, 'Part not found or stock would go below zero');
  emitPartsChanged();
  res.json(rows[0]);
});

export default r;
