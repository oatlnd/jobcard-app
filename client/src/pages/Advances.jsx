import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, del } from '../api.js';
import { ErrorBox, Field, Loading, Empty, Modal, useAction, useLoad } from '../components/ui.jsx';
import { fmtDate, money, todayIso } from '../lib.js';

export default function Advances() {
  const [openOnly, setOpenOnly] = useState(true);
  const list = useLoad(() => get('/hr/advances', { open: openOnly ? '1' : undefined }), [openOnly]);
  const [adding, setAdding] = useState(false);
  const act = useAction();
  const total = (list.data || []).filter((a) => !a.recovered_run_id).reduce((s, a) => s + Number(a.amount), 0);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Salary advances</h1><p className="muted">Advances are deducted automatically in the next month-end payroll. Mid-month payroll creates advances too.</p></div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Give advance</button>
      </div>
      <div className="toolbar">
        <label className="toggle"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Outstanding only</label>
        <span className="muted small" style={{ marginLeft: 'auto' }}>Outstanding: <b>{money(total)}</b></span>
      </div>
      <ErrorBox error={list.error || act.error} />
      {list.loading && !list.data ? <Loading /> : list.data?.length === 0 ? <Empty>No advances.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Employee</th><th>Reason</th><th>Paid by</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.data?.map((a) => (
                <tr key={a.id}>
                  <td className="small">{fmtDate(a.advance_date)}</td>
                  <td><Link to={`/employees/${a.employee_id}`}>{a.employee_name}</Link><div className="small muted">{a.emp_no}</div></td>
                  <td className="small">{a.reason || '—'}{a.source_run_no && <div className="muted">From {a.source_run_no}</div>}</td>
                  <td className="small">{a.payment_method}</td>
                  <td className="num"><b>{money(a.amount)}</b></td>
                  <td className="small">{a.recovered_run_no ? `Deducted in ${a.recovered_run_no}` : 'Outstanding'}</td>
                  <td className="num">{!a.recovered_run_id && !a.source_run_id && (
                    <button className="btn small ghost danger" disabled={act.busy} onClick={() => confirm('Delete this advance?') && act.run(async () => { await del(`/hr/advances/${a.id}`); list.reload({ quiet: true }); })}>Delete</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AdvanceForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.reload({ quiet: true }); }} />}
    </div>
  );
}

function AdvanceForm({ onClose, onSaved }) {
  const emps = useLoad(() => get('/hr/employees'), []);
  const [f, setF] = useState({ employee_id: '', advance_date: todayIso(), amount: '', reason: '', payment_method: 'Cash' });
  const { busy, error, run } = useAction();
  const x = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const emp = (emps.data || []).find((e) => e.id === Number(f.employee_id));
  return (
    <Modal title="Give salary advance" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !f.employee_id || !(Number(f.amount) > 0)} onClick={() => run(async () => { await post('/hr/advances', { ...f, employee_id: Number(f.employee_id), amount: Number(f.amount) }); onSaved(); })}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Employee" wide>
          <select value={f.employee_id} onChange={x('employee_id')} autoFocus>
            <option value="">Select employee</option>
            {(emps.data || []).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.emp_no})</option>)}
          </select>
        </Field>
        {emp && <p className="small muted wide">Basic {money(emp.basic_salary)} · already outstanding {money(emp.advance_outstanding)}</p>}
        <Field label="Date"><input type="date" value={f.advance_date} onChange={x('advance_date')} /></Field>
        <Field label="Amount (LKR)"><input type="number" min="0" value={f.amount} onChange={x('amount')} /></Field>
        <Field label="Paid by"><select value={f.payment_method} onChange={x('payment_method')}><option>Cash</option><option>Bank Transfer</option><option>Cheque</option></select></Field>
        <Field label="Reason"><input value={f.reason} onChange={x('reason')} /></Field>
      </div>
    </Modal>
  );
}
