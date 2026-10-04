import { query } from '../db.js';
import { HttpError, round2 } from './util.js';
import { hasPerm } from '../auth.js';

// A job is "open" until the bike is delivered (or the job is cancelled)
export const OPEN_SQL = `(j.status <> 'CANCELLED' AND j.delivery_status <> 'DELIVERED')`;

export const SERVICE_TYPES = ['service', 'custom_service'];
export const PART_TYPES = ['part', 'custom_part'];

export function computeTotals(items, discount = 0, taxRate = 0) {
  const sum = (types) => round2(items.filter((i) => types.includes(i.item_type)).reduce((s, i) => s + Number(i.line_total), 0));
  const parts = sum(PART_TYPES);
  const services = sum(SERVICE_TYPES);
  const subtotal = round2(parts + services);
  const disc = Math.min(round2(discount), subtotal);
  const taxable = round2(subtotal - disc);
  const tax = round2((taxable * Number(taxRate || 0)) / 100);
  return {
    parts_total: parts,
    labour_total: services, // kept as "labour_total" for invoices; shown as "Services"
    services_total: services,
    subtotal,
    discount: disc,
    tax_rate: Number(taxRate || 0),
    tax_amount: tax,
    total: round2(taxable + tax),
  };
}

/** Mechanics (no jobs.view_all) only see jobs assigned to them or not yet assigned. */
export function scopeSql(user, alias = 'j', paramIndex) {
  if (hasPerm(user, 'jobs.view_all')) return { sql: '', params: [] };
  return { sql: ` AND (${alias}.mechanic_id = $${paramIndex} OR ${alias}.mechanic_id IS NULL)`, params: [user.id] };
}

export function assertCanSee(user, job) {
  if (hasPerm(user, 'jobs.view_all')) return;
  if (job.mechanic_id && job.mechanic_id !== user.id) throw new HttpError(403, 'This job is assigned to someone else');
}

/** Load a job card with everything the detail screen needs. */
export async function loadJob(jobId, db = { query }) {
  const { rows } = await db.query(
    `SELECT j.*,
       row_to_json(b.*) AS bike,
       row_to_json(c.*) AS customer,
       m.name AS mechanic_name, a.name AS advisor_name
     FROM job_cards j
     JOIN bikes b ON b.id = j.bike_id
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN users m ON m.id = j.mechanic_id
     LEFT JOIN users a ON a.id = j.advisor_id
     WHERE j.id = $1`,
    [jobId],
  );
  const job = rows[0];
  if (!job) throw new HttpError(404, 'Job card not found');
  const [items, history, invoice, notes, settings, payments] = await Promise.all([
    db.query(
      `SELECT ji.*, p.part_no, p.unit FROM job_items ji LEFT JOIN parts p ON p.id = ji.part_id
       WHERE job_card_id = $1 ORDER BY CASE WHEN ji.item_type IN ('service','custom_service') THEN 0 ELSE 1 END, ji.id`,
      [jobId],
    ),
    db.query(
      `SELECT h.*, u.name AS changed_by_name FROM job_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE job_card_id = $1 ORDER BY h.changed_at, h.id`,
      [jobId],
    ),
    db.query('SELECT * FROM invoices WHERE job_card_id = $1', [jobId]),
    db.query('SELECT id, channel, template, status, body, attempts, last_error, sent_at, created_at FROM notifications WHERE job_card_id = $1 ORDER BY id DESC', [jobId]),
    db.query(`SELECT value FROM settings WHERE key = 'billing'`),
    db.query(
      `SELECT p.*, u.name AS received_by_name FROM job_payments p LEFT JOIN users u ON u.id = p.received_by
       WHERE p.job_card_id = $1 ORDER BY p.id`,
      [jobId],
    ),
  ]);
  const taxRate = invoice.rows[0]?.tax_rate ?? settings.rows[0]?.value?.tax_rate ?? 0;
  const totals = computeTotals(items.rows, job.discount, taxRate);
  const paid = round2(payments.rows.reduce((s, p) => s + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount), 0));
  const due = job.status === 'CANCELLED' ? 0 : invoice.rows[0] ? Number(invoice.rows[0].total) : totals.total;
  const balance = round2(due - paid);
  return {
    ...job,
    items: items.rows,
    history: history.rows,
    invoice: invoice.rows[0] || null,
    notifications: notes.rows,
    payments: payments.rows,
    totals: { ...totals, paid, balance },
    // 'DUE' | 'REFUND' | 'PAID' – also shown to people who can't see amounts (e.g. mechanics)
    payment_state: balance > 0.005 ? 'DUE' : balance < -0.005 ? 'REFUND' : 'PAID',
  };
}

/** Remove money fields for users who may not see prices. */
export const canSeeMoney = (user) => hasPerm(user, 'jobs.pricing') || hasPerm(user, 'payments.record');

export function sanitizeJob(job, user) {
  if (canSeeMoney(user)) return job;
  return {
    ...job,
    discount: undefined,
    totals: undefined,
    invoice: job.invoice ? { id: job.invoice.id, invoice_no: job.invoice.invoice_no, status: job.invoice.status } : null,
    payments: hasPerm(user, 'payments.record') ? job.payments : [],
    items: job.items.map(({ unit_price, line_total, unit_cost, ...rest }) => rest),
    notifications: hasPerm(user, 'messages.view') ? job.notifications : [],
  };
}

export function assertEditable(job) {
  if (job.status === 'CANCELLED') throw new HttpError(400, 'Job card is cancelled and can no longer be changed');
  if (job.delivery_status === 'DELIVERED') throw new HttpError(400, 'The bike has been delivered – this job card is closed');
}
