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
import PaymentModal from '../components/PaymentModal.jsx';
import KitPicker from '../components/KitPicker.jsx';
import {
  STATUS_LABEL, DELIVERY_LABEL, DELIVERY_ACTION, allowedStatuses, allowedDelivery, actionLabel,
  fmtMobile, fmtDateTime, fmtDate, money, isoToLocal, localToIso,
  SERVICE_KIND_LABEL, SERVICE_KIND_SHORT, SERVICE_KINDS, PAY_STATE_LABEL, isFreeService, bikeLabel,
} from '../lib.js';

export default function JobDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const job = useLoad(() => get(`/jobs/${id}`), [id]);
  const act = useAction();
  const [statusModal, setStatusModal] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [paying, setPaying] = useState(false);

  useLive('job:changed', (e) => { if (String(e.id) === String(id)) job.reload({ quiet: true }); });

  if (job.loading && !job.data) return <Loading />;
  if (job.error && !job.data) return <div className="page"><ErrorBox error={job.error} /></div>;
  const j = job.data;
  const canPrice = can('jobs.pricing');
  const showMoney = canPrice || can('payments.record');
  const closed = j.status === 'CANCELLED' || j.delivery_status === 'DELIVERED';
  // Pay-first jobs: work can't start until the cashier has taken the payment
  const waitingPayFirst = j.pay_upfront && j.payment_state === 'DUE' && j.status === 'CHECKED_IN';
  const nextStatuses = allowedStatuses(j, can).filter((s) => !waitingPayFirst || s === 'CANCELLED');
  const waitingPay = waitingPayFirst;
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
          <h1 className="row wrap">
            {bikeLabel(j.bike)} <StatusBadge status={j.status} /> <DeliveryBadge status={j.delivery_status} />
            {j.service_kind && <span className={`kind-tag k-${j.service_kind}`}>{SERVICE_KIND_SHORT[j.service_kind]}</span>}
            {(j.pay_upfront || j.payments?.length > 0) && j.status !== 'CANCELLED' && <span className={`badge pay-${j.payment_state}`}>{PAY_STATE_LABEL[j.payment_state]}</span>}
          </h1>
          <p className="muted">
            {j.job_no} · {j.bike.model}{j.bike.year ? ` · ${j.bike.year}` : ''} · Opened {fmtDateTime(j.created_at)}
            {j.delivery_method === 'HOME_DELIVERY' && ' · Home delivery'}
          </p>
        </div>
        {can('jobs.print') && <PrintMenu jobId={id} hasInvoice={!!j.invoice} />}
      </div>

      <ErrorBox error={act.error} />

      {waitingPay && (
        <div className="alert warn pay-banner">
          <div>
            <strong>Waiting for payment at the cashier{showMoney && j.totals ? ` – ${money(j.totals.balance)}` : ''}.</strong>
            <div className="small">Work starts once the customer has paid and the receipt is with the bike.</div>
          </div>
          <div className="row">
            {can('jobs.print') && <a className="btn small" href={`/print/job/${j.id}?doc=jobcard&format=thermal&auto=1`} target="_blank" rel="noreferrer">🖨 Job card</a>}
            {can('payments.record') && <button className="btn small primary" onClick={() => setPaying(true)}>Take payment</button>}
          </div>
        </div>
      )}

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
          <ItemsCard j={j} canPrice={canPrice} showMoney={showMoney} canEdit={can('jobs.items') && !closed && !j.invoice} doAction={doAction} busy={act.busy} />
          {showMoney && can('invoices.view', 'invoices.manage', 'payments.record') && <PaymentCard j={j} doAction={doAction} busy={act.busy} onPay={() => setPaying(true)} reload={() => job.reload({ quiet: true })} />}
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
      {paying && j.totals && (
        <PaymentModal job={{ id: j.id, job_no: j.job_no, label: bikeLabel(j.bike), customer_name: j.customer.name, balance: j.totals.balance, service_kind: j.service_kind }}
          onClose={() => setPaying(false)} onDone={(r) => job.setData(r.job)} />
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
  const unpaid = j.payment_state === 'DUE';
  const mustPay = status === 'DELIVERED' && j.pay_upfront && unpaid;
  const needInvoice = status === 'DELIVERED' && !j.invoice && !j.pay_upfront;
  return (
    <Modal title={DELIVERY_ACTION[status]} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Back</button>
        <button className="btn primary" disabled={busy || needInvoice || mustPay}
          onClick={() => onConfirm({ note, delivered_to: status === 'DELIVERED' ? deliveredTo : undefined })}>Confirm</button></>}>
      {needInvoice && <div className="alert warn">Create the invoice before handing over the bike.</div>}
      {mustPay && <div className="alert warn">Collect the balance{j.totals ? ` of ${money(j.totals.balance)}` : ''} at the cashier before handing over the bike.</div>}
      {status === 'DELIVERED' && unpaid && !mustPay && j.totals && <div className="alert warn">Not fully paid (balance {money(j.totals.balance)}).</div>}
      {status === 'DELIVERED' && j.payment_state === 'REFUND' && j.totals && <div className="alert info">The customer is owed a refund of {money(-j.totals.balance)} – give it at the cashier.</div>}
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
      service_kind: j.service_kind || '', pay_upfront: !!j.pay_upfront,
    });
  }, [j]);

  const save = async () => {
    const body = full
      ? { complaint: f.complaint, diagnosis: f.diagnosis, odometer: f.odometer === '' ? null : Number(f.odometer), fuel_level: f.fuel_level,
          mechanic_id: f.mechanic_id ? Number(f.mechanic_id) : null, promised_at: localToIso(f.promised_at),
          delivery_method: f.delivery_method, delivery_address: f.delivery_address,
          service_kind: f.service_kind || null, pay_upfront: f.pay_upfront }
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
          <span>Service type</span><span>{j.service_kind ? SERVICE_KIND_LABEL[j.service_kind] : '—'}</span>
          <span>Payment</span><span>{j.pay_upfront ? 'At the cashier before work starts' : 'When the bike is collected'}</span>
          {isFreeService(j.service_kind) && <><span>Engine / chassis</span><span className="mono">{j.bike.engine_no || '—'} / {j.bike.chassis_no || '—'}</span></>}
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
            <Field label="Service type">
              <select value={f.service_kind} onChange={s('service_kind')}>
                <option value="">—</option>
                {SERVICE_KINDS.map((k) => <option key={k} value={k}>{SERVICE_KIND_LABEL[k]}</option>)}
              </select>
            </Field>
            <label className="toggle"><input type="checkbox" checked={f.pay_upfront} onChange={(e) => setF({ ...f, pay_upfront: e.target.checked })} /> Pays at the cashier before work starts</label>
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

function ItemsCard({ j, canPrice, showMoney, canEdit, doAction, busy }) {
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
            <button className="btn small primary" onClick={() => setPicker('kit')}>📦 + Kit</button>
            <button className="btn small" onClick={() => setPicker('services')}>+ Services</button>
            <button className="btn small" onClick={() => setPicker('parts')}>+ Parts</button>
            <button className="btn small ghost" onClick={() => setPicker('custom')}>+ Custom</button>
          </div>
        )}
      </div>
      {j.invoice && j.delivery_status !== 'DELIVERED' && <p className="small muted">Invoice created – cancel the invoice to change items.</p>}
      {isFreeService(j.service_kind) && !j.items.some((i) => i.kit_id && Number(i.unit_price) === 0 && i.item_type === 'custom_service') && <div className="free-line">{SERVICE_KIND_LABEL[j.service_kind]} – labour <strong>FREE</strong> <span className="muted small">(Honda)</span></div>}
      <JobItems items={j.items} canPrice={showMoney} editable={canEdit} busy={busy}
        onChange={(it, body) => doAction(() => patch(`/jobs/${j.id}/items/${it.id}`, body))}
        onRemove={(it) => confirm(`Remove ${it.description}?`) && doAction(() => del(`/jobs/${j.id}/items/${it.id}`))} />
      {showMoney && t && (
        <div className="totals">
          <span>Services</span><span>{money(t.services_total)}</span>
          <span>Parts</span><span>{money(t.parts_total)}</span>
          <DiscountRow j={j} editable={canEdit} doAction={doAction} />
          {t.tax_amount > 0 && <><span>Tax ({t.tax_rate}%)</span><span>{money(t.tax_amount)}</span></>}
          <strong>Total</strong><strong>{money(t.total)}</strong>
        </div>
      )}
      {picker === 'kit' && <KitPicker job={j} busy={busy} onClose={() => setPicker(null)}
        onAdd={async (k) => { const r = await doAction(() => post(`/jobs/${j.id}/kits`, { kit_id: k.id })); if (r) setPicker(null); }} />}
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

function PaymentCard({ j, doAction, busy, onPay, reload }) {
  const { can } = useAuth();
  const inv = j.invoice;
  const t = j.totals;
  const canCreate = !inv && ['QA_CHECK', 'COMPLETED'].includes(j.status) && can('invoices.manage');
  const state = j.payment_state;
  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Payments</h2>
        {j.status !== 'CANCELLED' && <span className={`badge pay-${state}`}>{PAY_STATE_LABEL[state]}</span>}
      </div>
      <div className="kv">
        <span>Total</span><strong>{money(t.balance + t.paid)}</strong>
        <span>Paid</span><span>{money(t.paid)}</span>
        <span>{state === 'REFUND' ? 'Refund due' : 'Balance'}</span>
        <strong className={state === 'PAID' ? 'ok-text' : 'late-text'}>{money(Math.abs(t.balance))}</strong>
        {inv && <><span>Invoice</span><span>{inv.invoice_no} <small className="muted">· {fmtDate(inv.issued_at)}</small></span></>}
      </div>

      {j.payments?.length > 0 && (
        <ul className="receipts">
          {j.payments.map((p) => (
            <li key={p.id}>
              <span><b>{p.receipt_no}</b> · {fmtDateTime(p.received_at)} · {p.method}{p.reference ? ` (${p.reference})` : ''}{p.received_by_name ? ` · ${p.received_by_name}` : ''}</span>
              <span className="row">
                <strong>{p.kind === 'REFUND' ? '−' : ''}{money(p.amount)}</strong>
                <a className="small" href={`/print/receipt/${p.id}`} target="_blank" rel="noreferrer">Print</a>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="row wrap" style={{ marginTop: 12 }}>
        {state !== 'PAID' && can('payments.record') && j.delivery_status !== 'DELIVERED' && (
          <button className={`btn ${state === 'REFUND' ? 'ghost' : 'primary'}`} disabled={busy} onClick={onPay}>{state === 'REFUND' ? 'Give refund' : 'Take payment'}</button>
        )}
        {canCreate && <button className="btn" disabled={busy || (!j.items.length && !isFreeService(j.service_kind))} onClick={() => doAction(() => post(`/jobs/${j.id}/invoice`))}>Create invoice</button>}
        {inv && j.delivery_status !== 'DELIVERED' && can('invoices.manage') && (
          <button className="btn ghost danger" disabled={busy}
            onClick={() => confirm('Cancel this invoice so items can be changed? Payments stay on the job card.') && doAction(() => del(`/invoices/${inv.id}`)).then(reload)}>Cancel invoice</button>
        )}
      </div>
      {!inv && !j.pay_upfront && !canCreate && j.status !== 'CANCELLED' && <p className="small muted">The invoice can be created once the job is in QA or completed.</p>}
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

