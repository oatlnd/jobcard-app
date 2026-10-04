import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { PAYMENT_METHODS, recordPayment } from '../lib/payments.js';
import { parse, z, id, money } from '../lib/validate.js';
import { emitJobChanged } from '../realtime.js';

const r = Router();

r.get('/', requirePerm('invoices.view'), async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`i.status = $${params.length}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`i.issued_at >= $${params.length}::date`); }
  if (req.query.to) { params.push(req.query.to); where.push(`i.issued_at < $${params.length}::date + 1`); }
  const { rows } = await query(
    `SELECT i.*, j.job_no, b.reg_no, c.name AS customer_name
     FROM invoices i JOIN job_cards j ON j.id = i.job_card_id JOIN bikes b ON b.id = j.bike_id JOIN customers c ON c.id = j.customer_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.issued_at DESC LIMIT 300`,
    params,
  );
  res.json(rows);
});

// Record a payment against the invoice's job card (kept for older screens – the cashier screen uses /cashier)
r.post('/:id/payment', requirePerm('payments.record'), async (req, res) => {
  const invId = parse(id, req.params.id);
  const d = parse(z.object({ amount: money.refine((n) => n > 0, 'must be more than 0'), method: z.enum(PAYMENT_METHODS) }), req.body);
  const inv = await tx(async (c) => {
    const cur = (await c.query('SELECT * FROM invoices WHERE id = $1', [invId])).rows[0];
    if (!cur) throw new HttpError(404, 'Invoice not found');
    await recordPayment(c, cur.job_card_id, d, req.user.id);
    return (await c.query('SELECT * FROM invoices WHERE id = $1', [invId])).rows[0];
  });
  emitJobChanged(inv.job_card_id);
  res.json(inv);
});

// Cancel (delete) an invoice so the job can be edited again. Payments stay on the job card.
r.delete('/:id', requirePerm('invoices.manage'), async (req, res) => {
  const invId = parse(id, req.params.id);
  const { rows } = await query(
    `DELETE FROM invoices i USING job_cards j
     WHERE i.id = $1 AND j.id = i.job_card_id AND j.delivery_status <> 'DELIVERED'
     RETURNING i.job_card_id`,
    [invId],
  );
  if (!rows[0]) throw new HttpError(400, 'Invoices for bikes already delivered can’t be cancelled');
  emitJobChanged(rows[0].job_card_id);
  res.json({ ok: true });
});

export default r;
