import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, normalizeRegNo } from '../lib/util.js';
import { parse, z, id } from '../lib/validate.js';
import { bikeSchema, bikeRegNo } from './customers.js';

const r = Router();

// Look up a bike by registration, chassis or engine number (used when opening a new job card)
r.get('/lookup', requirePerm('jobs.create', 'customers.view'), async (req, res) => {
  const reg = normalizeRegNo(req.query.reg);
  if (!reg) throw new HttpError(400, 'reg is required');
  const { rows } = await query(
    `SELECT b.*, row_to_json(c.*) AS customer,
       (SELECT json_build_object('id', j.id, 'job_no', j.job_no, 'status', j.status)
          FROM job_cards j WHERE j.bike_id = b.id AND j.status <> 'CANCELLED' AND j.delivery_status <> 'DELIVERED'
          ORDER BY j.id DESC LIMIT 1) AS open_job,
       COALESCE((SELECT json_agg(json_build_object('kind', j.service_kind, 'job_no', j.job_no, 'date', j.created_at::date, 'odometer', j.odometer) ORDER BY j.id)
          FROM job_cards j WHERE j.bike_id = b.id AND j.service_kind IN ('FREE_1','FREE_2') AND j.status <> 'CANCELLED'), '[]') AS free_services,
       (SELECT g.name FROM bike_models m JOIN bike_groups g ON g.id = m.group_id WHERE lower(m.name) = lower(b.model) LIMIT 1) AS group_name,
       (b.sale_date + make_interval(months => COALESCE((SELECT (value->>'months')::int FROM settings WHERE key = 'warranty'), 24)))::date AS warranty_until
     FROM bikes b JOIN customers c ON c.id = b.customer_id
     WHERE b.reg_no = $1
        OR (length($1) >= 5 AND (regexp_replace(upper(COALESCE(b.chassis_no,'')), '[^A-Z0-9]', '', 'g') = $1
                              OR regexp_replace(upper(COALESCE(b.engine_no,'')), '[^A-Z0-9]', '', 'g') = $1))
     ORDER BY (b.reg_no = $1) DESC LIMIT 1`,
    [reg],
  );
  res.json(rows[0] || null);
});

// Bikes due for service (for the reminders list)
r.get('/due', requirePerm('messages.view', 'customers.view'), async (req, res) => {
  const days = Math.min(Number(req.query.days) || 14, 365);
  const { rows } = await query(
    `SELECT b.*, c.name AS customer_name, c.mobile
     FROM bikes b JOIN customers c ON c.id = b.customer_id
     WHERE b.next_service_due_date IS NOT NULL AND b.next_service_due_date <= CURRENT_DATE + $1::int
     ORDER BY b.next_service_due_date`,
    [days],
  );
  res.json(rows);
});

r.post('/', requirePerm('customers.manage'), async (req, res) => {
  const d = parse(bikeSchema.extend({ customer_id: id }), req.body);
  const { rows } = await query(
    `INSERT INTO bikes (customer_id, reg_no, model, year, engine_no, chassis_no, last_odometer, sale_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.customer_id, bikeRegNo(d), d.model, d.year, d.engine_no, d.chassis_no, d.last_odometer, d.sale_date],
  );
  res.status(201).json(rows[0]);
});

r.patch('/:id', requirePerm('customers.manage'), async (req, res) => {
  const bid = parse(id, req.params.id);
  const d = parse(
    bikeSchema.partial().extend({
      customer_id: id.optional(),
      next_service_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    }),
    req.body,
  );
  if (d.reg_no === null) delete d.reg_no; // keep the current number
  const cols = ['reg_no', 'model', 'year', 'engine_no', 'chassis_no', 'last_odometer', 'sale_date', 'customer_id', 'next_service_due_date']
    .filter((k) => d[k] !== undefined);
  if (!cols.length) throw new HttpError(400, 'Nothing to update');
  const { rows } = await query(
    `UPDATE bikes SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
    [...cols.map((k) => d[k]), bid],
  );
  if (!rows[0]) throw new HttpError(404, 'Bike not found');
  res.json(rows[0]);
});

export default r;
