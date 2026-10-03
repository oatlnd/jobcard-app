// Employees, attendance and salary advances
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, normalizeMobile } from '../lib/util.js';
import { parse, z, id, money, optText } from '../lib/validate.js';
import { periodRange } from '../lib/payroll.js';

const r = Router();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const optDate = date.optional().nullable().or(z.literal('').transform(() => null));
const period = z.string().regex(/^\d{4}-\d{2}$/, 'use YYYY-MM');

// ================= Employees =================
r.get('/employees', requirePerm('employees.view', 'attendance.manage', 'advances.manage', 'payroll.view'), async (req, res) => {
  const { rows } = await query(
    `SELECT e.*, u.username,
       (SELECT COALESCE(sum(amount),0) FROM salary_advances a WHERE a.employee_id = e.id AND a.recovered_run_id IS NULL) AS advance_outstanding
     FROM employees e LEFT JOIN users u ON u.id = e.user_id
     ${req.query.all === '1' ? '' : 'WHERE e.active'} ORDER BY e.active DESC, e.emp_no`,
  );
  res.json(rows);
});

r.get('/employees/:id', requirePerm('employees.view'), async (req, res) => {
  const eid = parse(id, req.params.id);
  const e = (await query('SELECT * FROM employees WHERE id = $1', [eid])).rows[0];
  if (!e) throw new HttpError(404, 'Employee not found');
  const [advances, payslips] = await Promise.all([
    query(`SELECT a.*, r.run_no AS recovered_run_no FROM salary_advances a LEFT JOIN payroll_runs r ON r.id = a.recovered_run_id
           WHERE employee_id = $1 ORDER BY advance_date DESC, id DESC LIMIT 50`, [eid]),
    query(`SELECT l.id, l.net_pay, l.gross_pay, r.id AS run_id, r.run_no, r.period, r.run_type, r.status FROM payroll_lines l
           JOIN payroll_runs r ON r.id = l.run_id WHERE l.employee_id = $1 AND r.status <> 'CANCELLED' ORDER BY r.period DESC, r.run_type DESC LIMIT 24`, [eid]),
  ]);
  res.json({ ...e, advances: advances.rows, payslips: payslips.rows });
});

const empSchema = z.object({
  emp_no: z.string().trim().max(20).optional().nullable(),
  name: z.string().trim().min(1).max(120),
  nic: optText,
  designation: optText,
  mobile: optText,
  address: optText,
  date_of_birth: optDate,
  join_date: optDate,
  basic_salary: money,
  epf_allowance: money.default(0),
  other_allowance: money.default(0),
  epf_eligible: z.boolean().default(true),
  epf_no: optText,
  bank_name: optText,
  bank_branch: optText,
  bank_account: optText,
  user_id: id.optional().nullable(),
  active: z.boolean().default(true),
  resigned_date: optDate,
  notes: optText,
});
const EMP_COLS = Object.keys(empSchema.shape).filter((k) => k !== 'emp_no');

const clean = (d) => ({ ...d, mobile: d.mobile ? normalizeMobile(d.mobile) || d.mobile : null, user_id: d.user_id || null });

r.post('/employees', requirePerm('employees.manage'), async (req, res) => {
  const d = clean(parse(empSchema, req.body));
  let empNo = d.emp_no;
  if (!empNo) {
    const n = (await query(`SELECT count(*)::int + 1 AS n FROM employees`)).rows[0].n;
    empNo = `EMP${String(n).padStart(3, '0')}`;
  }
  const { rows } = await query(
    `INSERT INTO employees (emp_no, ${EMP_COLS.join(', ')}) VALUES ($1, ${EMP_COLS.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
    [empNo.toUpperCase(), ...EMP_COLS.map((k) => d[k])],
  );
  res.status(201).json(rows[0]);
});

r.put('/employees/:id', requirePerm('employees.manage'), async (req, res) => {
  const d = clean(parse(empSchema, req.body));
  const cols = d.emp_no ? ['emp_no', ...EMP_COLS] : EMP_COLS;
  if (d.emp_no) d.emp_no = d.emp_no.toUpperCase();
  const { rows } = await query(
    `UPDATE employees SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
    [...cols.map((k) => d[k]), parse(id, req.params.id)],
  );
  if (!rows[0]) throw new HttpError(404, 'Employee not found');
  res.json(rows[0]);
});

// ================= Attendance =================
async function assertPeriodOpen(db, dateStr) {
  const p = dateStr.slice(0, 7);
  const locked = (await db.query(`SELECT run_no FROM payroll_runs WHERE period = $1 AND run_type = 'MONTH_END' AND status = 'FINALIZED'`, [p])).rows[0];
  if (locked) throw new HttpError(400, `Payroll ${locked.run_no} for ${p} is finalised – attendance for that month is locked`);
}

// One day: every active employee with their record (if marked)
r.get('/attendance', requirePerm('attendance.manage', 'employees.view'), async (req, res) => {
  const day = parse(date, req.query.date || new Date().toISOString().slice(0, 10));
  const { rows } = await query(
    `SELECT e.id AS employee_id, e.emp_no, e.name, e.designation, a.id, a.status, a.time_in, a.time_out, a.ot_hours, a.note, u.name AS marked_by_name
     FROM employees e
     LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date = $1
     LEFT JOIN users u ON u.id = a.marked_by
     WHERE e.active OR a.id IS NOT NULL
     ORDER BY e.emp_no`,
    [day],
  );
  res.json({ date: day, rows });
});

const attRow = z.object({
  employee_id: id,
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY']).nullable(),
  time_in: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable().or(z.literal('').transform(() => null)),
  time_out: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable().or(z.literal('').transform(() => null)),
  ot_hours: z.coerce.number().min(0).max(24).default(0),
  note: optText,
});

r.put('/attendance', requirePerm('attendance.manage'), async (req, res) => {
  const d = parse(z.object({ date, records: z.array(attRow).max(500) }), req.body);
  await tx(async (c) => {
    await assertPeriodOpen(c, d.date);
    for (const a of d.records) {
      if (!a.status) {
        await c.query('DELETE FROM attendance WHERE employee_id = $1 AND work_date = $2', [a.employee_id, d.date]);
        continue;
      }
      await c.query(
        `INSERT INTO attendance (employee_id, work_date, status, time_in, time_out, ot_hours, note, marked_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (employee_id, work_date) DO UPDATE SET status = EXCLUDED.status, time_in = EXCLUDED.time_in, time_out = EXCLUDED.time_out,
           ot_hours = EXCLUDED.ot_hours, note = EXCLUDED.note, marked_by = EXCLUDED.marked_by, updated_at = now()`,
        [a.employee_id, d.date, a.status, a.time_in || null, a.time_out || null, a.ot_hours, a.note, req.user.id],
      );
    }
  });
  res.json({ ok: true });
});

// Month grid + totals per employee
r.get('/attendance/summary', requirePerm('attendance.manage', 'employees.view', 'payroll.view'), async (req, res) => {
  const p = parse(period, req.query.period || new Date().toISOString().slice(0, 7));
  const { start, end, days } = periodRange(p);
  const [emps, att] = await Promise.all([
    query(`SELECT id, emp_no, name, designation FROM employees WHERE active OR id IN (SELECT employee_id FROM attendance WHERE work_date BETWEEN $1 AND $2) ORDER BY emp_no`, [start, end]),
    query(`SELECT employee_id, work_date, status, ot_hours FROM attendance WHERE work_date BETWEEN $1 AND $2`, [start, end]),
  ]);
  const by = {};
  for (const a of att.rows) (by[a.employee_id] ||= []).push(a);
  const rows = emps.rows.map((e) => {
    const list = by[e.id] || [];
    const c = (s) => list.filter((a) => a.status === s).length;
    return {
      ...e,
      days: Object.fromEntries(list.map((a) => [Number(a.work_date.slice(8, 10)), a.status])),
      present: c('PRESENT'), absent: c('ABSENT'), half_day: c('HALF_DAY'), leave: c('LEAVE'), holiday: c('HOLIDAY'),
      ot_hours: list.reduce((t, a) => t + Number(a.ot_hours || 0), 0),
      unmarked: days - list.length,
    };
  });
  res.json({ period: p, days, rows });
});

// ================= Salary advances =================
r.get('/advances', requirePerm('advances.manage', 'payroll.view'), async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.employee_id) { params.push(Number(req.query.employee_id)); where.push(`a.employee_id = $${params.length}`); }
  if (req.query.open === '1') where.push('a.recovered_run_id IS NULL');
  if (req.query.period) {
    const { start, end } = periodRange(req.query.period);
    params.push(start, end);
    where.push(`a.advance_date BETWEEN $${params.length - 1} AND $${params.length}`);
  }
  const { rows } = await query(
    `SELECT a.*, e.emp_no, e.name AS employee_name, rr.run_no AS recovered_run_no, sr.run_no AS source_run_no, u.name AS created_by_name
     FROM salary_advances a JOIN employees e ON e.id = a.employee_id
     LEFT JOIN payroll_runs rr ON rr.id = a.recovered_run_id LEFT JOIN payroll_runs sr ON sr.id = a.source_run_id
     LEFT JOIN users u ON u.id = a.created_by
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.advance_date DESC, a.id DESC LIMIT 500`,
    params,
  );
  res.json(rows);
});

r.post('/advances', requirePerm('advances.manage'), async (req, res) => {
  const d = parse(z.object({
    employee_id: id, advance_date: date, amount: money.refine((n) => n > 0, 'must be more than 0'),
    reason: optText, payment_method: z.enum(['Cash', 'Bank Transfer', 'Cheque']).default('Cash'),
  }), req.body);
  const emp = (await query('SELECT active FROM employees WHERE id = $1', [d.employee_id])).rows[0];
  if (!emp?.active) throw new HttpError(400, 'Employee not found or inactive');
  const { rows } = await query(
    `INSERT INTO salary_advances (employee_id, advance_date, amount, reason, payment_method, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.employee_id, d.advance_date, d.amount, d.reason, d.payment_method, req.user.id],
  );
  res.status(201).json(rows[0]);
});

r.delete('/advances/:id', requirePerm('advances.manage'), async (req, res) => {
  const { rows } = await query(
    'DELETE FROM salary_advances WHERE id = $1 AND recovered_run_id IS NULL AND source_run_id IS NULL RETURNING id',
    [parse(id, req.params.id)],
  );
  if (!rows[0]) throw new HttpError(400, 'Only manual advances not yet deducted in payroll can be deleted');
  res.json({ ok: true });
});

export default r;
