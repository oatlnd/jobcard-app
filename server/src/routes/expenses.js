// Internal (shop running costs) and external (outside work, linked to a job or supplier) expenses
import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError } from '../lib/util.js';
import { parse, z, id, money, optText } from '../lib/validate.js';
import { listAttachments } from './attachments.js';
import { assertLookup } from './masters.js';

const r = Router();
r.use(requirePerm('expenses.view'));

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'];

r.get('/', async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };
  if (req.query.from) add('e.expense_date >= $?', req.query.from);
  if (req.query.to) add('e.expense_date <= $?', req.query.to);
  if (req.query.type) add('e.expense_type = $?', req.query.type);
  if (req.query.category) add('e.category = $?', req.query.category);
  if (req.query.q) add('(lower(e.description) LIKE $? OR lower(e.paid_to) LIKE $? OR lower(e.expense_no) LIKE $?)', `%${String(req.query.q).toLowerCase()}%`);
  const { rows } = await query(
    `SELECT e.*, j.job_no, s.name AS supplier_name, u.name AS created_by_name,
       (SELECT count(*)::int FROM attachments a WHERE a.entity_type = 'expense' AND a.entity_id = e.id) AS attachment_count
     FROM expenses e LEFT JOIN job_cards j ON j.id = e.job_card_id LEFT JOIN suppliers s ON s.id = e.supplier_id
     LEFT JOIN users u ON u.id = e.created_by
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.expense_date DESC, e.id DESC LIMIT 500`,
    params,
  );
  const byCategory = {};
  let total = 0;
  for (const e of rows) { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount); total += Number(e.amount); }
  res.json({ expenses: rows, total, by_category: byCategory });
});

r.get('/:id', async (req, res) => {
  const eid = parse(id, req.params.id);
  const e = (await query(
    `SELECT e.*, j.job_no, s.name AS supplier_name FROM expenses e LEFT JOIN job_cards j ON j.id = e.job_card_id
     LEFT JOIN suppliers s ON s.id = e.supplier_id WHERE e.id = $1`,
    [eid],
  )).rows[0];
  if (!e) throw new HttpError(404, 'Expense not found');
  res.json({ ...e, attachments: await listAttachments('expense', eid) });
});

const schema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expense_type: z.enum(['INTERNAL', 'EXTERNAL']),
  category: z.string().trim().min(1),
  description: z.string().trim().min(1).max(300),
  amount: money.refine((n) => n > 0, 'must be more than 0'),
  payment_method: z.enum(PAYMENT_METHODS).default('Cash'),
  paid_to: optText,
  reference_no: optText,
  job_no: optText,           // optional link to a job card by number
  supplier_id: id.optional().nullable(),
});
const COLS = ['expense_date', 'expense_type', 'category', 'description', 'amount', 'payment_method', 'paid_to', 'reference_no', 'job_card_id', 'supplier_id'];

async function resolveJob(jobNo) {
  if (!jobNo) return null;
  const j = (await query('SELECT id FROM job_cards WHERE upper(job_no) = upper($1)', [jobNo.trim()])).rows[0];
  if (!j) throw new HttpError(400, `Job card ${jobNo} not found`);
  return j.id;
}

r.post('/', requirePerm('expenses.manage'), async (req, res) => {
  const d = parse(schema, req.body);
  await assertLookup('expense_category', d.category);
  const row = { ...d, job_card_id: await resolveJob(d.job_no), supplier_id: d.supplier_id || null };
  const { rows } = await query(
    `INSERT INTO expenses (expense_no, ${COLS.join(', ')}, created_by)
     VALUES ('EXP' || to_char(now(), 'YY') || '-' || lpad(nextval('expense_no_seq')::text, 5, '0'), ${COLS.map((_, i) => `$${i + 1}`).join(', ')}, $${COLS.length + 1})
     RETURNING *`,
    [...COLS.map((k) => row[k]), req.user.id],
  );
  res.status(201).json(rows[0]);
});

r.put('/:id', requirePerm('expenses.manage'), async (req, res) => {
  const d = parse(schema, req.body);
  await assertLookup('expense_category', d.category);
  const row = { ...d, job_card_id: await resolveJob(d.job_no), supplier_id: d.supplier_id || null };
  const { rows } = await query(
    `UPDATE expenses SET ${COLS.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${COLS.length + 1} RETURNING *`,
    [...COLS.map((k) => row[k]), parse(id, req.params.id)],
  );
  if (!rows[0]) throw new HttpError(404, 'Expense not found');
  res.json(rows[0]);
});

r.delete('/:id', requirePerm('expenses.manage'), async (req, res) => {
  const eid = parse(id, req.params.id);
  const att = (await query(`SELECT count(*)::int AS n FROM attachments WHERE entity_type = 'expense' AND entity_id = $1`, [eid])).rows[0].n;
  if (att) throw new HttpError(400, 'Remove the attached photos first');
  const { rowCount } = await query('DELETE FROM expenses WHERE id = $1', [eid]);
  if (!rowCount) throw new HttpError(404, 'Expense not found');
  res.json({ ok: true });
});

export default r;
