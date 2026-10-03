import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, normalizeRegNo } from '../lib/util.js';
import { parse, z, id } from '../lib/validate.js';
import { bikeSchema } from './customers.js';

const r = Router();

// Look up a bike by registration number (used when opening a new job card)
r.get('/lookup', requirePerm('jobs.create', 'customers.view'), async (req, res) => {
  const reg = normalizeRegNo(req.query.reg);
  if (!reg) throw new HttpError(400, 'reg is required');
  const { rows } = await query(
    `SELECT b.*, row_to_json(c.*) AS customer,
       (SELECT json_build_object('id', j.id, 'job_no', j.job_no, 'status', j.status)
          FROM job_cards j WHERE j.bike_id = b.id AND j.status <> 'CANCELLED' AND j.delivery_status <> 'DELIVERED'
          ORDER BY j.id DESC LIMIT 1) AS open_job
     FROM bikes b JOIN customers c ON c.id = b.customer_id WHERE b.reg_no = $1`,
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
    `INSERT INTO bikes (customer_id, reg_no, model, year, engine_no, chassis_no, last_odometer)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.customer_id, d.reg_no, d.model, d.year, d.engine_no, d.chassis_no, d.last_odometer],
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
  const cols = ['reg_no', 'model', 'year', 'engine_no', 'chassis_no', 'last_odometer', 'customer_id', 'next_service_due_date']
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
