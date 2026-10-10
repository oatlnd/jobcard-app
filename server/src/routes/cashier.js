// Cashier: queue of job cards waiting to pay, take payments, receipts, today's takings.
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, normalizeRegNo, round2 } from '../lib/util.js';
import { parse, z, id, optText, money } from '../lib/validate.js';
import { loadJob, sanitizeJob, computeTotals } from '../lib/jobs.js';
import { getSettings } from '../lib/notify.js';
import { PAYMENT_METHODS, paymentState, recordPayment } from '../lib/payments.js';
import { emitJobChanged } from '../realtime.js';

const r = Router();

// Job cards that owe money (or are owed a refund). With ?q= it searches every open job card.
r.get('/queue', requirePerm('payments.record'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [];
  let search = '';
  if (q) {
    params.push(`%${q.toLowerCase()}%`, `%${normalizeRegNo(q) || '~'}%`, `%${q.replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '') || '~'}%`);
    search = `AND (lower(j.job_no) LIKE $1 OR b.reg_no LIKE $2 OR c.mobile LIKE $3 OR lower(c.name) LIKE $1
                  OR regexp_replace(upper(COALESCE(b.chassis_no,'')), '[^A-Z0-9]', '', 'g') LIKE $2)`;
  }
  const { rows } = await query(
    `SELECT j.id, j.job_no, j.status, j.delivery_status, j.service_kind, j.pay_upfront, j.discount, j.created_at,
            b.reg_no, b.model, b.chassis_no, c.name AS customer_name, c.mobile, i.total AS invoice_total,
            (SELECT json_agg(json_build_object('item_type', item_type, 'line_total', line_total)) FROM job_items WHERE job_card_id = j.id) AS items,
            (SELECT COALESCE(sum(CASE WHEN kind = 'REFUND' THEN -amount ELSE amount END),0) FROM job_payments WHERE job_card_id = j.id) AS paid
     FROM job_cards j JOIN bikes b ON b.id = j.bike_id JOIN customers c ON c.id = j.customer_id
     LEFT JOIN invoices i ON i.job_card_id = j.id
     WHERE ((j.status <> 'CANCELLED' AND j.delivery_status <> 'DELIVERED')
            OR (j.status = 'CANCELLED' AND EXISTS (SELECT 1 FROM job_payments WHERE job_card_id = j.id))) ${search}
     ORDER BY j.created_at
     LIMIT 300`,
    params,
  );
  const taxRate = (await getSettings()).billing?.tax_rate;
  const list = rows.map(({ items, discount, invoice_total, ...row }) => {
    const total = row.status === 'CANCELLED' ? 0
      : invoice_total != null ? Number(invoice_total) : computeTotals(items || [], discount, taxRate).total;
    const paid = round2(Number(row.paid));
    return { ...row, total, paid, balance: round2(total - paid), state: paymentState(total, paid) };
  });
  // Queue: pay-first jobs that still owe, any job ready for pickup that owes, and refunds
  res.json(q ? list : list.filter((j) => j.state === 'REFUND' || (j.state === 'DUE' && (j.pay_upfront || j.status === 'COMPLETED'))));
});

// Today's receipts and totals per method (for counting the cash drawer)
r.get('/today', requirePerm('payments.record'), async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : null;
  const { rows } = await query(
    `SELECT p.*, j.job_no, b.reg_no, b.chassis_no, c.name AS customer_name, u.name AS received_by_name
     FROM job_payments p JOIN job_cards j ON j.id = p.job_card_id JOIN bikes b ON b.id = j.bike_id
     JOIN customers c ON c.id = j.customer_id LEFT JOIN users u ON u.id = p.received_by
     WHERE p.received_at::date = COALESCE($1::date, CURRENT_DATE)
     ORDER BY p.id DESC`,
    [date],
  );
  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0]));
  for (const p of rows) byMethod[p.method] = round2(byMethod[p.method] + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount));
  const cashOver = round2(rows.reduce((sum, p) => sum + Number(p.cash_over || 0), 0));
  res.json({
    receipts: rows, by_method: byMethod, total: round2(Object.values(byMethod).reduce((a, b) => a + b, 0)),
    cash_over: cashOver, cash_in_drawer: round2(byMethod.Cash + cashOver),
  });
});

const paySchema = z.object({
  kind: z.enum(['PAYMENT', 'REFUND']).default('PAYMENT'),
  amount: money.refine((n) => n > 0, 'must be more than 0'),
  method: z.enum(PAYMENT_METHODS),
  cash_given: money.optional().nullable(),
  change_given: money.optional().nullable(),
  reference: optText,
});

r.post('/jobs/:id/payments', requirePerm('payments.record'), async (req, res) => {
  const jobId = parse(id, req.params.id);
  const d = parse(paySchema, req.body);
  const payment = await tx((c) => recordPayment(c, jobId, d, req.user.id));
  emitJobChanged(jobId);
  res.status(201).json({ payment, job: sanitizeJob(await loadJob(jobId), req.user) });
});

// One receipt with its job card (for printing)
r.get('/payments/:id', requirePerm('payments.record', 'jobs.print'), async (req, res) => {
  const pid = parse(id, req.params.id);
  const { rows } = await query(
    `SELECT p.*, u.name AS received_by_name FROM job_payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.id = $1`,
    [pid],
  );
  if (!rows[0]) throw new HttpError(404, 'Receipt not found');
  const job = await loadJob(rows[0].job_card_id);
  // Balance straight after this receipt (later payments not counted)
  const paidUpTo = round2(job.payments.filter((p) => p.id <= pid).reduce((s, p) => s + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount), 0));
  const due = round2(job.totals.balance + job.totals.paid);
  res.json({ payment: rows[0], paid_to_date: paidUpTo, balance_after: round2(due - paidUpTo), job: { ...job, notifications: [] } });
});

export default r;
