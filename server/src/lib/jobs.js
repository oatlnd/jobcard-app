import { query } from '../db.js';
import { HttpError, round2 } from './util.js';

export const OPEN_STATUSES = ['CHECKED_IN', 'IN_PROGRESS', 'WAITING_PARTS', 'QA_CHECK', 'READY'];

export function computeTotals(items, discount = 0, taxRate = 0) {
  const parts = round2(items.filter((i) => i.item_type === 'part').reduce((s, i) => s + Number(i.line_total), 0));
  const labour = round2(items.filter((i) => i.item_type === 'labour').reduce((s, i) => s + Number(i.line_total), 0));
  const subtotal = round2(parts + labour);
  const disc = Math.min(round2(discount), subtotal);
  const taxable = round2(subtotal - disc);
  const tax = round2((taxable * Number(taxRate || 0)) / 100);
  return { parts_total: parts, labour_total: labour, subtotal, discount: disc, tax_rate: Number(taxRate || 0), tax_amount: tax, total: round2(taxable + tax) };
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
  const [items, history, invoice, notes, settings] = await Promise.all([
    db.query('SELECT ji.*, p.part_no FROM job_items ji LEFT JOIN parts p ON p.id = ji.part_id WHERE job_card_id = $1 ORDER BY ji.id', [jobId]),
    db.query(
      `SELECT h.*, u.name AS changed_by_name FROM job_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE job_card_id = $1 ORDER BY h.changed_at, h.id`,
      [jobId],
    ),
    db.query('SELECT * FROM invoices WHERE job_card_id = $1', [jobId]),
    db.query('SELECT id, channel, template, status, body, attempts, last_error, sent_at, created_at FROM notifications WHERE job_card_id = $1 ORDER BY id DESC', [jobId]),
    db.query(`SELECT value FROM settings WHERE key = 'billing'`),
  ]);
  const taxRate = invoice.rows[0]?.tax_rate ?? settings.rows[0]?.value?.tax_rate ?? 0;
  return {
    ...job,
    items: items.rows,
    history: history.rows,
    invoice: invoice.rows[0] || null,
    notifications: notes.rows,
    totals: computeTotals(items.rows, job.discount, taxRate),
  };
}

export function assertEditable(job) {
  if (['DELIVERED', 'CANCELLED'].includes(job.status)) throw new HttpError(400, `Job card is ${job.status.toLowerCase()} and can no longer be changed`);
}
