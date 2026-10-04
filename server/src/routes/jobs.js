import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm, hasPerm } from '../auth.js';
import { HttpError, normalizeRegNo, addDays } from '../lib/util.js';
import { parse, z, id, optText, money } from '../lib/validate.js';
import {
  STATUSES, DELIVERY_STATUSES, canTransition, canDeliveryTransition, permForTransition,
} from '../lib/status.js';
import {
  loadJob, sanitizeJob, assertEditable, assertCanSee, computeTotals, scopeSql, OPEN_SQL, canSeeMoney,
} from '../lib/jobs.js';
import { balanceOf, createInvoice, paymentState } from '../lib/payments.js';
import { round2 } from '../lib/util.js';
import { queueNotification, statusUrl, fmtMoney, getSettings } from '../lib/notify.js';
import { emitJobChanged, emitPartsChanged } from '../realtime.js';
import { customerSchema, bikeSchema, bikeRegNo } from './customers.js';

const r = Router();
r.use(requirePerm('jobs.view'));

const send = async (res, jobId, user, status = 200) => res.status(status).json(sanitizeJob(await loadJob(jobId), user));

// Key info for lists and the board
const LIST_SQL = `
  SELECT j.id, j.job_no, j.status, j.delivery_status, j.delivery_method, j.complaint, j.promised_at, j.created_at, j.updated_at,
         j.delivered_at, j.mechanic_id, m.name AS mechanic_name, b.reg_no, b.model, b.year, b.chassis_no,
         c.name AS customer_name, c.mobile, c.suburb, j.odometer, j.service_kind, j.pay_upfront,
         (SELECT COALESCE(sum(CASE WHEN kind = 'REFUND' THEN -amount ELSE amount END),0) FROM job_payments WHERE job_card_id = j.id) AS paid_total,
         (SELECT string_agg(description, ', ' ORDER BY id) FROM job_items WHERE job_card_id = j.id AND item_type IN ('service','custom_service')) AS services,
         (SELECT count(*)::int FROM job_items WHERE job_card_id = j.id AND item_type IN ('part','custom_part')) AS part_lines,
         (SELECT COALESCE(sum(line_total),0) FROM job_items WHERE job_card_id = j.id) - j.discount AS items_total,
         i.invoice_no, i.status AS invoice_status, i.total AS invoice_total, i.paid_amount
  FROM job_cards j
  JOIN bikes b ON b.id = j.bike_id
  JOIN customers c ON c.id = j.customer_id
  LEFT JOIN users m ON m.id = j.mechanic_id
  LEFT JOIN invoices i ON i.job_card_id = j.id`;

// Adds payment_state ('DUE' / 'PAID' / 'REFUND') and hides amounts from people who may not see them
const listRows = async (rows, user) => {
  const taxRate = Number((await getSettings()).billing?.tax_rate || 0);
  const money = canSeeMoney(user);
  return rows.map((row) => {
    const due = row.invoice_total != null ? Number(row.invoice_total) : round2(Number(row.items_total) * (1 + taxRate / 100));
    const out = { ...row, payment_state: paymentState(due, Number(row.paid_total)), amount_due: round2(due - Number(row.paid_total)) };
    if (money) return out;
    const { items_total, invoice_total, paid_amount, paid_total, amount_due, ...rest } = out;
    return rest;
  });
};

// Board: all open jobs plus those delivered today
r.get('/board', async (req, res) => {
  const params = [];
  let extra = '';
  if (req.query.mine === '1') { params.push(req.user.id); extra += ` AND j.mechanic_id = $${params.length}`; }
  const scope = scopeSql(req.user, 'j', params.length + 1);
  params.push(...scope.params);
  const { rows } = await query(
    `${LIST_SQL}
     WHERE (${OPEN_SQL} OR (j.delivery_status = 'DELIVERED' AND j.delivered_at::date = CURRENT_DATE)) ${extra}${scope.sql}
     ORDER BY j.promised_at NULLS LAST, j.created_at`,
    params,
  );
  res.json(await listRows(rows, req.user));
});

// Job card list with filters
r.get('/', async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };
  if (STATUSES.includes(req.query.status)) add('j.status = $?', req.query.status);
  if (DELIVERY_STATUSES.includes(req.query.delivery)) add('j.delivery_status = $?', req.query.delivery);
  if (req.query.mechanic_id) add('j.mechanic_id = $?', Number(req.query.mechanic_id));
  if (req.query.open === '1') where.push(OPEN_SQL);
  const q = String(req.query.q || '').trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`, `%${normalizeRegNo(q)}%`, `%${q.replace(/\D/g, '') || '~'}%`);
    const n = params.length;
    where.push(`(lower(j.job_no) LIKE $${n - 2} OR lower(c.name) LIKE $${n - 2} OR b.reg_no LIKE $${n - 1} OR c.mobile LIKE $${n}
                 OR regexp_replace(upper(COALESCE(b.chassis_no,'')), '[^A-Z0-9]', '', 'g') LIKE $${n - 1})`);
  }
  if (req.query.from) add('j.created_at >= $?::date', req.query.from);
  if (req.query.to) add('j.created_at < $?::date + 1', req.query.to);
  const scope = scopeSql(req.user, 'j', params.length + 1);
  params.push(...scope.params);
  const { rows } = await query(
    `${LIST_SQL} WHERE TRUE ${where.length ? 'AND ' + where.join(' AND ') : ''}${scope.sql}
     ORDER BY j.created_at DESC LIMIT 300`,
    params,
  );
  res.json(await listRows(rows, req.user));
});

r.get('/:id', async (req, res) => {
  const job = await loadJob(parse(id, req.params.id));
  assertCanSee(req.user, job);
  res.json(sanitizeJob(job, req.user));
});

// ---------- Items (services, parts, custom lines) ----------
const itemSchema = z.discriminatedUnion('item_type', [
  z.object({ item_type: z.literal('service'), service_type_id: id, qty: z.coerce.number().positive().default(1), unit_price: money.optional(), description: optText }),
  z.object({ item_type: z.literal('part'), part_id: id, qty: z.coerce.number().int().positive().default(1), unit_price: money.optional() }),
  z.object({ item_type: z.literal('custom_service'), description: z.string().trim().min(1).max(200), qty: z.coerce.number().positive().default(1), unit_price: money.default(0) }),
  z.object({ item_type: z.literal('custom_part'), description: z.string().trim().min(1).max(200), qty: z.coerce.number().positive().default(1), unit_price: money.default(0) }),
]);

/** Insert items inside a transaction. Deducts stock for catalogue parts. Returns true if stock changed. */
async function addItems(c, jobId, items, user) {
  const pricing = hasPerm(user, 'jobs.pricing');
  let stockChanged = false;
  for (const d of items) {
    if (d.item_type === 'service') {
      const st = (await c.query('SELECT * FROM service_types WHERE id = $1', [d.service_type_id])).rows[0];
      if (!st || !st.active) throw new HttpError(404, 'Service type not found');
      const dup = (await c.query('SELECT 1 FROM job_items WHERE job_card_id = $1 AND service_type_id = $2', [jobId, st.id])).rows[0];
      if (dup) throw new HttpError(409, `"${st.name}" is already on this job card`);
      const price = pricing && d.unit_price !== undefined ? d.unit_price : st.default_price;
      await c.query(
        `INSERT INTO job_items (job_card_id, item_type, service_type_id, description, qty, unit_price, added_by) VALUES ($1,'service',$2,$3,$4,$5,$6)`,
        [jobId, st.id, (pricing && d.description) || st.name, d.qty, price, user.id],
      );
    } else if (d.item_type === 'part') {
      const part = (await c.query('SELECT * FROM parts WHERE id = $1 FOR UPDATE', [d.part_id])).rows[0];
      if (!part || !part.active) throw new HttpError(404, 'Part not found');
      if (part.stock_qty < d.qty) throw new HttpError(400, `Only ${part.stock_qty} of ${part.name} in stock`);
      await c.query('UPDATE parts SET stock_qty = stock_qty - $1 WHERE id = $2', [d.qty, part.id]);
      const price = pricing && d.unit_price !== undefined ? d.unit_price : part.unit_price;
      await c.query(
        `INSERT INTO job_items (job_card_id, item_type, part_id, description, qty, unit_price, unit_cost, added_by) VALUES ($1,'part',$2,$3,$4,$5,$6,$7)`,
        [jobId, part.id, part.name, d.qty, price, part.cost_price, user.id],
      );
      stockChanged = true;
    } else {
      await c.query(
        `INSERT INTO job_items (job_card_id, item_type, description, qty, unit_price, added_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [jobId, d.item_type, d.description, d.qty, pricing ? d.unit_price : 0, user.id],
      );
    }
  }
  return stockChanged;
}

async function lockEditableJob(c, jobId, user) {
  const job = (await c.query('SELECT * FROM job_cards WHERE id = $1 FOR UPDATE', [jobId])).rows[0];
  if (!job) throw new HttpError(404, 'Job card not found');
  assertCanSee(user, job);
  assertEditable(job);
  if ((await c.query('SELECT 1 FROM invoices WHERE job_card_id = $1', [jobId])).rows[0]) {
    throw new HttpError(400, 'Cancel the invoice before changing services or parts');
  }
  return job;
}

// ---------- Create ----------
const createSchema = z.object({
  bike_id: id.optional(),
  customer_id: id.optional(),
  customer: customerSchema.optional(),
  bike: bikeSchema.optional(),
  complaint: optText,
  odometer: z.coerce.number().int().min(0).optional().nullable(),
  fuel_level: optText,
  mechanic_id: id.optional().nullable(),
  promised_at: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('').transform(() => null)),
  delivery_method: z.enum(['PICKUP', 'HOME_DELIVERY']).default('PICKUP'),
  delivery_address: optText,
  service_kind: z.enum(['FREE_1', 'FREE_2', 'PAID']).optional().nullable(),
  pay_upfront: z.boolean().default(false),
  // Fill in missing details on an existing bike (e.g. engine/chassis no for a free service)
  bike_update: z.object({ engine_no: optText, chassis_no: optText, sale_date: bikeSchema.shape.sale_date }).optional(),
  items: z.array(itemSchema).max(100).default([]),
});

const FREE_LABEL = { FREE_1: 'Free service 1', FREE_2: 'Free service 2' };

/** Free services need engine no, chassis no and odometer (for the Honda claim) and can be used once per bike. */
async function checkFreeService(c, kind, bikeId, odometer, exceptJobId = 0) {
  if (!FREE_LABEL[kind]) return;
  const bike = (await c.query('SELECT engine_no, chassis_no FROM bikes WHERE id = $1', [bikeId])).rows[0];
  if (!bike?.engine_no || !bike?.chassis_no) throw new HttpError(400, `${FREE_LABEL[kind]}: enter the engine number and chassis number`);
  if (odometer == null) throw new HttpError(400, `${FREE_LABEL[kind]}: enter the odometer reading (km)`);
  const used = (await c.query(
    `SELECT job_no FROM job_cards WHERE bike_id = $1 AND service_kind = $2 AND status <> 'CANCELLED' AND id <> $3 LIMIT 1`,
    [bikeId, kind, exceptJobId],
  )).rows[0];
  if (used) throw new HttpError(409, `${FREE_LABEL[kind]} was already given on job card ${used.job_no}`);
}

r.post('/', requirePerm('jobs.create'), async (req, res) => {
  const d = parse(createSchema, req.body);
  let stockChanged = false;
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
        customer = (await c.query('SELECT * FROM customers WHERE id = $1', [d.customer_id])).rows[0];
        if (!customer) throw new HttpError(404, 'Customer not found');
      } else {
        if (!d.customer) throw new HttpError(400, 'Customer details are required');
        customer = (await c.query(
          `INSERT INTO customers (name, mobile, suburb, email, preferred_lang, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [d.customer.name, d.customer.mobile, d.customer.suburb, d.customer.email, d.customer.preferred_lang, d.customer.notes],
        )).rows[0];
      }
      const regNo = bikeRegNo(d.bike);
      if ((await c.query('SELECT 1 FROM bikes WHERE reg_no = $1', [regNo])).rows[0]) {
        throw new HttpError(409, `Bike ${regNo} is already registered. Search for it instead.`);
      }
      bikeId = (await c.query(
        `INSERT INTO bikes (customer_id, reg_no, model, year, engine_no, chassis_no, last_odometer, sale_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [customer.id, regNo, d.bike.model, d.bike.year, d.bike.engine_no, d.bike.chassis_no, d.odometer ?? d.bike.last_odometer, d.bike.sale_date],
      )).rows[0].id;
    }
    if (d.bike_update && d.bike_id) {
      const u = d.bike_update;
      await c.query(
        `UPDATE bikes SET engine_no = COALESCE($1, engine_no), chassis_no = COALESCE($2, chassis_no), sale_date = COALESCE($3, sale_date) WHERE id = $4`,
        [u.engine_no || null, u.chassis_no || null, u.sale_date || null, bikeId],
      );
    }
    await checkFreeService(c, d.service_kind, bikeId, d.odometer);

    const open = (await c.query(`SELECT job_no FROM job_cards j WHERE bike_id = $1 AND ${OPEN_SQL}`, [bikeId])).rows[0];
    if (open) throw new HttpError(409, `This bike already has an open job card (${open.job_no})`);

    const job = (await c.query(
      `INSERT INTO job_cards (job_no, bike_id, customer_id, complaint, odometer, fuel_level, advisor_id, mechanic_id, promised_at,
                              delivery_method, delivery_address, service_kind, pay_upfront, created_by)
       VALUES ('JC' || to_char(now(), 'YY') || '-' || lpad(nextval('job_no_seq')::text, 5, '0'),
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$6)
       RETURNING id, job_no`,
      [bikeId, customer.id, d.complaint, d.odometer, d.fuel_level, req.user.id, d.mechanic_id || null, d.promised_at || null,
        d.delivery_method, d.delivery_address, d.service_kind || null, d.pay_upfront],
    )).rows[0];
    await c.query(
      `INSERT INTO job_status_history (job_card_id, from_status, to_status, note, changed_by) VALUES ($1, NULL, 'CHECKED_IN', 'Job card opened', $2)`,
      [job.id, req.user.id],
    );
    if (d.odometer != null) await c.query('UPDATE bikes SET last_odometer = GREATEST(COALESCE(last_odometer,0), $1) WHERE id = $2', [d.odometer, bikeId]);
    if (d.items.length) stockChanged = await addItems(c, job.id, d.items, req.user);

    const bike = (await c.query('SELECT reg_no FROM bikes WHERE id = $1', [bikeId])).rows[0];
    await queueNotification(c, {
      event: 'checkin', customer, jobCardId: job.id,
      params: { reg_no: bike.reg_no, job_no: job.job_no, status_url: statusUrl(bike.reg_no) },
    });
    return job.id;
  });
  emitJobChanged(jobId, { created: true });
  if (stockChanged) emitPartsChanged();
  await send(res, jobId, req.user, 201);
});

// ---------- Update details ----------
const updateSchema = z.object({
  complaint: optText,
  diagnosis: optText,
  odometer: z.coerce.number().int().min(0).optional().nullable(),
  fuel_level: optText,
  mechanic_id: id.optional().nullable(),
  promised_at: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('').transform(() => null)),
  discount: money.optional(),
  delivery_method: z.enum(['PICKUP', 'HOME_DELIVERY']).optional(),
  delivery_address: optText,
  service_kind: z.enum(['FREE_1', 'FREE_2', 'PAID']).optional().nullable(),
  pay_upfront: z.boolean().optional(),
});

r.patch('/:id', async (req, res) => {
  const jobId = parse(id, req.params.id);
  const d = parse(updateSchema, req.body);
  const job = await loadJob(jobId);
  assertCanSee(req.user, job);
  assertEditable(job);
  const keys = Object.keys(updateSchema.shape).filter((k) => d[k] !== undefined);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  for (const k of keys) {
    if (k === 'diagnosis') {
      if (!hasPerm(req.user, 'jobs.edit') && !hasPerm(req.user, 'jobs.status')) throw new HttpError(403, 'You cannot update the diagnosis');
    } else if (k === 'discount') {
      if (!hasPerm(req.user, 'jobs.pricing')) throw new HttpError(403, 'You cannot give discounts');
      if (job.invoice) throw new HttpError(400, 'Cancel the invoice before changing the discount');
    } else if (!hasPerm(req.user, 'jobs.edit')) {
      throw new HttpError(403, 'You can only update the diagnosis');
    }
  }
  if (d.service_kind !== undefined || d.odometer !== undefined) {
    const kind = d.service_kind !== undefined ? d.service_kind : job.service_kind;
    await checkFreeService({ query }, kind, job.bike_id, d.odometer !== undefined ? d.odometer : job.odometer, jobId);
  }
  await query(
    `UPDATE job_cards SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${keys.length + 1}`,
    [...keys.map((k) => d[k]), jobId],
  );
  emitJobChanged(jobId);
  await send(res, jobId, req.user);
});

// ---------- Job status ----------
r.post('/:id/status', async (req, res) => {
  const jobId = parse(id, req.params.id);
  const { status, note } = parse(z.object({ status: z.enum(STATUSES), note: optText }), req.body);
  let stockBack = false;
  await tx(async (c) => {
    const job = (await c.query(
      `SELECT j.*, row_to_json(cu.*) AS customer, b.reg_no
       FROM job_cards j JOIN customers cu ON cu.id = j.customer_id JOIN bikes b ON b.id = j.bike_id
       WHERE j.id = $1 FOR UPDATE OF j`,
      [jobId],
    )).rows[0];
    if (!job) throw new HttpError(404, 'Job card not found');
    assertCanSee(req.user, job);
    if (job.delivery_status === 'DELIVERED') throw new HttpError(400, 'The bike has already been delivered');
    if (!canTransition(job.status, status)) throw new HttpError(400, `Cannot move from ${job.status} to ${status}`);
    const need = permForTransition(job.status, status);
    if (!hasPerm(req.user, need)) throw new HttpError(403, 'You do not have permission for this status change');

    const items = (await c.query('SELECT * FROM job_items WHERE job_card_id = $1', [jobId])).rows;
    const invoice = (await c.query('SELECT * FROM invoices WHERE job_card_id = $1', [jobId])).rows[0];
    if (job.pay_upfront && job.status === 'CHECKED_IN' && status !== 'CANCELLED') {
      const bal = await balanceOf(c, jobId);
      if (bal.state === 'DUE') throw new HttpError(400, `Waiting for payment at the cashier (LKR ${bal.balance.toFixed(2)} due). Work starts once the receipt is with the bike.`);
    }
    if (status === 'QA_CHECK' && items.length === 0 && !FREE_LABEL[job.service_kind]) throw new HttpError(400, 'Add the services and parts before sending to QA');
    if (status === 'CANCELLED' && invoice) throw new HttpError(400, 'Cancel the invoice before cancelling the job card');
    if (job.status === 'COMPLETED' && invoice) throw new HttpError(400, 'Cancel the invoice before reopening the job');

    const sets = ['status = $1', 'updated_at = now()'];
    if (status === 'IN_PROGRESS' && !job.mechanic_id && !hasPerm(req.user, 'jobs.view_all')) sets.push(`mechanic_id = ${Number(req.user.id)}`);
    if (status === 'COMPLETED') sets.push('completed_at = now()', `delivery_status = 'READY'`);
    if (job.status === 'COMPLETED') sets.push('completed_at = NULL', `delivery_status = 'PENDING'`);
    await c.query(`UPDATE job_cards SET ${sets.join(', ')} WHERE id = $2`, [status, jobId]);
    await c.query(
      `INSERT INTO job_status_history (job_card_id, kind, from_status, to_status, note, changed_by) VALUES ($1,'job',$2,$3,$4,$5)`,
      [jobId, job.status, status, note, req.user.id],
    );
    if (status === 'COMPLETED' || job.status === 'COMPLETED') {
      await c.query(
        `INSERT INTO job_status_history (job_card_id, kind, from_status, to_status, changed_by) VALUES ($1,'delivery',$2,$3,$4)`,
        [jobId, job.delivery_status, status === 'COMPLETED' ? 'READY' : 'PENDING', req.user.id],
      );
    }

    const settings = await getSettings(c);
    if (status === 'CANCELLED') {
      for (const it of items.filter((i) => i.part_id)) {
        await c.query('UPDATE parts SET stock_qty = stock_qty + $1 WHERE id = $2', [Math.round(it.qty), it.part_id]);
        stockBack = true;
      }
    }
    if (status === 'WAITING_PARTS') {
      await queueNotification(c, { event: 'waiting_parts', customer: job.customer, jobCardId: jobId, params: { reg_no: job.reg_no } });
    }
    if (status === 'COMPLETED') {
      const totals = computeTotals(items, job.discount, settings.billing?.tax_rate);
      await queueNotification(c, { event: 'ready', customer: job.customer, jobCardId: jobId, params: { reg_no: job.reg_no, total: fmtMoney(totals.total) } });
    }
  });
  emitJobChanged(jobId);
  if (stockBack) emitPartsChanged();
  await send(res, jobId, req.user);
});

// ---------- Delivery status ----------
r.post('/:id/delivery', requirePerm('jobs.delivery'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  const d = parse(z.object({ delivery_status: z.enum(DELIVERY_STATUSES), note: optText, delivered_to: optText }), req.body);
  await tx(async (c) => {
    const job = (await c.query(
      `SELECT j.*, row_to_json(cu.*) AS customer, b.reg_no, b.id AS bike_id
       FROM job_cards j JOIN customers cu ON cu.id = j.customer_id JOIN bikes b ON b.id = j.bike_id
       WHERE j.id = $1 FOR UPDATE OF j`,
      [jobId],
    )).rows[0];
    if (!job) throw new HttpError(404, 'Job card not found');
    if (job.status !== 'COMPLETED') throw new HttpError(400, 'The job must be completed before delivery');
    if (!canDeliveryTransition(job.delivery_status, d.delivery_status)) {
      throw new HttpError(400, `Cannot change delivery from ${job.delivery_status} to ${d.delivery_status}`);
    }
    if (d.delivery_status === 'DELIVERED') {
      const hasInvoice = (await c.query('SELECT 1 FROM invoices WHERE job_card_id = $1', [jobId])).rows[0];
      if (!hasInvoice && !job.pay_upfront) throw new HttpError(400, 'Create the invoice before delivering the bike');
      // Pay-at-the-cashier jobs: the invoice is created automatically at hand-over
      if (!hasInvoice) await createInvoice(c, jobId, req.user.id);
      const bal = await balanceOf(c, jobId);
      if (job.pay_upfront && bal.state === 'DUE') {
        throw new HttpError(400, `Collect the balance of LKR ${bal.balance.toFixed(2)} at the cashier before handing over the bike`);
      }
    }

    const sets = ['delivery_status = $1', 'updated_at = now()'];
    const vals = [d.delivery_status, jobId];
    if (d.delivery_status === 'DELIVERED') {
      sets.push('delivered_at = now()');
      vals.push(d.delivered_to || job.customer.name);
      sets.push(`delivered_to = $${vals.length}`);
    }
    if (d.note) { vals.push(d.note); sets.push(`delivery_note = $${vals.length}`); }
    await c.query(`UPDATE job_cards SET ${sets.join(', ')} WHERE id = $2`, vals);
    await c.query(
      `INSERT INTO job_status_history (job_card_id, kind, from_status, to_status, note, changed_by) VALUES ($1,'delivery',$2,$3,$4,$5)`,
      [jobId, job.delivery_status, d.delivery_status, d.note || (d.delivered_to ? `Handed to ${d.delivered_to}` : null), req.user.id],
    );

    if (d.delivery_status === 'DELIVERED') {
      const svc = (await getSettings(c)).service || {};
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
  await send(res, jobId, req.user);
});

// ---------- Items ----------
r.post('/:id/items', requirePerm('jobs.items'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  // Accept one item or { items: [...] } for multi-select
  const items = parse(z.array(itemSchema).min(1).max(100), Array.isArray(req.body?.items) ? req.body.items : [req.body]);
  let stockChanged = false;
  await tx(async (c) => {
    await lockEditableJob(c, jobId, req.user);
    stockChanged = await addItems(c, jobId, items, req.user);
    await c.query('UPDATE job_cards SET updated_at = now() WHERE id = $1', [jobId]);
  });
  emitJobChanged(jobId);
  if (stockChanged) emitPartsChanged();
  await send(res, jobId, req.user, 201);
});

r.patch('/:id/items/:itemId', requirePerm('jobs.items'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  const itemId = parse(id, req.params.itemId);
  const d = parse(z.object({ qty: z.coerce.number().positive().optional(), unit_price: money.optional(), description: z.string().trim().min(1).max(200).optional() }), req.body);
  if ((d.unit_price !== undefined || d.description !== undefined) && !hasPerm(req.user, 'jobs.pricing')) throw new HttpError(403, 'You cannot change prices');
  let stockChanged = false;
  await tx(async (c) => {
    await lockEditableJob(c, jobId, req.user);
    const item = (await c.query('SELECT * FROM job_items WHERE id = $1 AND job_card_id = $2 FOR UPDATE', [itemId, jobId])).rows[0];
    if (!item) throw new HttpError(404, 'Item not found');
    if (d.qty !== undefined && item.part_id) {
      if (!Number.isInteger(d.qty)) throw new HttpError(400, 'Part quantity must be a whole number');
      const delta = d.qty - Number(item.qty);
      if (delta !== 0) {
        const upd = await c.query('UPDATE parts SET stock_qty = stock_qty - $1 WHERE id = $2 AND stock_qty - $1 >= 0 RETURNING id', [delta, item.part_id]);
        if (!upd.rows[0]) throw new HttpError(400, 'Not enough stock for that quantity');
        stockChanged = true;
      }
    }
    await c.query(
      'UPDATE job_items SET qty = COALESCE($1, qty), unit_price = COALESCE($2, unit_price), description = COALESCE($3, description) WHERE id = $4',
      [d.qty ?? null, d.unit_price ?? null, d.description ?? null, itemId],
    );
    await c.query('UPDATE job_cards SET updated_at = now() WHERE id = $1', [jobId]);
  });
  emitJobChanged(jobId);
  if (stockChanged) emitPartsChanged();
  await send(res, jobId, req.user);
});

r.delete('/:id/items/:itemId', requirePerm('jobs.items'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  const itemId = parse(id, req.params.itemId);
  let wasPart = false;
  await tx(async (c) => {
    await lockEditableJob(c, jobId, req.user);
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
  await send(res, jobId, req.user);
});

// ---------- Invoice ----------
r.post('/:id/invoice', requirePerm('invoices.manage'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  await tx(async (c) => {
    const job = (await c.query('SELECT * FROM job_cards WHERE id = $1 FOR UPDATE', [jobId])).rows[0];
    if (!job) throw new HttpError(404, 'Job card not found');
    if (!['QA_CHECK', 'COMPLETED'].includes(job.status)) throw new HttpError(400, 'Invoice can be created once the job is in QA or completed');
    if ((await c.query('SELECT 1 FROM invoices WHERE job_card_id = $1', [jobId])).rows[0]) throw new HttpError(409, 'Invoice already exists');
    await createInvoice(c, jobId, req.user.id);
  });
  emitJobChanged(jobId);
  await send(res, jobId, req.user, 201);
});

// Resend a notification for this job manually
r.post('/:id/notify', requirePerm('messages.send'), async (req, res) => {
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
