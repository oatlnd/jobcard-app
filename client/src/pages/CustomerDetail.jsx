import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, patch, post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { DeliveryBadge, ErrorBox, Field, Loading, Modal, StatusBadge, useAction, useLoad } from '../components/ui.jsx';
import { fmtMobile, fmtReg, fmtDate, fmtDateTime, money, HONDA_MODELS, YEARS } from '../lib.js';

export default function CustomerDetail() {
  const { id } = useParams();
  const c = useLoad(() => get(`/customers/${id}`), [id]);
  const [edit, setEdit] = useState(false);
  const [addBike, setAddBike] = useState(false);
  const [editBike, setEditBike] = useState(null);
  const { can } = useAuth();
  if (c.loading && !c.data) return <Loading />;
  if (c.error && !c.data) return <div className="page"><ErrorBox error={c.error} /></div>;
  const d = c.data;
  const staff = can('customers.manage');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/customers">Customers</Link> / {d.name}</div>
          <h1>{d.name}</h1>
          <p className="muted">
            <a href={`tel:+${d.mobile}`}>{fmtMobile(d.mobile)}</a> · {d.suburb || 'No suburb'} · Messages in {d.preferred_lang === 'ta' ? 'Tamil' : 'English'}
          </p>
        </div>
        {staff && <div className="row"><button className="btn ghost" onClick={() => setEdit(true)}>Edit customer</button><button className="btn" onClick={() => setAddBike(true)}>+ Add bike</button></div>}
      </div>

      <div className="card">
        <h2 className="card-title">Bikes</h2>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Bike</th><th>Model</th><th>Year</th><th>Engine / chassis</th><th>Last service</th><th>Next due</th><th>Odometer</th>{staff && <th />}</tr></thead>
            <tbody>
              {d.bikes.map((b) => (
                <tr key={b.id}>
                  <td><strong>{fmtReg(b.reg_no)}</strong>{b.sale_date && <div className="small muted">Sold {fmtDate(b.sale_date)}</div>}</td><td>{b.model}</td><td>{b.year || '—'}</td>
                  <td className="small mono">{b.engine_no || '—'}<br />{b.chassis_no || '—'}</td>
                  <td>{fmtDate(b.last_service_date)}</td>
                  <td className={b.next_service_due_date && new Date(b.next_service_due_date) < new Date() ? 'late-text' : ''}>{fmtDate(b.next_service_due_date)}</td>
                  <td>{b.last_odometer != null ? `${b.last_odometer.toLocaleString()} km` : '—'}</td>
                  {staff && <td><button className="btn small ghost" onClick={() => setEditBike(b)}>Edit</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Service history</h2>
        {d.jobs.length === 0 ? <p className="muted">No job cards yet.</p> : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Job</th><th>Bike</th><th>Services</th><th>Status</th><th>Opened</th><th className="num">Invoice</th></tr></thead>
              <tbody>
                {d.jobs.map((j) => (
                  <tr key={j.id}>
                    <td><Link to={`/jobs/${j.id}`}>{j.job_no}</Link></td><td>{fmtReg(j.reg_no)}</td><td className="small">{j.services || '—'}</td>
                    <td><StatusBadge status={j.status} /> <DeliveryBadge status={j.delivery_status} /></td><td className="small">{fmtDateTime(j.created_at)}</td>
                    <td className="num">{j.total != null ? money(j.total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <EditCustomer d={d} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); c.reload({ quiet: true }); }} />}
      {addBike && <AddBike customerId={d.id} onClose={() => setAddBike(false)} onSaved={() => { setAddBike(false); c.reload({ quiet: true }); }} />}
      {editBike && <EditBike bike={editBike} onClose={() => setEditBike(null)} onSaved={() => { setEditBike(null); c.reload({ quiet: true }); }} />}
    </div>
  );
}

function EditCustomer({ d, onClose, onSaved }) {
  const [f, setF] = useState({ name: d.name, mobile: fmtMobile(d.mobile), suburb: d.suburb || '', email: d.email || '', preferred_lang: d.preferred_lang, notes: d.notes || '' });
  const { busy, error, run } = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Edit customer" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => run(async () => { await patch(`/customers/${d.id}`, f); onSaved(); })}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Name"><input value={f.name} onChange={s('name')} /></Field>
        <Field label="Mobile"><input value={f.mobile} onChange={s('mobile')} /></Field>
        <Field label="Suburb"><input value={f.suburb} onChange={s('suburb')} /></Field>
        <Field label="Email"><input value={f.email} onChange={s('email')} /></Field>
        <Field label="Message language">
          <select value={f.preferred_lang} onChange={s('preferred_lang')}><option value="ta">Tamil</option><option value="en">English</option></select>
        </Field>
        <Field label="Notes" wide><textarea rows="2" value={f.notes} onChange={s('notes')} /></Field>
      </div>
    </Modal>
  );
}

function EditBike({ bike, onClose, onSaved }) {
  const unreg = bike.reg_no.startsWith('UNREG');
  const [f, setF] = useState({
    reg_no: unreg ? '' : bike.reg_no, model: bike.model, year: bike.year || '', engine_no: bike.engine_no || '',
    chassis_no: bike.chassis_no || '', sale_date: bike.sale_date ? String(bike.sale_date).slice(0, 10) : '',
  });
  const { busy, error, run } = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Edit bike" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(async () => {
          await patch(`/bikes/${bike.id}`, { ...f, reg_no: f.reg_no || null, year: f.year ? Number(f.year) : null, sale_date: f.sale_date || null });
          onSaved();
        })}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Bike number" hint={unreg ? 'Not registered yet – enter the number plate when it arrives' : ''}>
          <input value={f.reg_no} onChange={(e) => setF({ ...f, reg_no: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Model"><input value={f.model} onChange={s('model')} /></Field>
        <Field label="Year"><input type="number" value={f.year} onChange={s('year')} /></Field>
        <Field label="Date of sale"><input type="date" value={f.sale_date} onChange={s('sale_date')} /></Field>
        <Field label="Engine no."><input value={f.engine_no} onChange={s('engine_no')} /></Field>
        <Field label="Chassis no."><input value={f.chassis_no} onChange={s('chassis_no')} /></Field>
      </div>
    </Modal>
  );
}

function AddBike({ customerId, onClose, onSaved }) {
  const [f, setF] = useState({ reg_no: '', model: '', year: '' });
  const { busy, error, run } = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Add bike" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(async () => {
          await post('/bikes', { customer_id: customerId, reg_no: f.reg_no, model: f.model, year: f.year && f.year !== 'Other' ? Number(f.year) : null });
          onSaved();
        })}>Add</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Bike number"><input value={f.reg_no} onChange={(e) => setF({ ...f, reg_no: e.target.value.toUpperCase() })} /></Field>
        <Field label="Model">
          <select value={f.model} onChange={s('model')}><option value="">Select</option>{HONDA_MODELS.map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
        <Field label="Year">
          <select value={f.year} onChange={s('year')}><option value="">Select</option>{YEARS.map((y) => <option key={y}>{y}</option>)}<option>Other</option></select>
        </Field>
      </div>
    </Modal>
  );
}
