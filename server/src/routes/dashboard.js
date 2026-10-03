import { Router } from 'express';
import { query } from '../db.js';

const r = Router();

r.get('/summary', async (_req, res) => {
  const [byStatus, today, month, low, due, failed] = await Promise.all([
    query(`SELECT status, count(*)::int AS n FROM job_cards WHERE status NOT IN ('DELIVERED','CANCELLED') GROUP BY status`),
    query(`SELECT
             (SELECT count(*) FROM job_cards WHERE created_at::date = CURRENT_DATE)::int AS checked_in,
             (SELECT count(*) FROM job_cards WHERE delivered_at::date = CURRENT_DATE)::int AS delivered,
             (SELECT COALESCE(sum(total),0) FROM invoices WHERE issued_at::date = CURRENT_DATE) AS invoiced,
             (SELECT COALESCE(sum(paid_amount),0) FROM invoices WHERE issued_at::date = CURRENT_DATE) AS collected`),
    query(`SELECT count(*)::int AS jobs, COALESCE(sum(total),0) AS invoiced, COALESCE(sum(total - paid_amount),0) AS outstanding
           FROM invoices WHERE date_trunc('month', issued_at) = date_trunc('month', now())`),
    query(`SELECT count(*)::int AS n FROM parts WHERE active AND stock_qty <= reorder_level`),
    query(`SELECT count(*)::int AS n FROM bikes WHERE next_service_due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`),
    query(`SELECT count(*)::int AS n FROM notifications WHERE status = 'FAILED' AND created_at > now() - interval '7 days'`),
  ]);
  res.json({
    open_by_status: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.n])),
    today: today.rows[0],
    month: month.rows[0],
    low_stock: low.rows[0].n,
    service_due_7d: due.rows[0].n,
    failed_notifications_7d: failed.rows[0].n,
  });
});

export default r;
