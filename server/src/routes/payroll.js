// Payroll runs: mid-month advance run and month-end salary run (with EPF/ETF)
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, round2 } from '../lib/util.js';
import { parse, z, id, optText } from '../lib/validate.js';
import { getSettings } from '../lib/notify.js';
import { calcMonthEnd, calcMidMonth, periodRange, LINE_FIELDS, OVERRIDABLE } from '../lib/payroll.js';

const r = Router();
r.use(requirePerm('payroll.view', 'payroll.run'));

const TOTAL_FIELDS = ['basic', 'gross_pay', 'nopay_amount', 'ot_amount', 'epf_employee', 'epf_employer', 'etf_employer', 'advance_deduction', 'apit', 'other_deduction', 'net_pay'];

async function loadRun(runId, db = { query }) {
  const run = (await db.query(
    `SELECT r.*, cu.name AS created_by_name, fu.name AS finalized_by_name FROM payroll_runs r
     LEFT JOIN users cu ON cu.id = r.created_by LEFT JOIN users fu ON fu.id = r.finalized_by WHERE r.id = $1`,
    [runId],
  )).rows[0];
  if (!run) throw new HttpError(404, 'Payroll run not found');
  const lines = (await db.query(
    `SELECT l.*, e.emp_no, e.name, e.designation, e.nic, e.epf_no, e.epf_eligible, e.bank_name, e.bank_branch, e.bank_account
     FROM payroll_lines l JOIN employees e ON e.id = l.employee_id WHERE l.run_id = $1 ORDER BY e.emp_no`,
    [runId],
  )).rows;
  const totals = Object.fromEntries(TOTAL_FIELDS.map((f) => [f, round2(lines.reduce((s, l) => s + Number(l[f]), 0))]));
  return { ...run, ...periodRange(run.period), lines, totals };
}

/** (Re)calculate every line of a draft run, keeping hand-entered overrides. */
async function computeRun(c, run, onlyEmployeeId = null) {
  const settings = (await getSettings(c)).payroll || {};
  const { start, end } = periodRange(run.period);
  const emps = (await c.query(
    `SELECT * FROM employees WHERE (active OR id IN (SELECT employee_id FROM payroll_lines WHERE run_id = $1))
       AND (join_date IS NULL OR join_date <= $2) AND basic_salary > 0 ${onlyEmployeeId ? 'AND id = $3' : ''}`,
    onlyEmployeeId ? [run.id, end, onlyEmployeeId] : [run.id, end],
  )).rows;
  for (const e of emps) {
    const existing = (await c.query('SELECT overrides, note FROM payroll_lines WHERE run_id = $1 AND employee_id = $2', [run.id, e.id])).rows[0];
    const overrides = existing?.overrides || {};
    let line;
    if (run.run_type === 'MID_MONTH') {
      line = calcMidMonth(e, settings, overrides);
    } else {
      const att = (await c.query('SELECT status, ot_hours FROM attendance WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3', [e.id, start, end])).rows;
      const adv = (await c.query(
        'SELECT COALESCE(sum(amount),0) AS t FROM salary_advances WHERE employee_id = $1 AND recovered_run_id IS NULL AND advance_date <= $2',
        [e.id, end],
      )).rows[0].t;
      line = calcMonthEnd(e, att, Number(adv), settings, overrides);
    }
    await c.query(
      `INSERT INTO payroll_lines (run_id, employee_id, ${LINE_FIELDS.join(', ')}, overrides)
       VALUES ($1, $2, ${LINE_FIELDS.map((_, i) => `$${i + 3}`).join(', ')}, $${LINE_FIELDS.length + 3})
       ON CONFLICT (run_id, employee_id) DO UPDATE SET ${LINE_FIELDS.map((f) => `${f} = EXCLUDED.${f}`).join(', ')}`,
      [run.id, e.id, ...LINE_FIELDS.map((f) => line[f]), overrides],
    );
  }
}

r.get('/runs', async (_req, res) => {
  const { rows } = await query(
    `SELECT r.*, (SELECT count(*)::int FROM payroll_lines WHERE run_id = r.id) AS employees,
            (SELECT COALESCE(sum(net_pay),0) FROM payroll_lines WHERE run_id = r.id) AS total_net,
            (SELECT COALESCE(sum(epf_employee + epf_employer),0) FROM payroll_lines WHERE run_id = r.id) AS total_epf,
            (SELECT COALESCE(sum(etf_employer),0) FROM payroll_lines WHERE run_id = r.id) AS total_etf
     FROM payroll_runs r ORDER BY r.period DESC, r.run_type DESC, r.id DESC LIMIT 100`,
  );
  res.json(rows);
});

r.get('/runs/:id', async (req, res) => res.json(await loadRun(parse(id, req.params.id))));

r.post('/runs', requirePerm('payroll.run'), async (req, res) => {
  const d = parse(z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/, 'use YYYY-MM'),
    run_type: z.enum(['MID_MONTH', 'MONTH_END']),
    pay_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)),
    notes: optText,
  }), req.body);
  const runId = await tx(async (c) => {
    if (d.run_type === 'MONTH_END') {
      const mid = (await c.query(`SELECT run_no FROM payroll_runs WHERE period = $1 AND run_type = 'MID_MONTH' AND status = 'DRAFT'`, [d.period])).rows[0];
      if (mid) throw new HttpError(400, `Finalise or cancel the mid-month run ${mid.run_no} first, so its advances are deducted`);
    }
    const exists = (await c.query(`SELECT run_no FROM payroll_runs WHERE period = $1 AND run_type = $2 AND status <> 'CANCELLED'`, [d.period, d.run_type])).rows[0];
    if (exists) throw new HttpError(409, `${exists.run_no} already exists for ${d.period}`);
    const run = (await c.query(
      `INSERT INTO payroll_runs (run_no, period, run_type, pay_date, notes, created_by)
       VALUES ('PAY' || to_char(now(), 'YY') || '-' || lpad(nextval('payroll_no_seq')::text, 4, '0'), $1,$2,$3,$4,$5) RETURNING *`,
      [d.period, d.run_type, d.pay_date, d.notes, req.user.id],
    )).rows[0];
    await computeRun(c, run);
    return run.id;
  });
  res.status(201).json(await loadRun(runId));
});

async function lockDraft(c, runId) {
  const run = (await c.query('SELECT * FROM payroll_runs WHERE id = $1 FOR UPDATE', [runId])).rows[0];
  if (!run) throw new HttpError(404, 'Payroll run not found');
  if (run.status !== 'DRAFT') throw new HttpError(400, 'This payroll run is already finalised or cancelled');
  return run;
}

r.post('/runs/:id/recalculate', requirePerm('payroll.run'), async (req, res) => {
  const runId = parse(id, req.params.id);
  await tx(async (c) => computeRun(c, await lockDraft(c, runId)));
  res.json(await loadRun(runId));
});

// Edit one line (OT hours, no-pay days, bonus, APIT, other deductions, advance amount...)
r.patch('/runs/:id/lines/:lineId', requirePerm('payroll.run'), async (req, res) => {
  const runId = parse(id, req.params.id);
  const lineId = parse(id, req.params.lineId);
  const shape = Object.fromEntries(OVERRIDABLE.map((k) => [k, z.union([z.coerce.number().min(0), z.null()]).optional()]));
  const d = parse(z.object({ ...shape, note: optText }), req.body);
  await tx(async (c) => {
    const run = await lockDraft(c, runId);
    const line = (await c.query('SELECT * FROM payroll_lines WHERE id = $1 AND run_id = $2', [lineId, runId])).rows[0];
    if (!line) throw new HttpError(404, 'Line not found');
    const overrides = { ...line.overrides };
    for (const k of OVERRIDABLE) {
      if (d[k] === undefined) continue;
      if (d[k] === null) delete overrides[k]; else overrides[k] = d[k];
    }
    await c.query('UPDATE payroll_lines SET overrides = $1, note = COALESCE($2, note) WHERE id = $3', [overrides, d.note ?? null, lineId]);
    await computeRun(c, run, line.employee_id);
  });
  res.json(await loadRun(runId));
});

r.post('/runs/:id/finalize', requirePerm('payroll.run'), async (req, res) => {
  const runId = parse(id, req.params.id);
  await tx(async (c) => {
    const run = await lockDraft(c, runId);
    await computeRun(c, run);
    const lines = (await c.query('SELECT * FROM payroll_lines WHERE run_id = $1', [runId])).rows;
    if (!lines.length) throw new HttpError(400, 'No employees in this run');
    const { end } = periodRange(run.period);
    const payDate = run.pay_date || end;
    if (run.run_type === 'MID_MONTH') {
      for (const l of lines.filter((x) => Number(x.net_pay) > 0)) {
        await c.query(
          `INSERT INTO salary_advances (employee_id, advance_date, amount, reason, payment_method, source_run_id, created_by)
           VALUES ($1, LEAST($2::date, $3::date), $4, $5, 'Bank Transfer', $6, $7)`,
          [l.employee_id, payDate, end, l.net_pay, `Mid-month advance ${run.period}`, runId, req.user.id],
        );
      }
    } else {
      for (const l of lines) {
        const open = (await c.query(
          `UPDATE salary_advances SET recovered_run_id = $1 WHERE employee_id = $2 AND recovered_run_id IS NULL AND advance_date <= $3 RETURNING amount`,
          [runId, l.employee_id, end],
        )).rows;
        const outstanding = round2(open.reduce((s, a) => s + Number(a.amount), 0));
        const carry = round2(outstanding - Number(l.advance_deduction));
        if (carry > 0) {
          // Part of the advance was not deducted this month – carry it to next month
          await c.query(
            `INSERT INTO salary_advances (employee_id, advance_date, amount, reason, payment_method, created_by)
             VALUES ($1, ($2::date + 1), $3, $4, 'Carried forward', $5)`,
            [l.employee_id, end, carry, `Balance carried forward from ${run.run_no}`, req.user.id],
          );
        }
      }
    }
    await c.query(`UPDATE payroll_runs SET status = 'FINALIZED', finalized_by = $1, finalized_at = now(), pay_date = COALESCE(pay_date, $2) WHERE id = $3`,
      [req.user.id, payDate, runId]);
  });
  res.json(await loadRun(runId));
});

r.post('/runs/:id/cancel', requirePerm('payroll.run'), async (req, res) => {
  const runId = parse(id, req.params.id);
  await tx(async (c) => {
    await lockDraft(c, runId);
    await c.query(`UPDATE payroll_runs SET status = 'CANCELLED' WHERE id = $1`, [runId]);
  });
  res.json(await loadRun(runId));
});

export default r;
