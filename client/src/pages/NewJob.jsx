import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, useAction, useLoad } from '../components/ui.jsx';
import JobItems from '../components/JobItems.jsx';
import { ServicePicker, PartPicker, CustomPicker } from '../components/ItemPicker.jsx';
import { HONDA_MODELS, YEARS, fmtMobile, fmtReg, localToIso, fmtDate, STATUS_LABEL, money, isServiceItem } from '../lib.js';

const emptyCustomer = { name: '', mobile: '', suburb: '', preferred_lang: 'ta' };
const emptyBike = { model: '', modelOther: '', year: '', engine_no: '', chassis_no: '' };

export default function NewJob() {
  const nav = useNavigate();
  const { can } = useAuth();
  const canPrice = can('jobs.pricing');
  const [reg, setReg] = useState('');
  const [lookup, setLookup] = useState(undefined); // undefined = not searched, null = not found
  const [customer, setCustomer] = useState(emptyCustomer);
  const [bike, setBike] = useState(emptyBike);
  const [job, setJob] = useState({ odometer: '', complaint: '', fuel_level: '', mechanic_id: '', promised_at: '', delivery_method: 'PICKUP', delivery_address: '' });
  const [items, setItems] = useState([]);
  const [picker, setPicker] = useState(null);
  const search = useAction();
  const save = useAction();
  const users = useLoad(() => get('/users'), []);
  const workers = (users.data || []).filter((u) => u.active && u.can_work).sort((a, b) => Number(b.is_mechanic) - Number(a.is_mechanic));

  const doLookup = (e) => {
    e?.preventDefault();
    if (reg.trim().length < 3) return;
    search.run(async () => setLookup(await get('/bikes/lookup', { reg })));
  };

  const addItems = (list) => {
    setItems((cur) => [...cur, ...list.map((i, k) => ({ ...i, _key: `${Date.now()}-${k}` }))]);
    setPicker(null);
  };
  const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price || 0), 0);

  const submit = (e) => {
    e.preventDefault();
    const body = {
      complaint: job.complaint,
      fuel_level: job.fuel_level,
      odometer: job.odometer === '' ? null : Number(job.odometer),
      mechanic_id: job.mechanic_id ? Number(job.mechanic_id) : null,
      promised_at: localToIso(job.promised_at),
      delivery_method: job.delivery_method,
      delivery_address: job.delivery_method === 'HOME_DELIVERY' ? job.delivery_address : null,
      items: items.map(({ _key, part_no, ...i }) => (i.item_type === 'service' ? { ...i, description: canPrice ? i.description : undefined } : i)),
    };
    if (lookup) {
      body.bike_id = lookup.id;
    } else {
      body.customer = customer;
      body.bike = {
        reg_no: reg,
        model: bike.model === 'Other' ? bike.modelOther : bike.model,
        year: bike.year && bike.year !== 'Other' ? Number(bike.year) : null,
        engine_no: bike.engine_no,
        chassis_no: bike.chassis_no,
      };
    }
    save.run(async () => {
      const created = await post('/jobs', body);
      nav(`/jobs/${created.id}`);
    });
  };

  const c = (k) => (e) => setCustomer({ ...customer, [k]: e.target.value });
  const b = (k) => (e) => setBike({ ...bike, [k]: e.target.value });
  const j = (k) => (e) => setJob({ ...job, [k]: e.target.value });
  const step = lookup === null ? 3 : 2;

  return (
    <div className="page narrow">
      <div className="page-head"><h1>New job card</h1></div>

      <form className="card" onSubmit={doLookup}>
        <h2 className="card-title">1 · Bike number</h2>
        <div className="row">
          <input className="reg-input" placeholder="e.g. NP BCJ-4521" value={reg} autoFocus
            onChange={(e) => { setReg(e.target.value.toUpperCase()); setLookup(undefined); }} />
          <button className="btn" disabled={search.busy || reg.trim().length < 3}>{search.busy ? 'Searching…' : 'Find bike'}</button>
        </div>
        <ErrorBox error={search.error} />
        {lookup && (
          <div className="found">
            <div>
              <strong>{fmtReg(lookup.reg_no)}</strong> · {lookup.model} {lookup.year || ''}
              <div className="muted small">
                {lookup.customer.name} · {fmtMobile(lookup.customer.mobile)} {lookup.customer.suburb ? `· ${lookup.customer.suburb}` : ''}
                {lookup.last_service_date && <> · Last service {fmtDate(lookup.last_service_date)}</>}
              </div>
            </div>
            {can('customers.view') && <Link className="small" to={`/customers/${lookup.customer.id}`}>View history</Link>}
          </div>
        )}
        {lookup?.open_job && (
          <div className="alert warn">
            This bike already has an open job card: <Link to={`/jobs/${lookup.open_job.id}`}>{lookup.open_job.job_no}</Link> ({STATUS_LABEL[lookup.open_job.status]}).
          </div>
        )}
        {lookup === null && <div className="alert info">New bike – enter the customer and bike details below.</div>}
      </form>

      {lookup !== undefined && !lookup?.open_job && (
        <form onSubmit={submit}>
          {lookup === null && (
            <div className="card">
              <h2 className="card-title">2 · Customer & bike</h2>
              <div className="grid2">
                <Field label="Customer name *"><input value={customer.name} onChange={c('name')} required /></Field>
                <Field label="Mobile number *" hint="e.g. 077 123 4567"><input value={customer.mobile} onChange={c('mobile')} inputMode="tel" required /></Field>
                <Field label="Suburb"><input value={customer.suburb} onChange={c('suburb')} placeholder="e.g. Nallur" /></Field>
                <Field label="Message language">
                  <select value={customer.preferred_lang} onChange={c('preferred_lang')}>
                    <option value="ta">தமிழ் (Tamil)</option>
                    <option value="en">English</option>
                  </select>
                </Field>
                <Field label="Bike model *">
                  <select value={bike.model} onChange={b('model')} required>
                    <option value="">Select model</option>
                    {HONDA_MODELS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                {bike.model === 'Other' && <Field label="Model name *"><input value={bike.modelOther} onChange={b('modelOther')} required /></Field>}
                <Field label="Year">
                  <select value={bike.year} onChange={b('year')}>
                    <option value="">Select year</option>
                    {YEARS.map((y) => <option key={y}>{y}</option>)}
                    <option value="Other">Other / older</option>
                  </select>
                </Field>
                <Field label="Engine no."><input value={bike.engine_no} onChange={b('engine_no')} /></Field>
                <Field label="Chassis no."><input value={bike.chassis_no} onChange={b('chassis_no')} /></Field>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="card-title">{step} · Job details</h2>
            <div className="grid2">
              <Field label="Customer complaint / request" wide>
                <textarea rows="2" value={job.complaint} onChange={j('complaint')} placeholder="e.g. Regular service, brake noise, starting trouble" />
              </Field>
              <Field label="Odometer (km)"><input type="number" min="0" value={job.odometer} onChange={j('odometer')} /></Field>
              <Field label="Fuel level">
                <select value={job.fuel_level} onChange={j('fuel_level')}>
                  <option value="">—</option><option>Empty</option><option>¼</option><option>½</option><option>¾</option><option>Full</option>
                </select>
              </Field>
              <Field label="Assign to">
                <select value={job.mechanic_id} onChange={j('mechanic_id')}>
                  <option value="">Assign later</option>
                  {workers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.is_mechanic ? '' : ` (${m.role})`}</option>)}
                </select>
              </Field>
              <Field label="Promised delivery"><input type="datetime-local" value={job.promised_at} onChange={j('promised_at')} /></Field>
              <Field label="Delivery">
                <select value={job.delivery_method} onChange={j('delivery_method')}>
                  <option value="PICKUP">Customer picks up</option>
                  <option value="HOME_DELIVERY">Home delivery</option>
                </select>
              </Field>
              {job.delivery_method === 'HOME_DELIVERY' && <Field label="Delivery address"><input value={job.delivery_address} onChange={j('delivery_address')} /></Field>}
            </div>
          </div>

          <div className="card">
            <div className="card-title-row">
              <h2 className="card-title">{step + 1} · Services & parts</h2>
              <div className="row wrap">
                <button type="button" className="btn small" onClick={() => setPicker('services')}>+ Services</button>
                <button type="button" className="btn small" onClick={() => setPicker('parts')}>+ Parts</button>
                <button type="button" className="btn small ghost" onClick={() => setPicker('custom')}>+ Custom</button>
              </div>
            </div>
            <JobItems items={items} canPrice={canPrice} editable
              onChange={(it, patch) => setItems(items.map((x) => (x._key === it._key ? { ...x, ...patch } : x)))}
              onRemove={(it) => setItems(items.filter((x) => x._key !== it._key))} />
            {canPrice && items.length > 0 && (
              <div className="totals">
                <span>Services</span><span>{money(items.filter(isServiceItem).reduce((s, i) => s + i.qty * i.unit_price, 0))}</span>
                <span>Parts</span><span>{money(items.filter((i) => !isServiceItem(i)).reduce((s, i) => s + i.qty * (i.unit_price || 0), 0))}</span>
                <strong>Estimate</strong><strong>{money(total)}</strong>
              </div>
            )}
            <p className="small muted">You can also add or change these later on the job card.</p>
          </div>

          <ErrorBox error={save.error} />
          <div className="actions-bar">
            <button className="btn primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Open job card'}</button>
            <span className="muted small">The customer gets a WhatsApp/SMS confirmation automatically.</span>
          </div>
        </form>
      )}

      {picker === 'services' && <ServicePicker canPrice={canPrice} existingIds={items.filter((i) => i.service_type_id).map((i) => i.service_type_id)} onClose={() => setPicker(null)} onAdd={addItems} />}
      {picker === 'parts' && <PartPicker canPrice={canPrice} onClose={() => setPicker(null)} onAdd={addItems} />}
      {picker === 'custom' && <CustomPicker canPrice={canPrice} onClose={() => setPicker(null)} onAdd={addItems} />}
    </div>
  );
}
