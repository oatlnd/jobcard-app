import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, patch, del } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../socket.js';
import { ErrorBox, Field, Loading, Modal, StatusBadge, useAction, useLoad, useDebounced } from '../components/ui.jsx';
import {
  TRANSITIONS, ROLE_CAN_SET, ACTION_LABEL, STATUS_LABEL, fmtReg, fmtMobile, fmtDateTime, fmtDate, money, isoToLocal, localToIso,
} from '../lib.js';

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const job = useLoad(() => get(`/jobs/${id}`), [id]);
  const act = useAction();
  const [statusModal, setStatusModal] = useState(null);

  useLive('job:changed', (e) => { if (String(e.id) === String(id)) job.reload({ quiet: true }); });

  if (job.loading && !job.data) return <Loading />;
  if (job.error && !job.data) return <div className="page"><ErrorBox error={job.error} /></div>;
  const j = job.data;
  const staff = user.role !== 'mechanic';
  const closed = ['DELIVERED', 'CANCELLED'].includes(j.status);
  const nextStatuses = (TRANSITIONS[j.status] || []).filter((s) => ROLE_CAN_SET[user.role].includes(s));

  const doAction = (fn) => act.run(async () => { const r = await fn(); if (r?.job_no && r?.items) job.setData(r); return r ?? true; });

  const changeStatus = (status, note) => doAction(() => post(`/jobs/${id}/status`, { status, note })).then((r) => r && setStatusModal(null));
  const askStatus = (s) => {
    const needsNote = s === 'CANCELLED' || s === 'WAITING_PARTS' || (s === 'IN_PROGRESS' && ['QA_CHECK', 'READY'].includes(j.status));
    needsNote ? setStatusModal(s) : changeStatus(s);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/">Board</Link> / {j.job_no}</div>
          <h1 className="row">{fmtReg(j.bike.reg_no)} <StatusBadge status={j.status} /></h1>
          <p className="muted">
            {j.bike.model}{j.bike.year ? ` · ${j.bike.year}` : ''} · {j.service_type} · Opened {fmtDateTime(j.created_at)}
          </p>
        </div>
        <div className="row wrap">
          {staff && <Link className="btn ghost" to={`/jobs/${id}/invoice?type=jobcard`} target="_blank">Print job card</Link>}
          {staff && j.invoice && <Link className="btn ghost" to={`/jobs/${id}/invoice`} target="_blank">Print invoice</Link>}
        </div>
      </div>

      <ErrorBox error={act.error} />

      {nextStatuses.length > 0 && (
        <div className="status-actions">
          {nextStatuses.map((s) => (
            <button key={s} disabled={act.busy}
              className={`btn ${s === 'CANCELLED' ? 'danger ghost' : s === 'IN_PROGRESS' && ['QA_CHECK', 'READY'].includes(j.status) ? 'ghost' : 'primary'}`}
              onClick={() => askStatus(s)}>
              {s === 'IN_PROGRESS' && j.status === 'QA_CHECK' ? 'QA failed – back to mechanic'
                : s === 'IN_PROGRESS' && j.status === 'READY' ? 'Reopen work'
                : s === 'IN_PROGRESS' && j.status === 'WAITING_PARTS' ? 'Parts arrived – resume'
                : ACTION_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      <div className="detail-grid">
        <div className="stack">
          <CustomerCard j={j} />
          <DetailsCard j={j} staff={staff} closed={closed} onSave={(body) => doAction(() => patch(`/jobs/${id}`, body))} busy={act.busy} />
          <ItemsCard j={j} closed={closed || !!j.invoice} staff={staff} doAction={doAction} busy={act.busy} />
          {staff && <InvoiceCard j={j} doAction={doAction} busy={act.busy} reload={() => job.reload({ quiet: true })} />}
        </div>
        <div className="stack">
          <Timeline j={j} />
          {staff && <MessagesCard j={j} doAction={doAction} reload={() => job.reload({ quiet: true })} />}
        </div>
      </div>

      {statusModal && (
        <StatusNoteModal status={statusModal} busy={act.busy} onClose={() => setStatusModal(null)} onConfirm={(note) => changeStatus(statusModal, note)} />
      )}
    </div>
  );
}

function StatusNoteModal({ status, busy, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  const label = { CANCELLED: 'Reason for cancelling', WAITING_PARTS: 'Which parts are we waiting for?', IN_PROGRESS: 'What needs fixing?' }[status];
  return (
    <Modal title={STATUS_LABEL[status]} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Back</button>
        <button className={`btn ${status === 'CANCELLED' ? 'danger' : 'primary'}`} disabled={busy} onClick={() => onConfirm(note)}>Confirm</button></>}>
      <Field label={label}><textarea rows="3" autoFocus value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {status === 'WAITING_PARTS' && <p className="small muted">The customer will be told we're waiting for parts.</p>}
      {status === 'CANCELLED' && <p className="small muted">Parts on this job card go back into stock.</p>}
    </Modal>
  );
}

function CustomerCard({ j }) {
  const c = j.customer;
  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Customer</h2>
        <Link className="small" to={`/customers/${c.id}`}>History →</Link>
      </div>
      <div className="kv">
        <span>Name</span><strong>{c.name}</strong>
        <span>Mobile</span>
        <span className="row">
          <a href={`tel:+${c.mobile}`}>{fmtMobile(c.mobile)}</a>
          <a className="chip" href={`https://wa.me/${c.mobile}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </span>
        {c.suburb && <><span>Suburb</span><span>{c.suburb}</span></>}
        <span>Messages in</span><span>{c.preferred_lang === 'ta' ? 'Tamil' : 'English'}</span>
        {j.bike.last_service_date && <><span>Last service</span><span>{fmtDate(j.bike.last_service_date)}</span></>}
      </div>
    </div>
  );
}

function DetailsCard({ j, staff, closed, onSave, busy }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const users = useLoad(() => (staff ? get('/users') : Promise.resolve([])), [staff]);
  const mechanics = (users.data || []).filter((u) => u.role === 'mechanic' && u.active);

  useEffect(() => {
    setF({
      complaint: j.complaint || '', diagnosis: j.diagnosis || '', odometer: j.odometer ?? '', fuel_level: j.fuel_level || '',
      mechanic_id: j.mechanic_id || '', promised_at: isoToLocal(j.promised_at), service_type: j.service_type,
    });
  }, [j]);

  const save = async () => {
    const body = staff
      ? { complaint: f.complaint, diagnosis: f.diagnosis, odometer: f.odometer === '' ? null : Number(f.odometer), fuel_level: f.fuel_level,
          mechanic_id: f.mechanic_id ? Number(f.mechanic_id) : null, promised_at: localToIso(f.promised_at) }
      : { diagnosis: f.diagnosis };
    const r = await onSave(body);
    if (r) setEdit(false);
  };
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Job details</h2>
        {!closed && !edit && <button className="btn small ghost" onClick={() => setEdit(true)}>{staff ? 'Edit' : 'Add diagnosis'}</button>}
      </div>
      {!edit ? (
        <div className="kv">
          <span>Complaint</span><span className="pre">{j.complaint || '—'}</span>
          <span>Diagnosis</span><span className="pre">{j.diagnosis || '—'}</span>
          <span>Mechanic</span><span>{j.mechanic_name || <em className="muted">Unassigned</em>}</span>
          <span>Odometer</span><span>{j.odometer != null ? `${j.odometer.toLocaleString()} km` : '—'}</span>
          <span>Fuel</span><span>{j.fuel_level || '—'}</span>
          <span>Promised</span><span>{fmtDateTime(j.promised_at)}</span>
          <span>Advisor</span><span>{j.advisor_name || '—'}</span>
        </div>
      ) : (
        <div className="grid2">
          {staff && <Field label="Complaint" wide><textarea rows="2" value={f.complaint} onChange={s('complaint')} /></Field>}
          <Field label="Diagnosis / work done" wide><textarea rows="3" value={f.diagnosis} onChange={s('diagnosis')} /></Field>
          {staff && <>
            <Field label="Mechanic">
              <select value={f.mechanic_id} onChange={s('mechanic_id')}>
                <option value="">Unassigned</option>
                {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Promised delivery"><input type="datetime-local" value={f.promised_at} onChange={s('promised_at')} /></Field>
            <Field label="Odometer (km)"><input type="number" min="0" value={f.odometer} onChange={s('odometer')} /></Field>
            <Field label="Fuel level"><input value={f.fuel_level} onChange={s('fuel_level')} /></Field>
          </>}
          <div className="row wide">
            <button className="btn primary" disabled={busy} onClick={save}>Save</button>
            <button className="btn ghost" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemsCard({ j, closed, staff, doAction, busy }) {
  const [mode, setMode] = useState(null);
  const t = j.totals;
  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Parts & labour</h2>
        {!closed && (
          <div className="row">
            <button className="btn small" onClick={() => setMode('part')}>+ Part</button>
            {staff && <button className="btn small" onClick={() => setMode('labour')}>+ Labour</button>}
          </div>
        )}
      </div>
      {j.invoice && !['DELIVERED', 'CANCELLED'].includes(j.status) && <p className="small muted">Invoice created – cancel the invoice to change items.</p>}
      {j.items.length === 0 ? <p className="muted">No items yet.</p> : (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th>{!closed && <th />}</tr></thead>
            <tbody>
              {j.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.description}<div className="small muted">{it.item_type === 'part' ? it.part_no : 'Labour'}</div></td>
                  <td className="num">{it.qty}</td>
                  <td className="num">{money(it.unit_price)}</td>
                  <td className="num">{money(it.line_total)}</td>
                  {!closed && <td className="num"><button className="icon-btn" title="Remove" disabled={busy}
                    onClick={() => confirm(`Remove ${it.description}?`) && doAction(() => del(`/jobs/${j.id}/items/${it.id}`))}>×</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="totals">
        <span>Parts</span><span>{money(t.parts_total)}</span>
        <span>Labour</span><span>{money(t.labour_total)}</span>
        {staff && <DiscountRow j={j} closed={closed} doAction={doAction} />}
        {t.tax_amount > 0 && <><span>Tax ({t.tax_rate}%)</span><span>{money(t.tax_amount)}</span></>}
        <strong>Total</strong><strong>{money(t.total)}</strong>
      </div>
      {mode === 'part' && <AddPartModal j={j} staff={staff} onClose={() => setMode(null)} doAction={doAction} />}
      {mode === 'labour' && <AddLabourModal j={j} onClose={() => setMode(null)} doAction={doAction} />}
    </div>
  );
}

function DiscountRow({ j, closed, doAction }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(j.discount);
  if (!edit) {
    return <>
      <span>Discount {!closed && <button className="link small" onClick={() => { setV(j.discount); setEdit(true); }}>edit</button>}</span>
      <span>− {money(j.totals.discount)}</span>
    </>;
  }
  return <>
    <span>Discount</span>
    <span className="row">
      <input type="number" min="0" className="small-input" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn small" onClick={async () => { if (await doAction(() => patch(`/jobs/${j.id}`, { discount: Number(v) || 0 }))) setEdit(false); }}>OK</button>
    </span>
  </>;
}

function AddPartModal({ j, staff, onClose, doAction }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const parts = useLoad(() => get('/parts', { q: dq }), [dq]);
  const [sel, setSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const add = async () => {
    const body = { item_type: 'part', part_id: sel.id, qty: Number(qty) };
    if (staff && price !== '' && Number(price) !== sel.unit_price) body.unit_price = Number(price);
    if (await doAction(() => post(`/jobs/${j.id}/items`, body))) onClose();
  };
  return (
    <Modal title="Add part" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!sel} onClick={add}>Add part</button></>}>
      {!sel ? <>
        <input className="search" autoFocus placeholder="Search part name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pick-list">
          {(parts.data || []).map((p) => (
            <button key={p.id} className="pick" disabled={p.stock_qty <= 0} onClick={() => { setSel(p); setPrice(p.unit_price); }}>
              <span><strong>{p.name}</strong><small className="muted"> {p.part_no} · {p.category}</small></span>
              <span className="small">{money(p.unit_price)} · <b className={p.stock_qty <= p.reorder_level ? 'late-text' : ''}>{p.stock_qty} in stock</b></span>
            </button>
          ))}
          {parts.data?.length === 0 && <p className="muted">No parts found.</p>}
        </div>
      </> : (
        <div className="grid2">
          <div className="wide"><strong>{sel.name}</strong> <span className="muted small">{sel.part_no} · {sel.stock_qty} in stock</span>
            <button className="link small" onClick={() => setSel(null)}> change</button></div>
          <Field label="Quantity"><input type="number" min="1" max={sel.stock_qty} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          {staff && <Field label="Unit price (LKR)"><input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>}
        </div>
      )}
    </Modal>
  );
}

function AddLabourModal({ j, onClose, doAction }) {
  const [f, setF] = useState({ description: '', qty: 1, unit_price: '' });
  const presets = ['General service labour', 'Brake adjustment', 'Carburettor cleaning', 'Chain adjustment & lube', 'Electrical diagnosis', 'Wheel alignment'];
  const add = async () => {
    if (await doAction(() => post(`/jobs/${j.id}/items`, { item_type: 'labour', description: f.description, qty: Number(f.qty), unit_price: Number(f.unit_price) }))) onClose();
  };
  return (
    <Modal title="Add labour" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.description || f.unit_price === ''} onClick={add}>Add labour</button></>}>
      <div className="chips">{presets.map((p) => <button key={p} className="chip" onClick={() => setF({ ...f, description: p })}>{p}</button>)}</div>
      <div className="grid2">
        <Field label="Description" wide><input autoFocus value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Hours / qty"><input type="number" min="0.25" step="0.25" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Rate (LKR)"><input type="number" min="0" value={f.unit_price} onChange={(e) => setF({ ...f, unit_price: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function InvoiceCard({ j, doAction, busy, reload }) {
  const inv = j.invoice;
  const [pay, setPay] = useState(null);
  const canCreate = !inv && ['QA_CHECK', 'READY'].includes(j.status) && j.items.length > 0;
  return (
    <div className="card">
      <h2 className="card-title">Invoice & payment</h2>
      {!inv ? (
        <div className="row wrap">
          <button className="btn primary" disabled={!canCreate || busy} onClick={() => doAction(() => post(`/jobs/${j.id}/invoice`))}>Create invoice</button>
          {!canCreate && <span className="small muted">Available once the job has passed QA and has items.</span>}
        </div>
      ) : (
        <>
          <div className="kv">
            <span>Invoice</span><strong>{inv.invoice_no}</strong>
            <span>Total</span><strong>{money(inv.total)}</strong>
            <span>Paid</span><span>{money(inv.paid_amount)} {inv.payment_method && <small className="muted">({inv.payment_method})</small>}</span>
            <span>Balance</span><strong className={inv.status === 'PAID' ? 'ok-text' : 'late-text'}>{money(inv.total - inv.paid_amount)}</strong>
            <span>Status</span><span className={`badge p-${inv.status}`}>{inv.status}</span>
          </div>
          <div className="row wrap" style={{ marginTop: 12 }}>
            {inv.status !== 'PAID' && <button className="btn primary" onClick={() => setPay({ amount: Math.round((inv.total - inv.paid_amount) * 100) / 100, method: 'Cash' })}>Record payment</button>}
            <Link className="btn ghost" to={`/jobs/${j.id}/invoice`} target="_blank">Print</Link>
            {inv.paid_amount === 0 && j.status !== 'DELIVERED' && (
              <button className="btn ghost danger" disabled={busy}
                onClick={() => confirm('Cancel this invoice so items can be changed?') && doAction(() => del(`/invoices/${inv.id}`)).then(reload)}>Cancel invoice</button>
            )}
          </div>
        </>
      )}
      {pay && (
        <Modal title="Record payment" onClose={() => setPay(null)}
          footer={<><button className="btn ghost" onClick={() => setPay(null)}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={async () => {
              const r = await doAction(() => post(`/invoices/${inv.id}/payment`, { amount: Number(pay.amount), method: pay.method }));
              if (r) { setPay(null); reload(); }
            }}>Save payment</button></>}>
          <div className="grid2">
            <Field label="Amount (LKR)"><input type="number" min="0" autoFocus value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Method">
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Other</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Timeline({ j }) {
  return (
    <div className="card">
      <h2 className="card-title">Progress</h2>
      <ol className="timeline">
        {j.history.map((h) => (
          <li key={h.id} className={`t-${h.to_status}`}>
            <div><strong>{STATUS_LABEL[h.to_status]}</strong> <span className="muted small">{fmtDateTime(h.changed_at)}</span></div>
            <div className="small muted">{h.changed_by_name}{h.note ? ` — ${h.note}` : ''}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TEMPLATE_LABEL = { checkin: 'Check-in confirmation', waiting_parts: 'Waiting for parts', ready: 'Ready for pickup', delivered: 'Thank you / next service', service_reminder: 'Service reminder' };

function MessagesCard({ j, doAction, reload }) {
  const [ev, setEv] = useState('ready');
  return (
    <div className="card">
      <h2 className="card-title">Customer messages</h2>
      {j.notifications.length === 0 && <p className="muted small">No messages yet.</p>}
      <ul className="msgs">
        {j.notifications.map((n) => (
          <li key={n.id}>
            <div className="row between">
              <span className="small"><b>{n.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</b> · {TEMPLATE_LABEL[n.template] || n.template}</span>
              <span className={`badge n-${n.status}`}>{n.status}</span>
            </div>
            <div className="small muted msg-body">{n.body}</div>
            {n.last_error && <div className="small late-text">{n.last_error}</div>}
            <div className="small muted">{fmtDateTime(n.sent_at || n.created_at)}</div>
          </li>
        ))}
      </ul>
      <div className="row">
        <select value={ev} onChange={(e) => setEv(e.target.value)}>
          {['checkin', 'waiting_parts', 'ready', 'delivered'].map((k) => <option key={k} value={k}>{TEMPLATE_LABEL[k]}</option>)}
        </select>
        <button className="btn small" onClick={() => doAction(() => post(`/jobs/${j.id}/notify`, { event: ev })).then(reload)}>Send again</button>
      </div>
    </div>
  );
}
