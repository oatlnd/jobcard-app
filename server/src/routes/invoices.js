import { Router } from 'express';
import { query, tx } from '../db.js';
import { requireRole } from '../auth.js';
import { HttpError, round2 } from '../lib/util.js';
import { parse, z, id, money } from '../lib/validate.js';
import { emitJobChanged } from '../realtime.js';

const r = Router();

r.get('/', requireRole('admin', 'advisor'), async (req, res) => {
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

// Record a payment (sets the total amount paid so far)
r.post('/:id/payment', requireRole('admin', 'advisor'), async (req, res) => {
  const invId = parse(id, req.params.id);
  const d = parse(z.object({ amount: money.refine((n) => n > 0, 'must be more than 0'), method: z.enum(['Cash', 'Card', 'Bank Transfer', 'Other']) }), req.body);
  const inv = await tx(async (c) => {
    const cur = (await c.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invId])).rows[0];
    if (!cur) throw new HttpError(404, 'Invoice not found');
    const paid = round2(Number(cur.paid_amount) + d.amount);
    if (paid > Number(cur.total) + 0.001) throw new HttpError(400, `Payment exceeds the balance of LKR ${round2(cur.total - cur.paid_amount)}`);
    const status = paid >= Number(cur.total) ? 'PAID' : 'PARTIAL';
    const { rows } = await c.query(
      'UPDATE invoices SET paid_amount = $1, payment_method = $2, status = $3 WHERE id = $4 RETURNING *',
      [paid, d.method, status, invId],
    );
    return rows[0];
  });
  emitJobChanged(inv.job_card_id);
  res.json(inv);
});

// Cancel (delete) an unpaid invoice so the job can be edited again
r.delete('/:id', requireRole('admin', 'advisor'), async (req, res) => {
  const invId = parse(id, req.params.id);
  const { rows } = await query(
    `DELETE FROM invoices i USING job_cards j
     WHERE i.id = $1 AND j.id = i.job_card_id AND i.paid_amount = 0 AND j.status <> 'DELIVERED'
     RETURNING i.job_card_id`,
    [invId],
  );
  if (!rows[0]) throw new HttpError(400, 'Only unpaid invoices on bikes not yet delivered can be cancelled');
  emitJobChanged(rows[0].job_card_id);
  res.json({ ok: true });
});

export default r;
