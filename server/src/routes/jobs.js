import { Router } from 'express';
import { query, tx } from '../db.js';
import { requireRole } from '../auth.js';
import { HttpError, normalizeRegNo, addDays } from '../lib/util.js';
import { parse, z, id, optText, money } from '../lib/validate.js';
import { STATUSES, canTransition, ROLE_CAN_SET } from '../lib/status.js';
import { loadJob, assertEditable, computeTotals, OPEN_STATUSES } from '../lib/jobs.js';
import { queueNotification, statusUrl, fmtMoney, getSettings } from '../lib/notify.js';
import { emitJobChanged, emitPartsChanged } from '../realtime.js';
import { customerSchema, bikeSchema } from './customers.js';

const r = Router();

export const SERVICE_TYPES = [
  'Free Service', 'Paid Periodic Service', 'General Service', 'Repair', 'Accident Repair', 'Warranty', 'Inspection',
];
r.get('/service-types', (_req, res) => res.json(SERVICE_TYPES));

const LIST_SQL = `
  SELECT j.id, j.job_no, j.status, j.service_type, j.complaint, j.promised_at, j.created_at, j.updated_at,
         j.mechanic_id, m.name AS mechanic_name, b.reg_no, b.model, b.year, c.name AS customer_name, c.mobile,
         (SELECT COALESCE(sum(line_total),0) FROM job_items WHERE job_card_id = j.id) AS items_total
  FROM job_cards j
  JOIN bikes b ON b.id = j.bike_id
  JOIN customers c ON c.id = j.customer_id
  LEFT JOIN users m ON m.id = j.mechanic_id`;

// Board: all open jobs plus those delivered today
r.get('/board', async (req, res) => {
  const params = [];
  let mine = '';
  if (req.user.role === 'mechanic' && req.query.mine === '1') { params.push(req.user.id); mine = `AND j.mechanic_id = $1`; }
  const { rows } = await query(
    `${LIST_SQL}
     WHERE (j.status = ANY('{${OPEN_STATUSES.join(',')}}') OR (j.status = 'DELIVERED' AND j.delivered_at::date = CURRENT_DATE)) ${mine}
     ORDER BY j.promised_at NULLS LAST, j.created_at`,
    params,
  );
  res.json(rows);
});

// Search / history list
r.get('/', async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status && STATUSES.includes(req.query.status)) { params.push(req.query.status); where.push(`j.status = $${params.length}`); }
  const q = String(req.query.q || '').trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`, `%${normalizeRegNo(q)}%`);
    where.push(`(lower(j.job_no) LIKE $${params.length - 1} OR lower(c.name) LIKE $${params.length - 1} OR b.reg_no LIKE $${params.length})`);
  }
  if (req.query.from) { params.push(req.query.from); where.push(`j.created_at >= $${params.length}::date`); }
  if (req.query.to) { params.push(req.query.to); where.push(`j.created_at < $${params.length}::date + 1`); }
  const { rows } = await query(
    `${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY j.created_at DESC LIMIT 200`,
    params,
  );
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  res.json(await loadJob(parse(id, req.params.id)));
});

// Create a job card. Either pass bike_id (existing bike) or customer + bike (new walk-in).
const createSchema = z.object({
  bike_id: id.optional(),
  customer_id: id.optional(),
  customer: customerSchema.optional(),
  bike: bikeSchema.optional(),
  service_type: z.enum(SERVICE_TYPES).default('General Service'),
  complaint: optText,
  odometer: z.coerce.number().int().min(0).optional().nullable(),
  fuel_level: optText,
  mechanic_id: id.optional().nullable(),
  promised_at: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('').transform(() => null)),
});

r.post('/', requireRole('admin', 'advisor'), async (req, res) => {
  const d = parse(createSchema, req.body);
  const jobId = await tx(async (c) => {
    let bikeId = d.bike_id;
    let customer;
    if (bikeId) {
      const { rows } = await c.query('SELECT c.* FROM bikes b JOIN customers c ON c.id = b.customer_id WHERE b.id = $1', [bikeId]);
      if (!rows[0]) throw new HttpError(404, 'Bike not found');
      customer = rows[0];
    } else {
      if (!d.bike) throw new HttpError(400, 'Bike details are required');
      if (d.customer_id) {
        const { rows } = await c.query('SELECT * FROM customers WHERE id = $1', [d.customer_id]);
        if (!rows[0]) throw new HttpError(404, 'Customer not found');
        customer = rows[0];
      } else {
        if (!d.customer) throw new HttpError(400, 'Customer details are required');
        const { rows } = await c.query(
          `INSERT INTO customers (name, mobile, suburb, email, preferred_lang, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [d.customer.name, d.customer.mobile, d.customer.suburb, d.customer.email, d.customer.preferred_lang, d.customer.notes],
        );
        customer = rows[0];
      }
      const existing = await c.query('SELECT id FROM bikes WHERE reg_no = $1', [d.bike.reg_no]);
      if (existing.rows[0]) throw new HttpError(409, `Bike ${d.bike.reg_no} is already registered. Search for it instead.`);
      const b = await c.query(
        `INSERT INTO bikes (customer_id, reg_no, model, year, engine_no, chassis_no, last_odometer)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [customer.id, d.bike.reg_no, d.bike.model, d.bike.year, d.bike.engine_no, d.bike.chassis_no, d.odometer ?? d.bike.last_odometer],
      );
      bikeId = b.rows[0].id;
    }

    const open = await c.query(
      `SELECT job_no FROM job_cards WHERE bike_id = $1 AND status = ANY('{${OPEN_STATUSES.join(',')}}')`,
      [bikeId],
    );
    if (open.rows[0]) throw new HttpError(409, `This bike already has an open job card (${open.rows[0].job_no})`);

    const { rows } = await c.query(
      `INSERT INTO job_cards (job_no, bike_id, customer_id, service_type, complaint, odometer, fuel_level,
                              advisor_id, mechanic_id, promised_at, created_by)
       VALUES ('JC' || to_char(now(), 'YY') || '-' || lpad(nextval('job_no_seq')::text, 5, '0'),
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$7)
       RETURNING id, job_no`,
      [bikeId, customer.id, d.service_type, d.complaint, d.odometer, d.fuel_level, req.user.id, d.mechanic_id || null, d.promised_at || null],
    );
    const job = rows[0];
    await c.query(
      `INSERT INTO job_status_history (job_card_id, from_status, to_status, note, changed_by) VALUES ($1, NULL, 'CHECKED_IN', $2, $3)`,
      [job.id, 'Job card opened', req.user.id],
    );
    if (d.odometer != null) await c.query('UPDATE bikes SET last_odometer = GREATEST(COALESCE(last_odometer,0), $1) WHERE id = $2', [d.odometer, bikeId]);

    const bike = (await c.query('SELECT reg_no FROM bikes WHERE id = $1', [bikeId])).rows[0];
    await queueNotification(c, {
      event: 'checkin', customer, jobCardId: job.id,
      params: { reg_no: bike.reg_no, job_no: job.job_no, status_url: statusUrl(bike.reg_no) },
    });
    return job.id;
  });
  emitJobChanged(jobId, { created: true });
  res.status(201).json(await loadJob(jobId));
});

// Update job details
const updateSchema = z.object({
  service_type: z.enum(SERVICE_TYPES).optional(),
  complaint: optText,
  diagnosis: optText,
  odometer: z.coerce.number().int().min(0).optional().nullable(),
  fuel_level: optText,
  mechanic_id: id.optional().nullable(),
  promised_at: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('').transform(() => null)),
  discount: money.optional(),
});

r.patch('/:id', async (req, res) => {
  const jobId = parse(id, req.params.id);
  const d = parse(updateSchema, req.body);
  const job = await loadJob(jobId);
  assertEditable(job);
  if (req.user.role === 'mechanic') {
    // Mechanics may only record their diagnosis
    for (const k of Object.keys(d)) if (k !== 'diagnosis') throw new HttpError(403, 'Mechanics can only update the diagnosis');
  }
  if (d.discount !== undefined && job.invoice) throw new HttpError(400, 'Cancel the invoice before changing the discount');
  const cols = Object.keys(updateSchema.shape).filter((k) => d[k] !== undefined);
  if (!cols.length) throw new HttpError(400, 'Nothing to update');
  await query(
    `UPDATE job_cards SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
    [...cols.map((k) => d[k]), jobId],
  );
  emitJobChanged(jobId);
  res.json(await loadJob(jobId));
});

// Move job to a new status
r.post('/:id/status', async (req, res) => {
  const jobId = parse(id, req.params.id);
  const { status, note } = parse(z.object({ status: z.enum(STATUSES), note: optText }), req.body);
  if (!ROLE_CAN_SET[req.user.role].includes(status)) throw new HttpError(403, `Your role cannot move a job to ${status}`);

  await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT j.*, row_to_json(cu.*) AS customer, b.reg_no, b.id AS bike_id
       FROM job_cards j JOIN customers cu ON cu.id = j.customer_id JOIN bikes b ON b.id = j.bike_id
       WHERE j.id = $1 FOR UPDATE OF j`,
      [jobId],
    );
    const job = rows[0];
    if (!job) throw new HttpError(404, 'Job card not found');
    if (!canTransition(job.status, status)) throw new HttpError(400, `Cannot move from ${job.status} to ${status}`);
    if (req.user.role === 'mechanic' && job.mechanic_id && job.mechanic_id !== req.user.id) {
      throw new HttpError(403, 'This job is assigned to another mechanic');
    }

    const items = (await c.query('SELECT * FROM job_items WHERE job_card_id = $1', [jobId])).rows;
    const invoice = (await c.query('SELECT * FROM invoices WHERE job_card_id = $1', [jobId])).rows[0];
    if (status === 'QA_CHECK' && items.length === 0) throw new HttpError(400, 'Add the parts and labour used before sending to QA');
    if (status === 'DELIVERED' && !invoice) throw new HttpError(400, 'Create the invoice before delivering the bike');
    if (status === 'CANCELLED' && invoice) throw new HttpError(400, 'Cancel the invoice before cancelling the job card');

    const extra = [];
    if (status === 'IN_PROGRESS' && !job.mechanic_id && req.user.role === 'mechanic') extra.push(`mechanic_id = ${Number(req.user.id)}`);
    if (status === 'READY') extra.push('completed_at = now()');
    if (status === 'DELIVERED') extra.push('delivered_at = now()');
    await c.query(`UPDATE job_cards SET status = $1, updated_at = now() ${extra.map((e) => ', ' + e).join('')} WHERE id = $2`, [status, jobId]);
    await c.query(
      `INSERT INTO job_status_history (job_card_id, from_status, to_status, note, changed_by) VALUES ($1,$2,$3,$4,$5)`,
      [jobId, job.status, status, note, req.user.id],
    );

    const settings = await getSettings(c);
    if (status === 'CANCELLED') {
      // Return parts to stock
      for (const it of items.filter((i) => i.part_id)) {
        await c.query('UPDATE parts SET stock_qty = stock_qty + $1 WHERE id = $2', [Math.round(it.qty), it.part_id]);
      }
    }
    if (status === 'WAITING_PARTS') {
      await queueNotification(c, { event: 'waiting_parts', customer: job.customer, jobCardId: jobId, params: { reg_no: job.reg_no } });
    }
    if (status === 'READY') {
      const totals = computeTotals(items, job.discount, settings.billing?.tax_rate);
      await queueNotification(c, { event: 'ready', customer: job.customer, jobCardId: jobId, params: { reg_no: job.reg_no, total: fmtMoney(totals.total) } });
    }
    if (status === 'DELIVERED') {
      const svc = settings.service || {};
      const today = new Date().toISOString().slice(0, 10);
      const due = addDays(today, Number(svc.interval_days || 90));
      await c.query(
        `UPDATE bikes SET last_service_date = $1, next_service_due_date = $2,
           last_odometer = COALESCE($3, last_odometer),
           next_service_due_km = CASE WHEN $3::int IS NULL THEN NULL ELSE $3::int + $4::int END,
           reminder_sent_for = NULL
         WHERE id = $5`,
        [today, due, job.odometer, Number(svc.interval_km || 3000), job.bike_id],
      );
      await queueNotification(c, { event: 'delivered', customer: job.customer, jobCardId: jobId, params: { reg_no: job.reg_no, due_date: due } });
    }
  });
  emitJobChanged(jobId);
  if (status === 'CANCELLED') emitPartsChanged();
  res.json(await loadJob(jobId));
});

// Add part or labour line
const itemSchema = z.discriminatedUnion('item_type', [
  z.object({ item_type: z.literal('part'), part_id: id, qty: z.coerce.number().int().positive().default(1), unit_price: money.optional() }),
  z.object({ item_type: z.literal('labour'), description: z.string().trim().min(1).max(200), qty: z.coerce.number().positive().default(1), unit_price: money }),
]);

r.post('/:id/items', async (req, res) => {
  const jobId = parse(id, req.params.id);
  const d = parse(itemSchema, req.body);
  await tx(async (c) => {
    const job = (await c.query('SELECT * FROM job_cards WHERE id = $1 FOR UPDATE', [jobId])).rows[0];
    if (!job) throw new HttpError(404, 'Job card not found');
    assertEditable(job);
    if ((await c.query('SELECT 1 FROM invoices WHERE job_card_id = $1', [jobId])).rows[0]) {
      throw new HttpError(400, 'Cancel the invoice before changing items');
    }
    if (d.item_type === 'part') {
      const part = (await c.query('SELECT * FROM parts WHERE id = $1 FOR UPDATE', [d.part_id])).rows[0];
      if (!part || !part.active) throw new HttpError(404, 'Part not found');
      if (part.stock_qty < d.qty) throw new HttpError(400, `Only ${part.stock_qty} of ${part.name} in stock`);
      await c.query('UPDATE parts SET stock_qty = stock_qty - $1 WHERE id = $2', [d.qty, part.id]);
      const price = req.user.role === 'mechanic' || d.unit_price === undefined ? part.unit_price : d.unit_price;
      await c.query(
        `INSERT INTO job_items (job_card_id, item_type, part_id, description, qty, unit_price) VALUES ($1,'part',$2,$3,$4,$5)`,
        [jobId, part.id, part.name, d.qty, price],
      );
    } else {
      await c.query(
        `INSERT INTO job_items (job_card_id, item_type, description, qty, unit_price) VALUES ($1,'labour',$2,$3,$4)`,
        [jobId, d.description, d.qty, d.unit_price],
      );
    }
    await c.query('UPDATE job_cards SET updated_at = now() WHERE id = $1', [jobId]);
  });
  emitJobChanged(jobId);
  if (d.item_type === 'part') emitPartsChanged();
  res.status(201).json(await loadJob(jobId));
});

r.delete('/:id/items/:itemId', async (req, res) => {
  const jobId = parse(id, req.params.id);
  const itemId = parse(id, req.params.itemId);
  let wasPart = false;
  await tx(async (c) => {
    const job = (await c.query('SELECT * FROM job_cards WHERE id = $1 FOR UPDATE', [jobId])).rows[0];
    if (!job) throw new HttpError(404, 'Job card not found');
    assertEditable(job);
    if ((await c.query('SELECT 1 FROM invoices WHERE job_card_id = $1', [jobId])).rows[0]) {
      throw new HttpError(400, 'Cancel the invoice before changing items');
    }
    const item = (await c.query('DELETE FROM job_items WHERE id = $1 AND job_card_id = $2 RETURNING *', [itemId, jobId])).rows[0];
    if (!item) throw new HttpError(404, 'Item not found');
    if (item.part_id) {
      wasPart = true;
      await c.query('UPDATE parts SET stock_qty = stock_qty + $1 WHERE id = $2', [Math.round(item.qty), item.part_id]);
    }
    await c.query('UPDATE job_cards SET updated_at = now() WHERE id = $1', [jobId]);
  });
  emitJobChanged(jobId);
  if (wasPart) emitPartsChanged();
  res.json(await loadJob(jobId));
});

// Create invoice from the job's items
r.post('/:id/invoice', requireRole('admin', 'advisor'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  await tx(async (c) => {
    const job = (await c.query('SELECT * FROM job_cards WHERE id = $1 FOR UPDATE', [jobId])).rows[0];
    if (!job) throw new HttpError(404, 'Job card not found');
    if (!['READY', 'QA_CHECK', 'DELIVERED'].includes(job.status)) throw new HttpError(400, 'Invoice can be created once the job has passed QA');
    if ((await c.query('SELECT 1 FROM invoices WHERE job_card_id = $1', [jobId])).rows[0]) throw new HttpError(409, 'Invoice already exists');
    const items = (await c.query('SELECT * FROM job_items WHERE job_card_id = $1', [jobId])).rows;
    if (!items.length) throw new HttpError(400, 'No items to invoice');
    const settings = await getSettings(c);
    const t = computeTotals(items, job.discount, settings.billing?.tax_rate);
    await c.query(
      `INSERT INTO invoices (invoice_no, job_card_id, parts_total, labour_total, discount, tax_rate, tax_amount, total, issued_by)
       VALUES ('INV' || to_char(now(), 'YY') || '-' || lpad(nextval('invoice_no_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,$8)`,
      [jobId, t.parts_total, t.labour_total, t.discount, t.tax_rate, t.tax_amount, t.total, req.user.id],
    );
  });
  emitJobChanged(jobId);
  res.status(201).json(await loadJob(jobId));
});

// Resend a notification for this job manually
r.post('/:id/notify', requireRole('admin', 'advisor'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  const { event } = parse(z.object({ event: z.enum(['checkin', 'waiting_parts', 'ready', 'delivered']) }), req.body);
  const job = await loadJob(jobId);
  const params = {
    reg_no: job.bike.reg_no, job_no: job.job_no, status_url: statusUrl(job.bike.reg_no),
    total: fmtMoney(job.totals.total), due_date: job.bike.next_service_due_date || '',
  };
  const n = await queueNotification({ query }, { event, customer: job.customer, jobCardId: jobId, params });
  if (!n) throw new HttpError(400, 'Notifications for this event are turned off in Settings');
  res.status(201).json(n);
});

export default r;
