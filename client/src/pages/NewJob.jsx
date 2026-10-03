import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api.js';
import { ErrorBox, Field, useAction, useLoad } from '../components/ui.jsx';
import { HONDA_MODELS, YEARS, fmtMobile, fmtReg, localToIso, fmtDate, STATUS_LABEL } from '../lib.js';

const emptyCustomer = { name: '', mobile: '', suburb: '', preferred_lang: 'ta' };
const emptyBike = { model: '', modelOther: '', year: '', engine_no: '', chassis_no: '' };

export default function NewJob() {
  const nav = useNavigate();
  const [reg, setReg] = useState('');
  const [lookup, setLookup] = useState(undefined); // undefined = not searched, null = not found
  const [customer, setCustomer] = useState(emptyCustomer);
  const [bike, setBike] = useState(emptyBike);
  const [job, setJob] = useState({ service_type: 'General Service', odometer: '', complaint: '', fuel_level: '', mechanic_id: '', promised_at: '' });
  const search = useAction();
  const save = useAction();
  const meta = useLoad(() => Promise.all([get('/jobs/service-types'), get('/users')]), []);
  const [serviceTypes, users] = meta.data || [[], []];
  const mechanics = users.filter((u) => u.active && u.role === 'mechanic');

  const doLookup = (e) => {
    e?.preventDefault();
    if (reg.trim().length < 3) return;
    search.run(async () => setLookup(await get('/bikes/lookup', { reg })));
  };

  const submit = (e) => {
    e.preventDefault();
    const body = {
      service_type: job.service_type,
      complaint: job.complaint,
      fuel_level: job.fuel_level,
      odometer: job.odometer === '' ? null : Number(job.odometer),
      mechanic_id: job.mechanic_id ? Number(job.mechanic_id) : null,
      promised_at: localToIso(job.promised_at),
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
            <Link className="small" to={`/customers/${lookup.customer.id}`}>View history</Link>
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
            <h2 className="card-title">{lookup === null ? '3' : '2'} · Job details</h2>
            <div className="grid2">
              <Field label="Service type">
                <select value={job.service_type} onChange={j('service_type')}>
                  {serviceTypes.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Odometer (km)"><input type="number" min="0" value={job.odometer} onChange={j('odometer')} /></Field>
              <Field label="Customer complaint / request" wide>
                <textarea rows="3" value={job.complaint} onChange={j('complaint')} placeholder="e.g. Regular service, brake noise, starting trouble" />
              </Field>
              <Field label="Fuel level">
                <select value={job.fuel_level} onChange={j('fuel_level')}>
                  <option value="">—</option><option>Empty</option><option>¼</option><option>½</option><option>¾</option><option>Full</option>
                </select>
              </Field>
              <Field label="Assign mechanic">
                <select value={job.mechanic_id} onChange={j('mechanic_id')}>
                  <option value="">Assign later</option>
                  {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Promised delivery"><input type="datetime-local" value={job.promised_at} onChange={j('promised_at')} /></Field>
            </div>
          </div>

          <ErrorBox error={save.error} />
          <div className="actions-bar">
            <button className="btn primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Open job card'}</button>
            <span className="muted small">The customer gets a WhatsApp/SMS confirmation automatically.</span>
          </div>
        </form>
      )}
    </div>
  );
}
