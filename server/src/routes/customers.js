import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, normalizeMobile, normalizeRegNo } from '../lib/util.js';
import { parse, z, id, optText } from '../lib/validate.js';

const r = Router();

export const mobileField = z.string().transform((v, ctx) => {
  const m = normalizeMobile(v);
  if (!m) ctx.addIssue({ code: 'custom', message: 'enter a valid Sri Lankan mobile number' });
  return m;
});

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mobile: mobileField,
  suburb: optText,
  email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  preferred_lang: z.enum(['en', 'ta']).default('en'),
  notes: optText,
});

const yearNow = new Date().getFullYear() + 1;
export const bikeSchema = z.object({
  reg_no: z.string().transform((v, ctx) => {
    const n = normalizeRegNo(v);
    if (n.length < 4) ctx.addIssue({ code: 'custom', message: 'enter the bike number' });
    return n;
  }),
  model: z.string().trim().min(1).max(80),
  year: z.coerce.number().int().min(1980).max(yearNow).optional().nullable(),
  engine_no: optText,
  chassis_no: optText,
  last_odometer: z.coerce.number().int().min(0).optional().nullable(),
});

// List / search customers by name, mobile or bike number
r.get('/', requirePerm('customers.view'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [];
  const conds = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    conds.push(`lower(c.name) LIKE $${params.length}`);
    const reg = normalizeRegNo(q);
    if (reg.length >= 2) {
      params.push(`%${reg}%`);
      conds.push(`EXISTS (SELECT 1 FROM bikes b WHERE b.customer_id = c.id AND b.reg_no LIKE $${params.length})`);
    }
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) {
      params.push(`%${digits.replace(/^94/, '').replace(/^0/, '')}%`);
      conds.push(`c.mobile LIKE $${params.length}`);
    }
  }
  const where = conds.length ? `WHERE ${conds.join(' OR ')}` : '';
  const { rows } = await query(
    `SELECT c.*,
       COALESCE((SELECT json_agg(json_build_object('id', b.id, 'reg_no', b.reg_no, 'model', b.model) ORDER BY b.id)
                 FROM bikes b WHERE b.customer_id = c.id), '[]') AS bikes
     FROM customers c ${where}
     ORDER BY c.created_at DESC LIMIT 100`,
    params,
  );
  res.json(rows);
});

r.get('/:id', requirePerm('customers.view'), async (req, res) => {
  const cid = parse(id, req.params.id);
  const { rows } = await query('SELECT * FROM customers WHERE id = $1', [cid]);
  if (!rows[0]) throw new HttpError(404, 'Customer not found');
  const bikes = await query('SELECT * FROM bikes WHERE customer_id = $1 ORDER BY id', [cid]);
  const jobs = await query(
    `SELECT j.id, j.job_no, j.status, j.delivery_status, j.created_at, j.delivered_at, b.reg_no, b.model, i.total,
       (SELECT string_agg(description, ', ' ORDER BY id) FROM job_items WHERE job_card_id = j.id AND item_type IN ('service','custom_service')) AS services
     FROM job_cards j JOIN bikes b ON b.id = j.bike_id LEFT JOIN invoices i ON i.job_card_id = j.id
     WHERE j.customer_id = $1 ORDER BY j.created_at DESC`,
    [cid],
  );
  res.json({ ...rows[0], bikes: bikes.rows, jobs: jobs.rows });
});

// Create customer, optionally with their first bike
r.post('/', requirePerm('customers.manage'), async (req, res) => {
  const d = parse(customerSchema.extend({ bike: bikeSchema.optional() }), req.body);
  const result = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO customers (name, mobile, suburb, email, preferred_lang, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [d.name, d.mobile, d.suburb, d.email, d.preferred_lang, d.notes],
    );
    const customer = rows[0];
    let bike = null;
    if (d.bike) {
      const b = await c.query(
        `INSERT INTO bikes (customer_id, reg_no, model, year, engine_no, chassis_no, last_odometer)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [customer.id, d.bike.reg_no, d.bike.model, d.bike.year, d.bike.engine_no, d.bike.chassis_no, d.bike.last_odometer],
      );
      bike = b.rows[0];
    }
    return { ...customer, bikes: bike ? [bike] : [] };
  });
  res.status(201).json(result);
});

r.patch('/:id', requirePerm('customers.manage'), async (req, res) => {
  const cid = parse(id, req.params.id);
  const d = parse(customerSchema.partial(), req.body);
  const cols = ['name', 'mobile', 'suburb', 'email', 'preferred_lang', 'notes'].filter((k) => d[k] !== undefined);
  if (!cols.length) throw new HttpError(400, 'Nothing to update');
  const { rows } = await query(
    `UPDATE customers SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
    [...cols.map((k) => d[k]), cid],
  );
  if (!rows[0]) throw new HttpError(404, 'Customer not found');
  res.json(rows[0]);
});

export default r;
