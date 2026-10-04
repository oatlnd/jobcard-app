// Money received for a job card. All payments live in job_payments (one row = one receipt).
// The invoice (created when the work is finished) keeps paid_amount equal to the sum, so older
// screens and reports keep working.
import { HttpError, round2 } from './util.js';
import { computeTotals } from './jobs.js';
import { getSettings } from './notify.js';

export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Other'];

/** 'DUE' (customer owes money), 'REFUND' (we owe the customer), or 'PAID' (nothing outstanding) */
export function paymentState(total, paid) {
  const balance = round2(total - paid);
  if (balance > 0.005) return 'DUE';
  if (balance < -0.005) return 'REFUND';
  return 'PAID';
}

export async function paidTotal(c, jobId) {
  const { rows } = await c.query(
    `SELECT COALESCE(sum(CASE WHEN kind = 'REFUND' THEN -amount ELSE amount END), 0) AS paid FROM job_payments WHERE job_card_id = $1`,
    [jobId],
  );
  return round2(Number(rows[0].paid));
}

/** What the customer has to pay in total: the invoice total once invoiced, otherwise the live estimate. */
export async function jobTotal(c, jobId) {
  const job = (await c.query('SELECT discount, status FROM job_cards WHERE id = $1', [jobId])).rows[0];
  if (job?.status === 'CANCELLED') return 0; // everything paid on a cancelled job is refundable
  const inv = (await c.query('SELECT total FROM invoices WHERE job_card_id = $1', [jobId])).rows[0];
  if (inv) return round2(Number(inv.total));
  const items = (await c.query('SELECT item_type, line_total FROM job_items WHERE job_card_id = $1', [jobId])).rows;
  const settings = await getSettings(c);
  return computeTotals(items, job?.discount, settings.billing?.tax_rate).total;
}

export async function balanceOf(c, jobId) {
  const [total, paid] = await Promise.all([jobTotal(c, jobId), paidTotal(c, jobId)]);
  return { total, paid, balance: round2(total - paid), state: paymentState(total, paid) };
}

/** Keep the invoice's paid amount / status in step with the receipts. */
export async function syncInvoice(c, jobId) {
  const inv = (await c.query('SELECT id, total FROM invoices WHERE job_card_id = $1', [jobId])).rows[0];
  if (!inv) return;
  const paid = await paidTotal(c, jobId);
  const last = (await c.query(`SELECT method FROM job_payments WHERE job_card_id = $1 AND kind = 'PAYMENT' ORDER BY id DESC LIMIT 1`, [jobId])).rows[0];
  const status = paid <= 0 ? 'UNPAID' : paid + 0.005 >= Number(inv.total) ? 'PAID' : 'PARTIAL';
  await c.query('UPDATE invoices SET paid_amount = $1, status = $2, payment_method = $3 WHERE id = $4', [Math.max(paid, 0), status, last?.method || null, inv.id]);
}

/** Create the invoice from the job's current items (job must be locked by the caller). */
export async function createInvoice(c, jobId, userId) {
  const job = (await c.query('SELECT * FROM job_cards WHERE id = $1', [jobId])).rows[0];
  const items = (await c.query('SELECT * FROM job_items WHERE job_card_id = $1', [jobId])).rows;
  if (!items.length && !['FREE_1', 'FREE_2'].includes(job.service_kind)) throw new HttpError(400, 'No items to invoice');
  const settings = await getSettings(c);
  const t = computeTotals(items, job.discount, settings.billing?.tax_rate);
  await c.query(
    `INSERT INTO invoices (invoice_no, job_card_id, parts_total, labour_total, discount, tax_rate, tax_amount, total, issued_by)
     VALUES ('INV' || to_char(now(), 'YY') || '-' || lpad(nextval('invoice_no_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,$8)`,
    [jobId, t.parts_total, t.labour_total, t.discount, t.tax_rate, t.tax_amount, t.total, userId],
  );
  await syncInvoice(c, jobId);
}

/**
 * Record a payment or refund. Locks the job card. Returns the new receipt row.
 * Payments can't be more than the balance; refunds can't be more than what was overpaid.
 */
export async function recordPayment(c, jobId, d, userId) {
  const job = (await c.query('SELECT id, status, delivery_status FROM job_cards WHERE id = $1 FOR UPDATE', [jobId])).rows[0];
  if (!job) throw new HttpError(404, 'Job card not found');
  if (job.status === 'CANCELLED' && d.kind !== 'REFUND') throw new HttpError(400, 'This job card is cancelled');
  const { balance } = await balanceOf(c, jobId);
  const amount = round2(d.amount);
  let cashGiven = null;
  let change = null;
  if (d.kind === 'REFUND') {
    if (amount > round2(-balance) + 0.005) throw new HttpError(400, `Refund can't be more than LKR ${round2(Math.max(-balance, 0)).toFixed(2)}`);
  } else {
    if (balance <= 0.005) throw new HttpError(400, 'Nothing to pay – this job card is already fully paid');
    if (amount > balance + 0.005) throw new HttpError(400, `Payment can't be more than the balance of LKR ${balance.toFixed(2)}`);
    if (d.method === 'Cash' && d.cash_given != null && d.cash_given !== '') {
      cashGiven = round2(d.cash_given);
      if (cashGiven + 0.005 < amount) throw new HttpError(400, 'Cash given is less than the amount being paid');
      change = round2(cashGiven - amount);
    }
  }
  const { rows } = await c.query(
    `INSERT INTO job_payments (receipt_no, job_card_id, kind, amount, method, cash_given, change_given, reference, received_by)
     VALUES ('RC' || to_char(now(), 'YY') || '-' || lpad(nextval('receipt_no_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [jobId, d.kind || 'PAYMENT', amount, d.method, cashGiven, change, d.reference || null, userId],
  );
  await syncInvoice(c, jobId);
  await c.query('UPDATE job_cards SET updated_at = now() WHERE id = $1', [jobId]);
  return rows[0];
}
