import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, patch, del } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../socket.js';
import { DeliveryBadge, ErrorBox, Field, Loading, Modal, StatusBadge, useAction, useLoad } from '../components/ui.jsx';
import JobItems from '../components/JobItems.jsx';
import Attachments from '../components/Attachments.jsx';
import PrintMenu from '../components/PrintMenu.jsx';
import { ServicePicker, PartPicker, CustomPicker } from '../components/ItemPicker.jsx';
import {
  STATUS_LABEL, DELIVERY_LABEL, DELIVERY_ACTION, allowedStatuses, allowedDelivery, actionLabel,
  fmtReg, fmtMobile, fmtDateTime, fmtDate, money, isoToLocal, localToIso,
} from '../lib.js';

export default function JobDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const job = useLoad(() => get(`/jobs/${id}`), [id]);
  const act = useAction();
  const [statusModal, setStatusModal] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null);

  useLive('job:changed', (e) => { if (String(e.id) === String(id)) job.reload({ quiet: true }); });

  if (job.loading && !job.data) return <Loading />;
  if (job.error && !job.data) return <div className="page"><ErrorBox error={job.error} /></div>;
  const j = job.data;
  const canPrice = can('jobs.pricing');
  const closed = j.status === 'CANCELLED' || j.delivery_status === 'DELIVERED';
  const nextStatuses = allowedStatuses(j, can);
  const nextDelivery = allowedDelivery(j, can);

  const doAction = (fn) => act.run(async () => { const r = await fn(); if (r?.job_no && r?.items) job.setData(r); return r ?? true; });
  const changeStatus = (status, note) => doAction(() => post(`/jobs/${id}/status`, { status, note })).then((r) => r && setStatusModal(null));
  const askStatus = (s) => {
    const needsNote = s === 'CANCELLED' || s === 'WAITING_PARTS' || (s === 'IN_PROGRESS' && ['QA_CHECK', 'COMPLETED'].includes(j.status));
    needsNote ? setStatusModal(s) : changeStatus(s);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/jobs">Job cards</Link> / {j.job_no}</div>
          <h1 className="row wrap">{fmtReg(j.bike.reg_no)} <StatusBadge status={j.status} /> <DeliveryBadge status={j.delivery_status} /></h1>
          <p className="muted">
            {j.job_no} · {j.bike.model}{j.bike.year ? ` · ${j.bike.year}` : ''} · Opened {fmtDateTime(j.created_at)}
            {j.delivery_method === 'HOME_DELIVERY' && ' · Home delivery'}
          </p>
        </div>
        {can('jobs.print') && <PrintMenu jobId={id} hasInvoice={!!j.invoice} />}
      </div>

      <ErrorBox error={act.error} />

      {(nextStatuses.length > 0 || nextDelivery.length > 0) && (
        <div className="status-actions">
          {nextStatuses.length > 0 && <span className="actions-label">Job</span>}
          {nextStatuses.map((s) => (
            <button key={s} disabled={act.busy}
              className={`btn ${s === 'CANCELLED' ? 'danger ghost' : s === 'IN_PROGRESS' && ['QA_CHECK', 'COMPLETED'].includes(j.status) ? 'ghost' : 'primary'}`}
              onClick={() => askStatus(s)}>{actionLabel(j.status, s)}</button>
          ))}
          {nextDelivery.length > 0 && <span className="actions-label">Delivery</span>}
          {nextDelivery.map((s) => (
            <button key={s} disabled={act.busy} className={`btn ${s === 'DELIVERED' ? 'primary' : 'ghost'}`} onClick={() => setDeliveryModal(s)}>
              {DELIVERY_ACTION[s]}
            </button>
          ))}
        </div>
      )}

      <div className="detail-grid">
        <div className="stack">
          <CustomerCard j={j} />
          <DetailsCard j={j} closed={closed} onSave={(body) => doAction(() => patch(`/jobs/${id}`, body))} busy={act.busy} />
          <ItemsCard j={j} canPrice={canPrice} canEdit={can('jobs.items') && !closed && !j.invoice} doAction={doAction} busy={act.busy} />
          {can('invoices.view', 'invoices.manage', 'payments.record') && canPrice && <InvoiceCard j={j} doAction={doAction} busy={act.busy} reload={() => job.reload({ quiet: true })} />}
        </div>
        <div className="stack">
          <Timeline j={j} />
          <div className="card">
            <h2 className="card-title">Photos</h2>
            <Attachments entityType="job_card" entityId={j.id} canEdit={can('jobs.edit') && !closed} />
          </div>
          {can('messages.view') && <MessagesCard j={j} doAction={doAction} reload={() => job.reload({ quiet: true })} canSend={can('messages.send')} />}
        </div>
      </div>

      {statusModal && (
        <StatusNoteModal status={statusModal} busy={act.busy} onClose={() => setStatusModal(null)} onConfirm={(note) => changeStatus(statusModal, note)} />
      )}
      {deliveryModal && (
        <DeliveryModal j={j} status={deliveryModal} busy={act.busy} onClose={() => setDeliveryModal(null)}
          onConfirm={(body) => doAction(() => post(`/jobs/${id}/delivery`, { delivery_status: deliveryModal, ...body })).then((r) => r && setDeliveryModal(null))} />
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

function DeliveryModal({ j, status, busy, onClose, onConfirm }) {
  const [deliveredTo, setDeliveredTo] = useState(j.customer.name);
  const [note, setNote] = useState('');
  const unpaid = j.invoice && j.invoice.status !== 'PAID';
  return (
    <Modal title={DELIVERY_ACTION[status]} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Back</button>
        <button className="btn primary" disabled={busy || (status === 'DELIVERED' && !j.invoice)}
          onClick={() => onConfirm({ note, delivered_to: status === 'DELIVERED' ? deliveredTo : undefined })}>Confirm</button></>}>
      {status === 'DELIVERED' && !j.invoice && <div className="alert warn">Create the invoice before handing over the bike.</div>}
      {status === 'DELIVERED' && unpaid && <div className="alert warn">The invoice is not fully paid (balance {money(j.invoice.total - j.invoice.paid_amount)}).</div>}
      {status === 'DELIVERED' && <Field label="Handed over to"><input autoFocus value={deliveredTo} onChange={(e) => setDeliveredTo(e.target.value)} /></Field>}
      {status === 'OUT_FOR_DELIVERY' && j.delivery_address && <p>Deliver to: <strong>{j.delivery_address}</strong></p>}
      <Field label={status === 'OUT_FOR_DELIVERY' ? 'Sent with (driver / note)' : 'Note'}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {status === 'DELIVERED' && <p className="small muted">The customer gets a thank-you message with the next service date.</p>}
    </Modal>
  );
}

function CustomerCard({ j }) {
  const { can } = useAuth();
  const c = j.customer;
  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Customer</h2>
        {can('customers.view') && <Link className="small" to={`/customers/${c.id}`}>History →</Link>}
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

function DetailsCard({ j, closed, onSave, busy }) {
  const { can } = useAuth();
  const full = can('jobs.edit');
  const canDiag = full || can('jobs.status');
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const users = useLoad(() => (full ? get('/users') : Promise.resolve([])), [full]);
  const workers = (users.data || []).filter((u) => u.can_work && u.active);

  useEffect(() => {
    setF({
      complaint: j.complaint || '', diagnosis: j.diagnosis || '', odometer: j.odometer ?? '', fuel_level: j.fuel_level || '',
      mechanic_id: j.mechanic_id || '', promised_at: isoToLocal(j.promised_at), delivery_method: j.delivery_method, delivery_address: j.delivery_address || '',
    });
  }, [j]);

  const save = async () => {
    const body = full
      ? { complaint: f.complaint, diagnosis: f.diagnosis, odometer: f.odometer === '' ? null : Number(f.odometer), fuel_level: f.fuel_level,
          mechanic_id: f.mechanic_id ? Number(f.mechanic_id) : null, promised_at: localToIso(f.promised_at),
          delivery_method: f.delivery_method, delivery_address: f.delivery_address }
      : { diagnosis: f.diagnosis };
    const r = await onSave(body);
    if (r) setEdit(false);
  };
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Job details</h2>
        {!closed && !edit && canDiag && <button className="btn small ghost" onClick={() => setEdit(true)}>{full ? 'Edit' : 'Add diagnosis'}</button>}
      </div>
      {!edit ? (
        <div className="kv">
          <span>Complaint</span><span className="pre">{j.complaint || '—'}</span>
          <span>Diagnosis</span><span className="pre">{j.diagnosis || '—'}</span>
          <span>Assigned to</span><span>{j.mechanic_name || <em className="muted">Unassigned</em>}</span>
          <span>Odometer</span><span>{j.odometer != null ? `${j.odometer.toLocaleString()} km` : '—'}</span>
          <span>Fuel</span><span>{j.fuel_level || '—'}</span>
          <span>Promised</span><span>{fmtDateTime(j.promised_at)}</span>
          <span>Delivery</span><span>{j.delivery_method === 'HOME_DELIVERY' ? `Home delivery${j.delivery_address ? ` – ${j.delivery_address}` : ''}` : 'Customer picks up'}</span>
          {j.delivered_to && <><span>Handed to</span><span>{j.delivered_to} · {fmtDateTime(j.delivered_at)}</span></>}
          <span>Advisor</span><span>{j.advisor_name || '—'}</span>
        </div>
      ) : (
        <div className="grid2">
          {full && <Field label="Complaint" wide><textarea rows="2" value={f.complaint} onChange={s('complaint')} /></Field>}
          <Field label="Diagnosis / work done" wide><textarea rows="3" value={f.diagnosis} onChange={s('diagnosis')} /></Field>
          {full && <>
            <Field label="Assigned to">
              <select value={f.mechanic_id} onChange={s('mechanic_id')}>
                <option value="">Unassigned</option>
                {workers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Promised delivery"><input type="datetime-local" value={f.promised_at} onChange={s('promised_at')} /></Field>
            <Field label="Odometer (km)"><input type="number" min="0" value={f.odometer} onChange={s('odometer')} /></Field>
            <Field label="Fuel level"><input value={f.fuel_level} onChange={s('fuel_level')} /></Field>
            <Field label="Delivery">
              <select value={f.delivery_method} onChange={s('delivery_method')}>
                <option value="PICKUP">Customer picks up</option><option value="HOME_DELIVERY">Home delivery</option>
              </select>
            </Field>
            {f.delivery_method === 'HOME_DELIVERY' && <Field label="Delivery address"><input value={f.delivery_address} onChange={s('delivery_address')} /></Field>}
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

function ItemsCard({ j, canPrice, canEdit, doAction, busy }) {
  const [picker, setPicker] = useState(null);
  const t = j.totals;
  const addItems = async (items) => {
    const r = await doAction(() => post(`/jobs/${j.id}/items`, { items: items.map(({ part_no, ...i }) => i) }));
    if (r) setPicker(null);
  };
  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Services & parts</h2>
        {canEdit && (
          <div className="row wrap">
            <button className="btn small" onClick={() => setPicker('services')}>+ Services</button>
            <button className="btn small" onClick={() => setPicker('parts')}>+ Parts</button>
            <button className="btn small ghost" onClick={() => setPicker('custom')}>+ Custom</button>
          </div>
        )}
      </div>
      {j.invoice && j.delivery_status !== 'DELIVERED' && <p className="small muted">Invoice created – cancel the invoice to change items.</p>}
      <JobItems items={j.items} canPrice={canPrice} editable={canEdit} busy={busy}
        onChange={(it, body) => doAction(() => patch(`/jobs/${j.id}/items/${it.id}`, body))}
        onRemove={(it) => confirm(`Remove ${it.description}?`) && doAction(() => del(`/jobs/${j.id}/items/${it.id}`))} />
      {canPrice && t && (
        <div className="totals">
          <span>Services</span><span>{money(t.services_total)}</span>
          <span>Parts</span><span>{money(t.parts_total)}</span>
          <DiscountRow j={j} editable={canEdit} doAction={doAction} />
          {t.tax_amount > 0 && <><span>Tax ({t.tax_rate}%)</span><span>{money(t.tax_amount)}</span></>}
          <strong>Total</strong><strong>{money(t.total)}</strong>
        </div>
      )}
      {picker === 'services' && <ServicePicker canPrice={canPrice} busy={busy} existingIds={j.items.filter((i) => i.service_type_id).map((i) => i.service_type_id)} onClose={() => setPicker(null)} onAdd={addItems} />}
      {picker === 'parts' && <PartPicker canPrice={canPrice} busy={busy} onClose={() => setPicker(null)} onAdd={addItems} />}
      {picker === 'custom' && <CustomPicker canPrice={canPrice} busy={busy} onClose={() => setPicker(null)} onAdd={addItems} />}
    </div>
  );
}

function DiscountRow({ j, editable, doAction }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(j.discount);
  if (!edit) {
    return <>
      <span>Discount {editable && <button className="link small" onClick={() => { setV(j.discount); setEdit(true); }}>edit</button>}</span>
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

function InvoiceCard({ j, doAction, busy, reload }) {
  const { can } = useAuth();
  const inv = j.invoice;
  const [pay, setPay] = useState(null);
  const canCreate = !inv && ['QA_CHECK', 'COMPLETED'].includes(j.status) && j.items.length > 0 && can('invoices.manage');
  return (
    <div className="card">
      <h2 className="card-title">Invoice & payment</h2>
      {!inv ? (
        <div className="row wrap">
          {can('invoices.manage') && <button className="btn primary" disabled={!canCreate || busy} onClick={() => doAction(() => post(`/jobs/${j.id}/invoice`))}>Create invoice</button>}
          {!canCreate && <span className="small muted">Available once the job is in QA or completed and has items.</span>}
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
            {inv.status !== 'PAID' && can('payments.record') && <button className="btn primary" onClick={() => setPay({ amount: Math.round((inv.total - inv.paid_amount) * 100) / 100, method: 'Cash' })}>Record payment</button>}
            {inv.paid_amount === 0 && j.delivery_status !== 'DELIVERED' && can('invoices.manage') && (
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
                {['Cash', 'Card', 'Bank Transfer', 'Other'].map((m) => <option key={m}>{m}</option>)}
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
          <li key={h.id} className={`t-${h.to_status}${h.kind === 'delivery' ? ' t-delivery' : ''}`}>
            <div>
              {h.kind === 'delivery' && <span className="tl-kind">Delivery</span>}
              <strong>{h.kind === 'delivery' ? DELIVERY_LABEL[h.to_status] : STATUS_LABEL[h.to_status]}</strong>{' '}
              <span className="muted small">{fmtDateTime(h.changed_at)}</span>
            </div>
            <div className="small muted">{h.changed_by_name}{h.note ? ` — ${h.note}` : ''}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TEMPLATE_LABEL = { checkin: 'Check-in confirmation', waiting_parts: 'Waiting for parts', ready: 'Ready for pickup', delivered: 'Thank you / next service', service_reminder: 'Service reminder' };

function MessagesCard({ j, doAction, reload, canSend }) {
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
      {canSend && (
        <div className="row">
          <select value={ev} onChange={(e) => setEv(e.target.value)}>
            {['checkin', 'waiting_parts', 'ready', 'delivered'].map((k) => <option key={k} value={k}>{TEMPLATE_LABEL[k]}</option>)}
          </select>
          <button className="btn small" onClick={() => doAction(() => post(`/jobs/${j.id}/notify`, { event: ev })).then(reload)}>Send again</button>
        </div>
      )}
    </div>
  );
}

