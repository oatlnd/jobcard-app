import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, z, id, money } from '../lib/validate.js';
import { emitPartsChanged } from '../realtime.js';

const r = Router();

export const PART_CATEGORIES = [
  'Engine Components', 'Transmission', 'Electrical', 'Body Parts', 'Suspension', 'Brakes',
  'Oils & Lubricants', 'Filters', 'Tyres & Tubes', 'Accessories', 'General',
];

r.get('/categories', (_req, res) => res.json(PART_CATEGORIES));

r.get('/', async (req, res) => {
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
  res.json(rows);
});

const partSchema = z.object({
  part_no: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  category: z.enum(PART_CATEGORIES).default('General'),
  unit_price: money,
  stock_qty: z.coerce.number().int().min(0).default(0),
  reorder_level: z.coerce.number().int().min(0).default(0),
});

r.post('/', requireRole('admin', 'advisor'), async (req, res) => {
  const d = parse(partSchema, req.body);
  const { rows } = await query(
    `INSERT INTO parts (part_no, name, category, unit_price, stock_qty, reorder_level)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.part_no, d.name, d.category, d.unit_price, d.stock_qty, d.reorder_level],
  );
  emitPartsChanged();
  res.status(201).json(rows[0]);
});

r.patch('/:id', requireRole('admin', 'advisor'), async (req, res) => {
  const pid = parse(id, req.params.id);
  const d = parse(partSchema.partial().extend({ active: z.boolean().optional() }), req.body);
  const cols = ['part_no', 'name', 'category', 'unit_price', 'stock_qty', 'reorder_level', 'active'].filter((k) => d[k] !== undefined);
  if (!cols.length) throw new HttpError(400, 'Nothing to update');
  const { rows } = await query(
    `UPDATE parts SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
    [...cols.map((k) => d[k]), pid],
  );
  if (!rows[0]) throw new HttpError(404, 'Part not found');
  emitPartsChanged();
  res.json(rows[0]);
});

// Receive stock (+) or write off (-)
r.post('/:id/stock', requireRole('admin', 'advisor'), async (req, res) => {
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
