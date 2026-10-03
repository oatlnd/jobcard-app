// Public service status lookup for customers (no login).
// Requires bike number + last 4 digits of the registered mobile, so strangers can't look up other people's bikes.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { HttpError, normalizeRegNo } from '../lib/util.js';
import { parse, z } from '../lib/validate.js';
import { LABELS } from '../lib/status.js';

const r = Router();
r.use(rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

r.get('/shop', async (_req, res) => {
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'shop'`);
  const s = rows[0]?.value || {};
  res.json({ name: s.name, phone: s.phone, address: s.address });
});

r.get('/status', async (req, res) => {
  const d = parse(
    z.object({ bike: z.string().min(2).max(20), mobile4: z.string().regex(/^\d{4}$/, 'enter the last 4 digits of your mobile') }),
    req.query,
  );
  const reg = normalizeRegNo(d.bike);
  const { rows } = await query(
    `SELECT j.id, j.job_no, j.status, j.service_type, j.promised_at, j.created_at, j.completed_at, j.delivered_at,
            b.reg_no, b.model, b.next_service_due_date, c.mobile
     FROM bikes b JOIN customers c ON c.id = b.customer_id
     LEFT JOIN LATERAL (SELECT * FROM job_cards WHERE bike_id = b.id ORDER BY id DESC LIMIT 1) j ON true
     WHERE b.reg_no = $1`,
    [reg],
  );
  const row = rows[0];
  // Same message for "no bike" and "wrong digits" so nothing leaks.
  if (!row || !row.mobile.endsWith(d.mobile4)) throw new HttpError(404, 'No matching bike found. Check the bike number and mobile digits.');
  let history = [];
  if (row.id) {
    const h = await query('SELECT to_status, changed_at FROM job_status_history WHERE job_card_id = $1 ORDER BY changed_at, id', [row.id]);
    history = h.rows;
  }
  res.json({
    reg_no: row.reg_no,
    model: row.model,
    next_service_due_date: row.next_service_due_date,
    job: row.id
      ? {
          job_no: row.job_no, status: row.status, service_type: row.service_type,
          promised_at: row.promised_at, created_at: row.created_at, completed_at: row.completed_at, delivered_at: row.delivered_at,
          label_en: LABELS.en[row.status], label_ta: LABELS.ta[row.status],
          history,
        }
      : null,
  });
});

export default r;
