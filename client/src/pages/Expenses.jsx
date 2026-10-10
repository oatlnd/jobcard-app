// Internal (shop running costs) and external (outside work) expenses with receipt photos
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, put, del, upload, downloadCsv } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, Empty, Modal, useAction, useLoad, useDebounced } from '../components/ui.jsx';
import Attachments from '../components/Attachments.jsx';
import { fmtDate, money, todayIso, compressImage, PAYMENT_METHODS } from '../lib.js';
import { ask } from '../components/confirm.jsx';
import { useSort } from '../components/sort.jsx';

const monthStart = () => todayIso().slice(0, 8) + '01';
const TYPE_LABEL = { INTERNAL: 'Internal', EXTERNAL: 'External' };

const EXP_SORT = { date: 'expense_date', type: 'expense_type', cat: 'category', desc: 'description', paid: (e) => e.paid_to || e.supplier_name, method: 'payment_method', amount: (e) => Number(e.amount) };

export default function Expenses() {
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const list = useLoad(() => get('/expenses', { from, to, type, category, q: dq }), [from, to, type, category, dq]);
  const cats = useLoad(() => get('/masters/lookups', { type: 'expense_category' }), []);
  const { sorted: expRows, Th } = useSort(list.data?.expenses, 'expenses', EXP_SORT);
  const [edit, setEdit] = useState(null);
  const d = list.data;

  const exportCsv = () => downloadCsv(`expenses_${from}_${to}.csv`, d.expenses, [
    ['No', 'expense_no'], ['Date', 'expense_date'], ['Type', (e) => TYPE_LABEL[e.expense_type]], ['Category', 'category'],
    ['Description', 'description'], ['Paid to', 'paid_to'], ['Reference', 'reference_no'], ['Method', 'payment_method'],
    ['Job', 'job_no'], ['Amount', 'amount'],
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Expenses</h1><p className="muted">Internal = shop running costs. External = outside work and services (can be linked to a job card).</p></div>
        <div className="row wrap">
          {d?.expenses.length > 0 && <button className="btn ghost" onClick={exportCsv}>Export to Excel</button>}
          {can('expenses.manage') && <button className="btn primary" onClick={() => setEdit({})}>+ Add expense</button>}
        </div>
      </div>
      <div className="toolbar">
        <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">Internal & external</option><option value="INTERNAL">Internal</option><option value="EXTERNAL">External</option></select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {(cats.data || []).map((c) => <option key={c.id}>{c.name}</option>)}
        </select>
        <input className="search" placeholder="Search description, paid to…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {d && (
        <div className="stats">
          <div className="stat"><span>Total for period</span><strong>{money(d.total)}</strong></div>
          {Object.entries(d.by_category).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => (
            <div key={k} className="stat"><span>{k}</span><strong>{money(v)}</strong></div>
          ))}
        </div>
      )}
      <ErrorBox error={list.error} />
      {list.loading && !d ? <Loading /> : d?.expenses.length === 0 ? <Empty>No expenses in this period.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><Th k="date">Date</Th><Th k="type">Type</Th><Th k="cat">Category</Th><Th k="desc">Description</Th><Th k="paid">Paid to</Th><Th k="method">Method</Th><Th k="amount" className="num">Amount</Th><th /></tr></thead>
            <tbody>
              {expRows.map((e) => (
                <tr key={e.id}>
                  <td className="small nowrap">{fmtDate(e.expense_date)}<div className="muted">{e.expense_no}</div></td>
                  <td><span className={`badge x-${e.expense_type}`}>{TYPE_LABEL[e.expense_type]}</span></td>
                  <td>{e.category}</td>
                  <td>{e.description}{e.job_no && <div className="small"><Link to={`/jobs/${e.job_card_id}`}>{e.job_no}</Link></div>}{e.reference_no && <div className="small muted">Ref {e.reference_no}</div>}</td>
                  <td>{e.paid_to || e.supplier_name || '—'}</td>
                  <td className="small">{e.payment_method}</td>
                  <td className="num"><b>{money(e.amount)}</b></td>
                  <td className="num nowrap">
                    {e.attachment_count > 0 && <span className="chip" title="Photos attached">📎 {e.attachment_count}</span>}
                    <button className="btn small ghost" onClick={() => setEdit(e)}>{can('expenses.manage') ? 'Edit' : 'View'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <ExpenseForm e={edit} cats={(cats.data || []).map((c) => c.name)} canEdit={can('expenses.manage')} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload({ quiet: true }); }} />}
    </div>
  );
}

function ExpenseForm({ e, cats, canEdit, onClose, onSaved }) {
  const isNew = !e.id;
  const [f, setF] = useState({
    expense_date: e.expense_date || todayIso(), expense_type: e.expense_type || 'INTERNAL', category: e.category || cats[0] || '',
    description: e.description || '', amount: e.amount ?? '', payment_method: e.payment_method || 'Cash',
    paid_to: e.paid_to || '', reference_no: e.reference_no || '', job_no: e.job_no || '',
  });
  const [pending, setPending] = useState([]);
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const { busy, error, run } = useAction();
  const x = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const addPending = async (fl) => {
    const files = await Promise.all(Array.from(fl || []).map((file) => compressImage(file)));
    setPending((p) => [...p, ...files]);
  };
  const save = () => run(async () => {
    const body = { ...f, amount: Number(f.amount) };
    const saved = isNew ? await post('/expenses', body) : await put(`/expenses/${e.id}`, body);
    if (pending.length) await upload(`/attachments/expense/${saved.id}`, pending);
    onSaved();
  });
  return (
    <Modal title={isNew ? 'Add expense' : `Expense ${e.expense_no}`} onClose={onClose}
      footer={<>
        {!isNew && canEdit && <button className="btn ghost danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={async () => (await ask({ title: 'Delete this expense?', message: `${e.expense_no || ''} ${e.description || ''}`, yes: 'Yes, delete' })) && run(async () => { await del(`/expenses/${e.id}`); onSaved(); })}>Delete</button>}
        <button className="btn ghost" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</button>
        {canEdit && <button className="btn primary" disabled={busy || !f.description.trim() || !(Number(f.amount) > 0)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
      </>}>
      <ErrorBox error={error} />
      <fieldset disabled={!canEdit} className="plain-fieldset">
        <div className="seg">
          {['INTERNAL', 'EXTERNAL'].map((t) => (
            <button type="button" key={t} className={f.expense_type === t ? 'on' : ''} onClick={() => setF({ ...f, expense_type: t })}>
              {t === 'INTERNAL' ? 'Internal (shop costs)' : 'External (outside work)'}
            </button>
          ))}
        </div>
        <div className="grid2">
          <Field label="Date"><input type="date" value={f.expense_date} onChange={x('expense_date')} /></Field>
          <Field label="Category"><select value={f.category} onChange={x('category')}>{[...new Set([f.category, ...cats])].filter(Boolean).map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Description" wide><input autoFocus value={f.description} onChange={x('description')} placeholder={f.expense_type === 'INTERNAL' ? 'e.g. Electricity bill – September' : 'e.g. Brake drum skimming'} /></Field>
          <Field label="Amount (LKR)"><input type="number" min="0" step="any" value={f.amount} onChange={x('amount')} inputMode="decimal" /></Field>
          <Field label="Payment method"><select value={f.payment_method} onChange={x('payment_method')}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Paid to"><input value={f.paid_to} onChange={x('paid_to')} /></Field>
          <Field label="Bill / receipt no."><input value={f.reference_no} onChange={x('reference_no')} /></Field>
          {f.expense_type === 'EXTERNAL' && <Field label="Job card no. (optional)" hint="Link outside work to a job"><input value={f.job_no} onChange={x('job_no')} placeholder="JC26-00012" /></Field>}
        </div>
      </fieldset>
      <h4 className="sub-head">Receipt photos</h4>
      {!isNew && <Attachments entityType="expense" entityId={e.id} canEdit={canEdit} />}
      {isNew && canEdit && (
        <div className="attachments">
          <div className="thumbs">
            {pending.map((p, i) => (
              <div key={i} className="thumb">
                {p.type.startsWith('image/') ? <img src={URL.createObjectURL(p)} alt={p.name} /> : <span className="thumb-file">PDF</span>}
                <button className="thumb-del" onClick={async () => (await ask('Remove this photo?')) && setPending(pending.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
          <div className="row wrap">
            <button type="button" className="btn small" onClick={() => camRef.current?.click()}>📷 Take photo</button>
            <button type="button" className="btn small ghost" onClick={() => fileRef.current?.click()}>Attach file</button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(ev) => { addPending(ev.target.files); ev.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(ev) => { addPending(ev.target.files); ev.target.value = ''; }} />
        </div>
      )}
    </Modal>
  );
}
