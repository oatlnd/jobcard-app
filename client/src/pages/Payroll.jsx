// Payroll runs list + run detail (salary sheet, EPF/ETF, bank transfer list)
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post, patch, downloadCsv } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, Empty, Modal, Tabs, useAction, useLoad } from '../components/ui.jsx';
import { fmtDate, fmtDateTime, fmtPeriod, money, num, thisPeriod } from '../lib.js';
import { ask } from '../components/confirm.jsx';
import { useSort } from '../components/sort.jsx';

const TYPE = { MID_MONTH: 'Mid-month advance', MONTH_END: 'Month-end salary' };

const RUN_SORT = { run: 'run_no', period: 'period', type: 'run_type', staff: (r) => Number(r.employees), net: (r) => Number(r.total_net), epf: (r) => Number(r.total_epf), etf: (r) => Number(r.total_etf), status: 'status' };

export default function Payroll() {
  const { can } = useAuth();
  const runs = useLoad(() => get('/payroll/runs'), []);
  const { sorted: runRows, Th } = useSort(runs.data, 'payroll', RUN_SORT);
  const [creating, setCreating] = useState(false);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Payroll</h1><p className="muted">Run the mid-month advance (around the 15th) and the month-end salary. EPF 8% / 12% and ETF 3% are worked out automatically.</p></div>
        {can('payroll.run') && <button className="btn primary" onClick={() => setCreating(true)}>+ New payroll run</button>}
      </div>
      <ErrorBox error={runs.error} />
      {runs.loading && !runs.data ? <Loading /> : runs.data?.length === 0 ? <Empty>No payroll runs yet. Mark attendance first, then create a run.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><Th k="run">Run</Th><Th k="period">Period</Th><Th k="type">Type</Th><Th k="staff" className="num">Staff</Th><Th k="net" className="num">Net pay</Th><Th k="epf" className="num">EPF (20%)</Th><Th k="etf" className="num">ETF (3%)</Th><Th k="status">Status</Th></tr></thead>
            <tbody>
              {runRows.map((r) => (
                <tr key={r.id} className={r.status === 'CANCELLED' ? 'dim' : ''}>
                  <td><Link to={`/payroll/${r.id}`}><strong>{r.run_no}</strong></Link></td>
                  <td>{fmtPeriod(r.period)}</td>
                  <td>{TYPE[r.run_type]}</td>
                  <td className="num">{r.employees}</td>
                  <td className="num">{money(r.total_net)}</td>
                  <td className="num">{r.run_type === 'MONTH_END' ? money(r.total_epf) : '—'}</td>
                  <td className="num">{r.run_type === 'MONTH_END' ? money(r.total_etf) : '—'}</td>
                  <td><span className={`badge pr-${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewRun onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewRun({ onClose }) {
  const nav = useNavigate();
  const day = new Date().getDate();
  const [f, setF] = useState({ period: thisPeriod(), run_type: day <= 20 ? 'MID_MONTH' : 'MONTH_END', pay_date: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title="New payroll run" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(async () => { const r = await post('/payroll/runs', f); nav(`/payroll/${r.id}`); })}>Calculate</button></>}>
      <ErrorBox error={error} />
      <div className="seg">
        {Object.entries(TYPE).map(([k, v]) => <button key={k} type="button" className={f.run_type === k ? 'on' : ''} onClick={() => setF({ ...f, run_type: k })}>{v}</button>)}
      </div>
      <div className="grid2">
        <Field label="Month"><input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
        <Field label="Pay date (optional)"><input type="date" value={f.pay_date} onChange={(e) => setF({ ...f, pay_date: e.target.value })} /></Field>
      </div>
      <p className="small muted">
        {f.run_type === 'MID_MONTH'
          ? 'Pays each employee a set % of basic salary (Settings → Payroll). It is deducted in this month’s month-end run.'
          : 'Uses attendance (no-pay days, OT hours), deducts EPF 8% and outstanding advances, and works out employer EPF 12% and ETF 3%. You can adjust lines before finalising.'}
      </p>
    </Modal>
  );
}

export function PayrollRun() {
  const { id } = useParams();
  const { can } = useAuth();
  const run = useLoad(() => get(`/payroll/runs/${id}`), [id]);
  const act = useAction();
  const [tab, setTab] = useState('sheet');
  const [editLine, setEditLine] = useState(null);
  if (run.loading && !run.data) return <Loading />;
  if (run.error && !run.data) return <div className="page"><ErrorBox error={run.error} /></div>;
  const r = run.data;
  const draft = r.status === 'DRAFT' && can('payroll.run');
  const mid = r.run_type === 'MID_MONTH';
  const t = r.totals;

  const exportSheet = () => downloadCsv(`${r.run_no}_salary_sheet.csv`, r.lines, mid
    ? [['Emp no', 'emp_no'], ['Name', 'name'], ['Basic', 'basic'], ['Advance', 'net_pay']]
    : [['Emp no', 'emp_no'], ['Name', 'name'], ['Basic', 'basic'], ['EPF allowances', 'epf_allowance'], ['Other allowances', 'other_allowance'],
      ['No-pay days', 'nopay_days'], ['No-pay', 'nopay_amount'], ['OT hours', 'ot_hours'], ['OT', 'ot_amount'], ['Other additions', 'other_addition'],
      ['Gross', 'gross_pay'], ['EPF 8%', 'epf_employee'], ['Advances', 'advance_deduction'], ['APIT', 'apit'], ['Other deductions', 'other_deduction'],
      ['Net pay', 'net_pay'], ['EPF 12% (employer)', 'epf_employer'], ['ETF 3%', 'etf_employer']]);
  const exportEpf = () => downloadCsv(`${r.run_no}_EPF_ETF.csv`, r.lines.filter((l) => l.epf_base > 0), [
    ['EPF no', 'epf_no'], ['NIC', 'nic'], ['Name', 'name'], ['Total earnings', 'epf_base'], ['Employee 8%', 'epf_employee'],
    ['Employer 12%', 'epf_employer'], ['Total EPF 20%', (l) => (Number(l.epf_employee) + Number(l.epf_employer)).toFixed(2)], ['ETF 3%', 'etf_employer'],
  ]);
  const exportBank = () => downloadCsv(`${r.run_no}_bank_transfer.csv`, r.lines.filter((l) => l.net_pay > 0), [
    ['Emp no', 'emp_no'], ['Name', 'name'], ['Bank', 'bank_name'], ['Branch', 'bank_branch'], ['Account no', 'bank_account'], ['Amount', 'net_pay'],
  ]);

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/payroll">Payroll</Link> / {r.run_no}</div>
          <h1 className="row">{TYPE[r.run_type]} · {fmtPeriod(r.period)} <span className={`badge pr-${r.status}`}>{r.status}</span></h1>
          <p className="muted">{r.run_no} · {r.lines.length} employees · created by {r.created_by_name}{r.finalized_at && ` · finalised ${fmtDateTime(r.finalized_at)} by ${r.finalized_by_name}`}</p>
        </div>
        <div className="row wrap">
          {!mid && <a className="btn ghost" href={`/print/payslips/${r.id}`} target="_blank" rel="noreferrer">🖨 Payslips</a>}
          <button className="btn ghost" onClick={exportSheet}>Export sheet</button>
          {draft && <button className="btn ghost" disabled={act.busy} onClick={() => act.run(async () => run.setData(await post(`/payroll/runs/${id}/recalculate`)))}>Recalculate</button>}
          {draft && <button className="btn ghost danger" disabled={act.busy} onClick={async () => (await ask({ title: 'Cancel this payroll run?', yes: 'Yes, cancel run', no: 'No' })) && act.run(async () => run.setData(await post(`/payroll/runs/${id}/cancel`)))}>Cancel run</button>}
          {draft && <button className="btn primary" disabled={act.busy} onClick={async () => (await ask({ title: 'Finalise this payroll run?', danger: false, yes: 'Yes, finalise', no: 'Not yet', message: mid
            ? 'Each amount will be recorded as a salary advance and deducted at month-end.'
            : 'Advances will be marked as deducted and attendance for this month will be locked.' })) && act.run(async () => run.setData(await post(`/payroll/runs/${id}/finalize`)))}>Finalise</button>}
        </div>
      </div>
      <ErrorBox error={act.error} />
      {r.status === 'DRAFT' && <div className="alert info">Draft – figures update from attendance and advances when you press Recalculate. Click a row to adjust OT, no-pay days, bonus, APIT or deductions.</div>}

      <div className="stats">
        {mid ? <div className="stat"><span>Total advance to pay</span><strong>{money(t.net_pay)}</strong></div> : <>
          <div className="stat"><span>Gross pay</span><strong>{money(t.gross_pay)}</strong></div>
          <div className="stat"><span>Net pay to staff</span><strong>{money(t.net_pay)}</strong></div>
          <div className="stat"><span>EPF to pay (8% + 12%)</span><strong>{money(t.epf_employee + t.epf_employer)}</strong></div>
          <div className="stat"><span>ETF to pay (3%)</span><strong>{money(t.etf_employer)}</strong></div>
          <div className="stat"><span>Total cost to company</span><strong>{money(t.gross_pay + t.epf_employer + t.etf_employer)}</strong></div>
        </>}
      </div>

      {!mid && <Tabs tabs={[['sheet', 'Salary sheet'], ['epf', 'EPF / ETF'], ['bank', 'Bank transfer']]} value={tab} onChange={setTab} />}

      {(mid || tab === 'sheet') && (
        <div className="table-wrap">
          <table className="table compact payroll-table">
            <thead>
              {mid ? <tr><th>Employee</th><th className="num">Basic</th><th className="num">Advance</th><th>Note</th></tr> : (
                <tr>
                  <th>Employee</th><th className="num">Basic</th><th className="num">Allow.</th><th className="num">No-pay</th><th className="num">OT</th>
                  <th className="num">Other +</th><th className="num">Gross</th><th className="num">EPF 8%</th><th className="num">Advances</th><th className="num">APIT</th>
                  <th className="num">Other −</th><th className="num">Net pay</th><th className="num">EPF 12%</th><th className="num">ETF 3%</th>
                </tr>
              )}
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id} className={draft ? 'clickable' : ''} onClick={() => draft && setEditLine(l)}>
                  <td className="nowrap"><strong>{l.name}</strong><div className="small muted">{l.emp_no} · {l.designation}{Object.keys(l.overrides || {}).length > 0 && ' · edited'}</div></td>
                  <td className="num">{num(l.basic)}</td>
                  {mid ? <><td className="num"><b>{num(l.net_pay)}</b></td><td className="small">{l.note}</td></> : <>
                    <td className="num">{num(Number(l.epf_allowance) + Number(l.other_allowance))}</td>
                    <td className="num">{l.nopay_amount > 0 ? <span title={`${l.nopay_days} day(s)`}>−{num(l.nopay_amount)}<div className="small muted">{l.nopay_days}d</div></span> : '—'}</td>
                    <td className="num">{l.ot_amount > 0 ? <>{num(l.ot_amount)}<div className="small muted">{l.ot_hours}h</div></> : '—'}</td>
                    <td className="num">{l.other_addition > 0 ? num(l.other_addition) : '—'}</td>
                    <td className="num">{num(l.gross_pay)}</td>
                    <td className="num">{num(l.epf_employee)}</td>
                    <td className="num">{l.advance_deduction > 0 ? num(l.advance_deduction) : '—'}</td>
                    <td className="num">{l.apit > 0 ? num(l.apit) : '—'}</td>
                    <td className="num">{l.other_deduction > 0 ? num(l.other_deduction) : '—'}</td>
                    <td className="num"><b>{num(l.net_pay)}</b></td>
                    <td className="num muted">{num(l.epf_employer)}</td>
                    <td className="num muted">{num(l.etf_employer)}</td>
                  </>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              {mid ? <tr><td>Total</td><td className="num">{num(t.basic)}</td><td className="num"><b>{num(t.net_pay)}</b></td><td /></tr> : (
                <tr>
                  <td>Total</td><td className="num">{num(t.basic)}</td><td /><td className="num">−{num(t.nopay_amount)}</td><td className="num">{num(t.ot_amount)}</td><td />
                  <td className="num">{num(t.gross_pay)}</td><td className="num">{num(t.epf_employee)}</td><td className="num">{num(t.advance_deduction)}</td>
                  <td className="num">{num(t.apit)}</td><td className="num">{num(t.other_deduction)}</td><td className="num"><b>{num(t.net_pay)}</b></td>
                  <td className="num">{num(t.epf_employer)}</td><td className="num">{num(t.etf_employer)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {!mid && tab === 'epf' && (
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">EPF / ETF contributions – {fmtPeriod(r.period)}</h2>
            <button className="btn small ghost" onClick={exportEpf}>Export to Excel</button>
          </div>
          <p className="small muted">Use these figures for the EPF C-Form (Central Bank) and the ETF return. Pay EPF by the last working day of the following month.</p>
          <table className="table compact">
            <thead><tr><th>EPF no.</th><th>NIC</th><th>Name</th><th className="num">Total earnings</th><th className="num">Employee 8%</th><th className="num">Employer 12%</th><th className="num">Total 20%</th><th className="num">ETF 3%</th></tr></thead>
            <tbody>
              {r.lines.filter((l) => l.epf_base > 0).map((l) => (
                <tr key={l.id}>
                  <td>{l.epf_no || <em className="late-text">missing</em>}</td><td>{l.nic || '—'}</td><td>{l.name}</td>
                  <td className="num">{num(l.epf_base)}</td><td className="num">{num(l.epf_employee)}</td><td className="num">{num(l.epf_employer)}</td>
                  <td className="num"><b>{num(Number(l.epf_employee) + Number(l.epf_employer))}</b></td><td className="num">{num(l.etf_employer)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan="3">Total</td><td className="num">{num(r.lines.reduce((s, l) => s + Number(l.epf_base), 0))}</td><td className="num">{num(t.epf_employee)}</td><td className="num">{num(t.epf_employer)}</td><td className="num"><b>{num(t.epf_employee + t.epf_employer)}</b></td><td className="num"><b>{num(t.etf_employer)}</b></td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {!mid && tab === 'bank' && (
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Bank transfer list</h2>
            <button className="btn small ghost" onClick={exportBank}>Export to Excel</button>
          </div>
          <table className="table compact">
            <thead><tr><th>Employee</th><th>Bank</th><th>Branch</th><th>Account no.</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {r.lines.filter((l) => l.net_pay > 0).map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td><td>{l.bank_name || <em className="muted">—</em>}</td><td>{l.bank_branch || '—'}</td>
                  <td className="mono">{l.bank_account || <em className="late-text">missing</em>}</td><td className="num"><b>{num(l.net_pay)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="4">Total</td><td className="num"><b>{num(t.net_pay)}</b></td></tr></tfoot>
          </table>
        </div>
      )}

      {editLine && <LineForm run={r} line={editLine} onClose={() => setEditLine(null)} onSaved={(d) => { run.setData(d); setEditLine(null); }} />}
    </div>
  );
}

function LineForm({ run, line, onClose, onSaved }) {
  const mid = run.run_type === 'MID_MONTH';
  const o = line.overrides || {};
  const fields = mid
    ? [['net_pay', 'Advance amount (LKR)']]
    : [['ot_hours', 'OT hours'], ['nopay_days', 'No-pay days'], ['other_addition', 'Bonus / other additions'], ['apit', 'APIT (PAYE tax)'], ['other_deduction', 'Other deductions'], ['advance_deduction', 'Advance to deduct']];
  const [f, setF] = useState(Object.fromEntries(fields.map(([k]) => [k, line[k]])));
  const [note, setNote] = useState(line.note || '');
  const { busy, error, run: go } = useAction();
  const save = (resetAll) => go(async () => {
    const body = { note };
    for (const [k] of fields) body[k] = resetAll ? null : Number(f[k]) || 0;
    onSaved(await patch(`/payroll/runs/${run.id}/lines/${line.id}`, body));
  });
  return (
    <Modal title={`${line.name} – adjust`} onClose={onClose}
      footer={<>
        {Object.keys(o).length > 0 && <button className="btn ghost" style={{ marginRight: 'auto' }} disabled={busy} onClick={() => save(true)}>Reset to calculated</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => save(false)}>Save & recalculate</button></>}>
      <ErrorBox error={error} />
      {!mid && <p className="small muted">From attendance: {line.present_days} paid days. Outstanding advances are capped at what the employee owes.</p>}
      <div className="grid2">
        {fields.map(([k, label]) => (
          <Field key={k} label={label} hint={o[k] !== undefined ? 'Edited by hand' : 'Calculated'}>
            <input type="number" min="0" step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ---------- Payslip print (A4, two per page) ----------
export function PayslipPrint() {
  const { id } = useParams();
  const only = new URLSearchParams(window.location.search).get('employee');
  const data = useLoad(() => Promise.all([get(`/payroll/runs/${id}`), get('/settings')]), [id]);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} />;
  const [r, settings] = data.data;
  const shop = settings.shop || {};
  const lines = r.lines.filter((l) => !only || String(l.employee_id) === only);
  return (
    <div className="print-page fmt-a4">
      <style>{'@page { size: A4; margin: 10mm; }'}</style>
      <div className="no-print print-bar"><button className="btn primary" onClick={() => window.print()}>Print</button><span className="muted small">{lines.length} payslip(s)</span></div>
      <div className="payslips">
        {lines.map((l) => (
          <div key={l.id} className="payslip">
            <div className="ps-head">
              <div><strong>{shop.name}</strong><br /><small>{shop.address}</small></div>
              <div className="right"><strong>PAYSLIP</strong><br /><small>{fmtPeriod(r.period)}{r.pay_date && ` · Paid ${fmtDate(r.pay_date)}`}</small></div>
            </div>
            <div className="ps-emp">
              <span><b>{l.name}</b> ({l.emp_no})</span><span>{l.designation}</span>
              <span>EPF no: {l.epf_no || '—'}</span><span>Paid days: {l.present_days}</span>
            </div>
            <div className="ps-cols">
              <table>
                <thead><tr><th colSpan="2">Earnings</th></tr></thead>
                <tbody>
                  <tr><td>Basic salary</td><td>{num(l.basic)}</td></tr>
                  {l.epf_allowance > 0 && <tr><td>Allowances (EPF)</td><td>{num(l.epf_allowance)}</td></tr>}
                  {l.other_allowance > 0 && <tr><td>Other allowances</td><td>{num(l.other_allowance)}</td></tr>}
                  {l.ot_amount > 0 && <tr><td>Overtime ({l.ot_hours} h)</td><td>{num(l.ot_amount)}</td></tr>}
                  {l.other_addition > 0 && <tr><td>Bonus / other</td><td>{num(l.other_addition)}</td></tr>}
                  {l.nopay_amount > 0 && <tr><td>No-pay ({l.nopay_days} days)</td><td>−{num(l.nopay_amount)}</td></tr>}
                  <tr className="ps-total"><td>Gross pay</td><td>{num(l.gross_pay)}</td></tr>
                </tbody>
              </table>
              <table>
                <thead><tr><th colSpan="2">Deductions</th></tr></thead>
                <tbody>
                  <tr><td>EPF employee (8%)</td><td>{num(l.epf_employee)}</td></tr>
                  {l.advance_deduction > 0 && <tr><td>Salary advances</td><td>{num(l.advance_deduction)}</td></tr>}
                  {l.apit > 0 && <tr><td>APIT</td><td>{num(l.apit)}</td></tr>}
                  {l.other_deduction > 0 && <tr><td>Other deductions</td><td>{num(l.other_deduction)}</td></tr>}
                  <tr className="ps-total"><td>Total deductions</td><td>{num(Number(l.epf_employee) + Number(l.advance_deduction) + Number(l.apit) + Number(l.other_deduction))}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="ps-net"><span>NET PAY</span><span>LKR {num(l.net_pay)}</span></div>
            <div className="ps-foot small">
              Employer contributions: EPF 12% {num(l.epf_employer)} · ETF 3% {num(l.etf_employer)}
              {l.bank_account && <> · Paid to {l.bank_name} {l.bank_account}</>}
            </div>
            <div className="ps-sign"><span>Employee signature</span><span>Authorised</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
