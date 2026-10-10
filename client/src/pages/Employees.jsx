import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, put } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, Empty, Modal, useAction, useLoad } from '../components/ui.jsx';
import { fmtDate, fmtMobile, fmtPeriod, money } from '../lib.js';
import { useSort } from '../components/sort.jsx';

const EMP_SORT = { no: 'emp_no', name: 'name', des: 'designation', mobile: 'mobile', basic: (r) => Number(r.basic_salary), allow: (r) => Number(r.epf_allowance) + Number(r.other_allowance), epf: 'epf_no', adv: (r) => Number(r.advance_outstanding || 0) };

export default function Employees() {
  const { can } = useAuth();
  const [all, setAll] = useState(false);
  const list = useLoad(() => get('/hr/employees', { all: all ? '1' : undefined }), [all]);
  const { sorted: empRows, Th } = useSort(list.data, 'employees', EMP_SORT);
  const [edit, setEdit] = useState(null);
  const total = (list.data || []).filter((e) => e.active).reduce((s, e) => s + Number(e.basic_salary) + Number(e.epf_allowance) + Number(e.other_allowance), 0);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Employees</h1><p className="muted">Salary details used for payroll. Link an employee to their staff login if they have one.</p></div>
        {can('employees.manage') && <button className="btn primary" onClick={() => setEdit({})}>+ Add employee</button>}
      </div>
      <div className="toolbar">
        <label className="toggle"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show former employees</label>
        {list.data && <span className="muted small" style={{ marginLeft: 'auto' }}>Monthly fixed pay (active): <b>{money(total)}</b></span>}
      </div>
      <ErrorBox error={list.error} />
      {list.loading && !list.data ? <Loading /> : list.data?.length === 0 ? <Empty>No employees yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><Th k="no">No.</Th><Th k="name">Name</Th><Th k="des">Designation</Th><Th k="mobile">Mobile</Th><Th k="basic" className="num">Basic</Th><Th k="allow" className="num">Allowances</Th><Th k="epf">EPF no.</Th><Th k="adv" className="num">Advance due</Th><th /></tr></thead>
            <tbody>
              {empRows.map((e) => (
                <tr key={e.id} className={e.active ? '' : 'dim'}>
                  <td className="mono">{e.emp_no}</td>
                  <td><Link to={`/employees/${e.id}`}><strong>{e.name}</strong></Link>{e.username && <div className="small muted">login: {e.username}</div>}</td>
                  <td>{e.designation || '—'}</td>
                  <td>{fmtMobile(e.mobile) || '—'}</td>
                  <td className="num">{money(e.basic_salary)}</td>
                  <td className="num">{money(Number(e.epf_allowance) + Number(e.other_allowance))}</td>
                  <td>{e.epf_eligible ? (e.epf_no || <em className="muted">missing</em>) : <span className="muted">Not EPF</span>}</td>
                  <td className="num">{e.advance_outstanding > 0 ? <b>{money(e.advance_outstanding)}</b> : '—'}</td>
                  <td className="num">{can('employees.manage') && <button className="btn small ghost" onClick={() => setEdit(e)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <EmployeeForm e={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload({ quiet: true }); }} />}
    </div>
  );
}

export function EmployeeForm({ e, onClose, onSaved }) {
  const isNew = !e.id;
  const users = useLoad(() => get('/users'), []);
  const desig = useLoad(() => get('/masters/lookups', { type: 'designation' }), []);
  const [f, setF] = useState({
    emp_no: e.emp_no || '', name: e.name || '', nic: e.nic || '', designation: e.designation || '', mobile: e.mobile ? fmtMobile(e.mobile) : '',
    address: e.address || '', date_of_birth: e.date_of_birth || '', join_date: e.join_date || '', basic_salary: e.basic_salary ?? '',
    epf_allowance: e.epf_allowance ?? 0, other_allowance: e.other_allowance ?? 0, epf_eligible: e.epf_eligible ?? true, epf_no: e.epf_no || '',
    bank_name: e.bank_name || '', bank_branch: e.bank_branch || '', bank_account: e.bank_account || '', user_id: e.user_id || '',
    active: e.active ?? true, resigned_date: e.resigned_date || '', notes: e.notes || '',
  });
  const { busy, error, run } = useAction();
  const x = (k) => (ev) => setF({ ...f, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value });
  const save = () => run(async () => {
    const body = { ...f, basic_salary: Number(f.basic_salary) || 0, epf_allowance: Number(f.epf_allowance) || 0, other_allowance: Number(f.other_allowance) || 0, user_id: f.user_id ? Number(f.user_id) : null };
    if (isNew) await post('/hr/employees', body); else await put(`/hr/employees/${e.id}`, body);
    onSaved();
  });
  return (
    <Modal title={isNew ? 'Add employee' : `Edit ${e.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.name.trim()} onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <h4 className="sub-head">Personal</h4>
      <div className="grid2">
        <Field label="Full name"><input autoFocus value={f.name} onChange={x('name')} /></Field>
        <Field label="Employee no." hint={isNew ? 'Leave blank to number automatically' : undefined}><input value={f.emp_no} onChange={x('emp_no')} /></Field>
        <Field label="NIC no."><input value={f.nic} onChange={x('nic')} /></Field>
        <Field label="Designation">
          <select value={f.designation} onChange={x('designation')}>
            <option value="">—</option>
            {[...new Set([f.designation, ...(desig.data || []).map((d) => d.name)])].filter(Boolean).map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Mobile"><input value={f.mobile} onChange={x('mobile')} /></Field>
        <Field label="Date of birth"><input type="date" value={f.date_of_birth} onChange={x('date_of_birth')} /></Field>
        <Field label="Address" wide><input value={f.address} onChange={x('address')} /></Field>
        <Field label="Join date"><input type="date" value={f.join_date} onChange={x('join_date')} /></Field>
        <Field label="Staff login (optional)">
          <select value={f.user_id} onChange={x('user_id')}>
            <option value="">None</option>
            {(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
          </select>
        </Field>
      </div>
      <h4 className="sub-head">Salary (monthly)</h4>
      <div className="grid2">
        <Field label="Basic salary (LKR)"><input type="number" min="0" value={f.basic_salary} onChange={x('basic_salary')} /></Field>
        <Field label="Allowances liable for EPF/ETF" hint="e.g. budgetary relief allowance"><input type="number" min="0" value={f.epf_allowance} onChange={x('epf_allowance')} /></Field>
        <Field label="Other allowances (no EPF)" hint="e.g. travel, meals"><input type="number" min="0" value={f.other_allowance} onChange={x('other_allowance')} /></Field>
        <label className="toggle"><input type="checkbox" checked={f.epf_eligible} onChange={x('epf_eligible')} /> Member of EPF / ETF</label>
        {f.epf_eligible && <Field label="EPF member no."><input value={f.epf_no} onChange={x('epf_no')} /></Field>}
      </div>
      <h4 className="sub-head">Bank (for salary transfer)</h4>
      <div className="grid2">
        <Field label="Bank"><input value={f.bank_name} onChange={x('bank_name')} /></Field>
        <Field label="Branch"><input value={f.bank_branch} onChange={x('bank_branch')} /></Field>
        <Field label="Account no."><input value={f.bank_account} onChange={x('bank_account')} /></Field>
      </div>
      {!isNew && (
        <div className="grid2" style={{ marginTop: 12 }}>
          <label className="toggle"><input type="checkbox" checked={f.active} onChange={x('active')} /> Currently employed</label>
          {!f.active && <Field label="Left on"><input type="date" value={f.resigned_date} onChange={x('resigned_date')} /></Field>}
        </div>
      )}
    </Modal>
  );
}

export function EmployeeDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const emp = useLoad(() => get(`/hr/employees/${id}`), [id]);
  const [edit, setEdit] = useState(false);
  if (emp.loading && !emp.data) return <Loading />;
  if (emp.error && !emp.data) return <div className="page"><ErrorBox error={emp.error} /></div>;
  const e = emp.data;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/employees">Employees</Link> / {e.emp_no}</div>
          <h1>{e.name}</h1>
          <p className="muted">{e.designation || 'No designation'} · {e.emp_no}{e.join_date && ` · Joined ${fmtDate(e.join_date)}`}{!e.active && ' · Left'}</p>
        </div>
        {can('employees.manage') && <button className="btn ghost" onClick={() => setEdit(true)}>Edit</button>}
      </div>
      <div className="detail-grid">
        <div className="stack">
          <div className="card">
            <h2 className="card-title">Salary</h2>
            <div className="kv">
              <span>Basic</span><strong>{money(e.basic_salary)}</strong>
              <span>EPF allowances</span><span>{money(e.epf_allowance)}</span>
              <span>Other allowances</span><span>{money(e.other_allowance)}</span>
              <span>EPF / ETF</span><span>{e.epf_eligible ? `Member ${e.epf_no || '(no. missing)'}` : 'Not a member'}</span>
              <span>Bank</span><span>{[e.bank_name, e.bank_branch, e.bank_account].filter(Boolean).join(' · ') || '—'}</span>
              <span>NIC</span><span>{e.nic || '—'}</span>
              <span>Mobile</span><span>{fmtMobile(e.mobile) || '—'}</span>
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">Payslips</h2>
            {e.payslips.length === 0 ? <p className="muted">No payroll yet.</p> : (
              <table className="table compact">
                <thead><tr><th>Period</th><th>Run</th><th className="num">Net pay</th><th /></tr></thead>
                <tbody>
                  {e.payslips.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtPeriod(p.period)}</td>
                      <td>{p.run_type === 'MID_MONTH' ? 'Mid-month advance' : 'Month-end'} <span className={`badge pr-${p.status}`}>{p.status}</span></td>
                      <td className="num">{money(p.net_pay)}</td>
                      <td className="num">{p.run_type === 'MONTH_END' && <a className="small" href={`/print/payslips/${p.run_id}?employee=${e.id}`} target="_blank" rel="noreferrer">Payslip</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">Salary advances</h2>
          {e.advances.length === 0 ? <p className="muted">No advances.</p> : (
            <table className="table compact">
              <thead><tr><th>Date</th><th>Reason</th><th className="num">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {e.advances.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{fmtDate(a.advance_date)}</td><td className="small">{a.reason || '—'}</td>
                    <td className="num">{money(a.amount)}</td>
                    <td className="small">{a.recovered_run_no ? `Deducted (${a.recovered_run_no})` : <b>Outstanding</b>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {edit && <EmployeeForm e={e} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); emp.reload({ quiet: true }); }} />}
    </div>
  );
}
