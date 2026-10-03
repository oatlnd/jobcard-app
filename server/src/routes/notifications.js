import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
import { parse, id } from '../lib/validate.js';
import { HttpError } from '../lib/util.js';

const r = Router();

r.get('/', requirePerm('messages.view'), async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) { params.push(req.query.status); where = 'WHERE n.status = $1'; }
  const { rows } = await query(
    `SELECT n.*, c.name AS customer_name, j.job_no FROM notifications n
     LEFT JOIN customers c ON c.id = n.customer_id LEFT JOIN job_cards j ON j.id = n.job_card_id
     ${where} ORDER BY n.id DESC LIMIT 200`,
    params,
  );
  res.json(rows);
});

r.post('/:id/retry', requirePerm('messages.send'), async (req, res) => {
  const nid = parse(id, req.params.id);
  const { rows } = await query(
    `UPDATE notifications SET status = 'QUEUED', attempts = 0, last_error = NULL, send_after = now()
     WHERE id = $1 AND status = 'FAILED' RETURNING *`,
    [nid],
  );
  if (!rows[0]) throw new HttpError(400, 'Only failed messages can be retried');
  res.json(rows[0]);
});

export default r;
