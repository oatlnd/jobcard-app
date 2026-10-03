// Payroll calculations (Sri Lanka). All rates come from Settings → Payroll so they can be changed without code.
//
// Month-end:
//   No-pay       = basic ÷ nopay_day_divisor (default 30) × no-pay days (absent + ½ for half days)
//   OT           = basic ÷ ot_hour_divisor (default 240) × ot_multiplier (default 1.5) × OT hours
//   Gross        = basic + EPF allowances + other allowances + OT + other additions − no-pay
//   EPF base     = basic + EPF allowances − no-pay          (OT and non-EPF allowances excluded)
//   EPF employee = 8%  of EPF base (deducted from pay)
//   EPF employer = 12% of EPF base (company cost)
//   ETF employer = 3%  of EPF base (company cost)
//   Net pay      = gross − EPF employee − advances − APIT − other deductions
// Mid-month: advance = basic × mid_month_percent (default 40%), deducted in that month's month-end run.
import { round2 } from './util.js';

export const DEFAULT_PAYROLL = {
  epf_employee_rate: 8, epf_employer_rate: 12, etf_rate: 3, ot_multiplier: 1.5, ot_hour_divisor: 240, nopay_day_divisor: 30, mid_month_percent: 40,
};

// Fields staff may type over on a payroll line (kept when the run is recalculated)
export const OVERRIDABLE = ['nopay_days', 'ot_hours', 'other_addition', 'apit', 'other_deduction', 'advance_deduction', 'net_pay'];

export function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end, days: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

/** attendance: rows for this employee in the period; advances: total outstanding advances up to period end */
export function calcMonthEnd(emp, attendance, advancesOutstanding, settings, overrides = {}) {
  const s = { ...DEFAULT_PAYROLL, ...settings };
  const count = (st) => attendance.filter((a) => a.status === st).length;
  const half = count('HALF_DAY');
  const presentDays = count('PRESENT') + count('LEAVE') + count('HOLIDAY') + half * 0.5;
  const autoNopay = count('ABSENT') + half * 0.5;
  const autoOt = round2(attendance.reduce((t, a) => t + Number(a.ot_hours || 0), 0));
  const o = (k, auto) => (overrides[k] !== undefined && overrides[k] !== null ? Number(overrides[k]) : auto);

  const basic = Number(emp.basic_salary);
  const epfAllow = Number(emp.epf_allowance);
  const otherAllow = Number(emp.other_allowance);
  const nopayDays = o('nopay_days', autoNopay);
  const otHours = o('ot_hours', autoOt);
  const nopay = round2((basic / s.nopay_day_divisor) * nopayDays);
  const ot = round2((basic / s.ot_hour_divisor) * s.ot_multiplier * otHours);
  const otherAdd = o('other_addition', 0);
  const gross = round2(basic + epfAllow + otherAllow + ot + otherAdd - nopay);
  const epfBase = emp.epf_eligible ? Math.max(0, round2(basic + epfAllow - nopay)) : 0;
  const epfEmp = round2((epfBase * s.epf_employee_rate) / 100);
  const epfEr = round2((epfBase * s.epf_employer_rate) / 100);
  const etf = round2((epfBase * s.etf_rate) / 100);
  const advance = Math.min(o('advance_deduction', round2(advancesOutstanding)), round2(advancesOutstanding));
  const apit = o('apit', 0);
  const otherDed = o('other_deduction', 0);
  const net = round2(gross - epfEmp - advance - apit - otherDed);
  return {
    basic, epf_allowance: epfAllow, other_allowance: otherAllow,
    present_days: presentDays, nopay_days: nopayDays, nopay_amount: nopay,
    ot_hours: otHours, ot_amount: ot, other_addition: otherAdd, gross_pay: gross,
    epf_base: epfBase, epf_employee: epfEmp, epf_employer: epfEr, etf_employer: etf,
    advance_deduction: advance, apit, other_deduction: otherDed, net_pay: net,
  };
}

export function calcMidMonth(emp, settings, overrides = {}) {
  const s = { ...DEFAULT_PAYROLL, ...settings };
  const auto = Math.round((Number(emp.basic_salary) * s.mid_month_percent) / 100);
  const amount = overrides.net_pay !== undefined && overrides.net_pay !== null ? Number(overrides.net_pay) : auto;
  return {
    basic: Number(emp.basic_salary), epf_allowance: 0, other_allowance: 0, present_days: 0, nopay_days: 0, nopay_amount: 0,
    ot_hours: 0, ot_amount: 0, other_addition: 0, gross_pay: amount, epf_base: 0, epf_employee: 0, epf_employer: 0, etf_employer: 0,
    advance_deduction: 0, apit: 0, other_deduction: 0, net_pay: round2(amount),
  };
}

export const LINE_FIELDS = [
  'basic', 'epf_allowance', 'other_allowance', 'present_days', 'nopay_days', 'nopay_amount', 'ot_hours', 'ot_amount', 'other_addition',
  'gross_pay', 'epf_base', 'epf_employee', 'epf_employer', 'etf_employer', 'advance_deduction', 'apit', 'other_deduction', 'net_pay',
];
