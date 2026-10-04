// Reports
import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';

const r = Router();
const dateOr = (v, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? v : fallback);

// Free services given in a date range – the list to claim free-service labour from Honda
r.get('/free-services', requirePerm('invoices.view', 'dashboard.finance'), async (req, res) => {
  // Default: this month so far (dates worked out by the database, in the shop's time zone)
  const range = (await query(
    `SELECT COALESCE($1::date, date_trunc('month', CURRENT_DATE)::date)::text AS from, COALESCE($2::date, CURRENT_DATE)::text AS to`,
    [dateOr(req.query.from, null), dateOr(req.query.to, null)],
  )).rows[0];
  const { from, to } = range;
  const { rows } = await query(
    `SELECT j.id, j.job_no, j.service_kind, j.odometer, j.status, j.delivery_status, j.created_at, j.delivered_at,
            b.reg_no, b.model, b.year, b.engine_no, b.chassis_no, b.sale_date,
            c.name AS customer_name, c.mobile, m.name AS mechanic_name
     FROM job_cards j JOIN bikes b ON b.id = j.bike_id JOIN customers c ON c.id = j.customer_id
     LEFT JOIN users m ON m.id = j.mechanic_id
     WHERE j.service_kind IN ('FREE_1','FREE_2') AND j.status <> 'CANCELLED'
       AND j.created_at >= $1::date AND j.created_at < $2::date + 1
     ORDER BY j.created_at`,
    [from, to],
  );
  res.json({ from, to, rows, counts: { FREE_1: rows.filter((x) => x.service_kind === 'FREE_1').length, FREE_2: rows.filter((x) => x.service_kind === 'FREE_2').length } });
});

export default r;
