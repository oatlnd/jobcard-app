import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, useAction, useLoad } from '../components/ui.jsx';
import JobItems from '../components/JobItems.jsx';
import { ServicePicker, PartPicker, CustomPicker } from '../components/ItemPicker.jsx';
import { HONDA_MODELS, YEARS, fmtMobile, formatMobileInput, isValidMobileInput, fmtDate, STATUS_LABEL, money, isServiceItem, SERVICE_KIND_LABEL, SERVICE_KINDS, VISIT, isFreeService, bikeLabel } from '../lib.js';
import { KitTiles } from '../components/KitPicker.jsx';
import EstimateSelect from '../components/EstimateSelect.jsx';
import { ask } from '../components/confirm.jsx';

const emptyCustomer = { name: '', mobile: '', suburb: '', preferred_lang: 'ta' };
const emptyBike = { model: '', modelOther: '', year: '', engine_no: '', chassis_no: '', sale_date: '' };

export default function NewJob() {
  const nav = useNavigate();
  const { can } = useAuth();
  const canPrice = can('jobs.pricing');
  const [reg, setReg] = useState('');
  const [lookup, setLookup] = useState(undefined); // undefined = not searched, null = not found
  const [customer, setCustomer] = useState(emptyCustomer);
  const [bike, setBike] = useState(emptyBike);
  const [job, setJob] = useState({ odometer: '', complaint: '', mechanic_id: '', promised_at: '', delivery_method: 'PICKUP', delivery_address: '' });
  const [items, setItems] = useState([]);
  const [kind, setKind] = useState(null);
  const [kits, setKits] = useState([]); // chosen kits: { id, name, price, items }
  const [payUpfront, setPayUpfront] = useState(true);
  const [unreg, setUnreg] = useState(false);
  const [bikeFix, setBikeFix] = useState({ engine_no: '', chassis_no: '', sale_date: '' }); // missing details on an existing bike
  const [picker, setPicker] = useState(null);
  const search = useAction();
  const save = useAction();
  const users = useLoad(() => get('/users'), []);
  const models = useLoad(() => get('/kits/models'), []);
  const settings = useLoad(() => get('/settings'), []);
  const hours = settings.data?.workshop || {};
  const modelNames = models.data?.length ? [...models.data.map((m) => m.name), 'Other'] : HONDA_MODELS;
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
  const kitTotal = kits.reduce((s, k) => s + k.price, 0);
  const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price || 0), 0) + kitTotal;
  const chooseKind = (k) => { setKind(k); setKits([]); setPayUpfront(!VISIT[k].payLater); };

  const submit = (e) => {
    e.preventDefault();
    if (lookup === null && !isValidMobileInput(customer.mobile)) { save.run(async () => { throw new Error('Enter a valid mobile number, e.g. 077 123 4567'); }); return; }
    const body = {
      complaint: job.complaint,
      odometer: job.odometer === '' ? null : Number(job.odometer),
      mechanic_id: job.mechanic_id ? Number(job.mechanic_id) : null,
      promised_at: job.promised_at || null,
      delivery_method: job.delivery_method,
      delivery_address: job.delivery_method === 'HOME_DELIVERY' ? job.delivery_address : null,
      items: items.map(({ _key, part_no, ...i }) => (i.item_type === 'service' ? { ...i, description: canPrice ? i.description : undefined } : i)),
      service_kind: kind,
      pay_upfront: payUpfront,
      kits: kits.map((k) => k.id),
    };
    if (lookup) {
      body.bike_id = lookup.id;
      if (bikeFix.engine_no || bikeFix.chassis_no || bikeFix.sale_date) body.bike_update = bikeFix;
    } else {
      body.customer = customer;
      body.bike = {
        reg_no: unreg ? null : reg,
        sale_date: bike.sale_date || null,
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
  const free = isFreeService(kind);
  const v = kind ? VISIT[kind] : {};
  const bikeModel = lookup ? lookup.model : (bike.model === 'Other' ? bike.modelOther : bike.model);
  const step = lookup === null ? 4 : 3;
  const used = (k) => (lookup?.free_services || []).find((f) => f.kind === k);

  return (
    <div className="page narrow">
      <div className="page-head"><h1>New job card</h1></div>

      <form className="card" onSubmit={doLookup}>
        <h2 className="card-title">1 · Find the bike</h2>
        <div className="row">
          <input className="reg-input" placeholder="Bike no. (NP BCJ-4521) or chassis / engine no." value={reg} autoFocus
            onChange={(e) => { setReg(e.target.value.toUpperCase()); setLookup(undefined); }} />
          <button className="btn" disabled={search.busy || reg.trim().length < 3}>{search.busy ? 'Searching…' : 'Find bike'}</button>
        </div>
        <ErrorBox error={search.error} />
        {lookup && (
          <div className="found">
            <div>
              <strong>{bikeLabel(lookup)}</strong> · {lookup.model} {lookup.year || ''}
              <div className="muted small">
                {lookup.customer.name} · {fmtMobile(lookup.customer.mobile)} {lookup.customer.suburb ? `· ${lookup.customer.suburb}` : ''}
                {lookup.last_service_date && <> · Last service {fmtDate(lookup.last_service_date)}</>}
              </div>
              <div className="muted small">
                Engine {lookup.engine_no || '—'} · Chassis {lookup.chassis_no || '—'}{lookup.sale_date && <> · Sold {fmtDate(lookup.sale_date)}</>}
                {lookup.free_services?.length > 0 && <> · Free services done: {lookup.free_services.map((f) => `${SERVICE_KIND_LABEL[f.kind]} (${fmtDate(f.date)})`).join(', ')}</>}
              </div>
              <div className="row wrap" style={{ marginTop: 4 }}>
                {lookup.warranty_until && (new Date(lookup.warranty_until) >= new Date()
                  ? <span className="badge pay-PAID">Under warranty until {fmtDate(lookup.warranty_until)}</span>
                  : <span className="badge">Warranty ended {fmtDate(lookup.warranty_until)}</span>)}
                {lookup.group_name ? <span className="badge">Oil chart: {lookup.group_name}</span> : <span className="badge pay-DUE">Model not in oil chart</span>}
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
        {lookup === null && <div className="alert info">Not found – enter the customer and bike details below.</div>}
      </form>

      {lookup !== undefined && !lookup?.open_job && (
        <form onSubmit={submit} className="form-compact">
          {lookup === null && (
            <div className="card">
              <h2 className="card-title">2 · Customer & bike</h2>
              <label className="toggle" style={{ marginBottom: 10 }}>
                <input type="checkbox" checked={unreg} onChange={(e) => {
                  setUnreg(e.target.checked);
                  if (e.target.checked && !bike.chassis_no) setBike({ ...bike, chassis_no: reg });
                }} /> Brand-new bike – no number plate yet
              </label>
              {!unreg && <p className="small muted">Bike number: <strong>{reg}</strong></p>}
              <div className="grid2">
                <Field label="Customer name *"><input value={customer.name} onChange={c('name')} required /></Field>
                <Field label="Mobile number *"><input value={customer.mobile} onChange={(e) => setCustomer({ ...customer, mobile: formatMobileInput(e.target.value) })}
                  inputMode="tel" placeholder="077 123 4567" required className={customer.mobile && !isValidMobileInput(customer.mobile) ? 'invalid' : ''} /></Field>
                <Field label="Suburb"><input value={customer.suburb} onChange={c('suburb')} placeholder="e.g. Nallur" /></Field>
                <Field label="Bike model *">
                  <select value={bike.model} onChange={b('model')} required>
                    <option value="">Select model</option>
                    {modelNames.map((m) => <option key={m}>{m}</option>)}
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
                <Field label="Engine no. *"><input value={bike.engine_no} onChange={b('engine_no')} required /></Field>
                <Field label="Chassis no. *"><input value={bike.chassis_no} onChange={b('chassis_no')} required /></Field>
                <Field label="Date of sale"><input type="date" value={bike.sale_date} onChange={b('sale_date')} /></Field>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="card-title">{step - 1} · What is the visit for?</h2>
            <div className="kind-tiles">
              {SERVICE_KINDS.map((k) => (
                <button type="button" key={k} className={`kind-tile k-${k}${kind === k ? ' on' : ''}`} onClick={() => chooseKind(k)}>
                  <strong>{VISIT[k].icon} {VISIT[k].label}</strong>
                  <small>{VISIT[k].hint}</small>
                  {used(k) && <small className="late-text">Already done on {used(k).job_no}</small>}
                </button>
              ))}
            </div>
            {free && (
              <div className="alert info" style={{ marginTop: 10 }}>
                {SERVICE_KIND_LABEL[kind]}: labour is free (claimed from Honda) – the customer pays for oil and parts.
                Engine no., chassis no. and odometer are required.
              </div>
            )}
            {kind === 'WARRANTY' && <div className="alert info" style={{ marginTop: 10 }}>Paid service on a bike still under warranty. Engine no., chassis no. and odometer are required.</div>}
            {v.needComplaint && <div className="alert info" style={{ marginTop: 10 }}>Write down what the customer says is wrong in “Customer complaint” below (required).</div>}
            {kind === 'MAJOR' && <div className="alert warn" style={{ marginTop: 10 }}>Major repair: the mechanic inspects first, then you add the parts and labour and agree the price with the customer.</div>}
            {v.needBike && lookup && (!lookup.engine_no || !lookup.chassis_no || !lookup.sale_date) && (
              <div className="grid2" style={{ marginTop: 10 }}>
                {!lookup.engine_no && <Field label="Engine no. *"><input required value={bikeFix.engine_no} onChange={(e) => setBikeFix({ ...bikeFix, engine_no: e.target.value })} /></Field>}
                {!lookup.chassis_no && <Field label="Chassis no. *"><input required value={bikeFix.chassis_no} onChange={(e) => setBikeFix({ ...bikeFix, chassis_no: e.target.value })} /></Field>}
                {!lookup.sale_date && <Field label="Date of sale"><input type="date" value={bikeFix.sale_date} onChange={(e) => setBikeFix({ ...bikeFix, sale_date: e.target.value })} /></Field>}
              </div>
            )}
            <label className="toggle" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={payUpfront} onChange={(e) => setPayUpfront(e.target.checked)} />
              Customer pays at the cashier before work starts
            </label>
          </div>

          <div className="card">
            <h2 className="card-title">{step} · Job details</h2>
            <div className="grid2">
              <Field label={`Odometer (km)${v.needOdo ? ' *' : ''}`}><input type="number" min="0" value={job.odometer} onChange={j('odometer')} required={!!v.needOdo} /></Field>
              <Field label="Assign to">
                <select value={job.mechanic_id} onChange={j('mechanic_id')}>
                  <option value="">Assign later</option>
                  {workers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.is_mechanic ? '' : ` (${m.role})`}</option>)}
                </select>
              </Field>
              <Field label="Estimated delivery"><EstimateSelect value={job.promised_at} hours={hours} onChange={(iso) => setJob((cur) => ({ ...cur, promised_at: iso }))} /></Field>
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
            {kind && (
              <KitTiles model={bikeModel} visitType={kind} chosen={kits.map((k) => k.id)}
                onToggle={(k) => setKits(kits.some((x) => x.id === k.id) ? kits.filter((x) => x.id !== k.id) : [...kits, k])} />
            )}
            {kits.length > 0 && (
              <div className="kit-chosen">
                {kits.map((k) => (
                  <div key={k.id} className="kit-chosen-row">
                    <div><strong>📦 {k.name}</strong><div className="small muted">{k.items.map((i) => `${i.description}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(' · ')}</div></div>
                    {canPrice && <strong>{money(k.price)}</strong>}
                  </div>
                ))}
              </div>
            )}
            {(items.length > 0 || kits.length === 0) && <JobItems items={items} canPrice={canPrice} editable
              onChange={(it, patch) => setItems(items.map((x) => (x._key === it._key ? { ...x, ...patch } : x)))}
              onRemove={async (it) => (await ask({ title: `Remove “${it.description}”?` })) && setItems(items.filter((x) => x._key !== it._key))} />}
            {canPrice && (items.length > 0 || kits.length > 0) && (
              <div className="totals">
                {kits.length > 0 && <><span>Kits</span><span>{money(kitTotal)}</span></>}
                <span>Services</span><span>{money(items.filter(isServiceItem).reduce((s, i) => s + i.qty * i.unit_price, 0))}</span>
                <span>Parts</span><span>{money(items.filter((i) => !isServiceItem(i)).reduce((s, i) => s + i.qty * (i.unit_price || 0), 0))}</span>
                <strong>Estimate</strong><strong>{money(total)}</strong>
              </div>
            )}
            <p className="small muted">You can also add or change these later on the job card.</p>
          </div>

          <div className="card">
            <Field label={v.needComplaint ? 'Notes – what needs fixing *' : 'Notes'} wide>
              <textarea rows="3" value={job.complaint} onChange={j('complaint')} required={!!v.needComplaint}
                placeholder={v.needComplaint ? 'e.g. Front brake squeaking, engine knocking when cold' : 'Anything the mechanic or cashier should know'} />
            </Field>
          </div>

          <ErrorBox error={save.error} />
          <div className="actions-bar">
            {!kind && <span className="small late-text">Choose what the visit is for first.</span>}
            <button className="btn primary" disabled={save.busy || !kind}>{save.busy ? 'Saving…' : payUpfront ? 'Open job card & send to cashier' : 'Open job card'}</button>
            <span className="muted small">Next: print the job card and send the customer to the cashier.</span>
          </div>
        </form>
      )}

      {picker === 'services' && <ServicePicker canPrice={canPrice} existingIds={items.filter((i) => i.service_type_id).map((i) => i.service_type_id)} onClose={() => setPicker(null)} onAdd={addItems} />}
      {picker === 'parts' && <PartPicker canPrice={canPrice} onClose={() => setPicker(null)} onAdd={addItems} />}
      {picker === 'custom' && <CustomPicker canPrice={canPrice} onClose={() => setPicker(null)} onAdd={addItems} />}
    </div>
  );
}
