import { useEffect, useState } from 'react';
import { get, put } from '../api.js';
import { ErrorBox, Field, Loading, useAction, useLoad } from '../components/ui.jsx';

const DEF_WORKSHOP = { open: '08:00', close: '17:00' };
const DEF_CASHIER = { round_change_to: 50 };
const DEF_WARRANTY = { months: 24 };

export default function Settings() {
  const s = useLoad(() => get('/settings'), []);
  if (s.loading && !s.data) return <Loading />;
  if (s.error) return <div className="page"><ErrorBox error={s.error} /></div>;
  return (
    <div className="page narrow">
      <div className="page-head"><h1>Settings</h1></div>
      <Section title="Shop details" k="shop" initial={s.data.shop} fields={[
        ['name', 'Shop name'], ['phone', 'Phone (shown on messages & invoices)'], ['address', 'Address', 'wide'], ['email', 'Email'], ['footer', 'Invoice footer', 'wide'],
      ]} />
      <Section title="Billing" k="billing" initial={s.data.billing} fields={[['tax_rate', 'Tax rate (%)', 'number']]} />
      <Section title="Workshop hours (for estimated delivery)" k="workshop" initial={s.data.workshop || DEF_WORKSHOP} fields={[['open', 'Opens at (HH:MM)'], ['close', 'Closes at (HH:MM)']]} />
      <Section title="Cashier" k="cashier" initial={s.data.cashier || DEF_CASHIER} fields={[['round_change_to', 'Round cash change down to (LKR: 1, 10, 50, 100)', 'number']]} />
      <Section title="Warranty" k="warranty" initial={s.data.warranty || DEF_WARRANTY} fields={[['months', 'Warranty length (months from date of sale)', 'number']]} />
      <Section title="Service intervals" k="service" initial={s.data.service} fields={[
        ['interval_days', 'Next service after (days)', 'number'], ['interval_km', 'Next service after (km)', 'number'], ['reminder_days_before', 'Send reminder this many days before', 'number'],
      ]} />
      <Section title="Payroll (Sri Lanka)" k="payroll" initial={s.data.payroll || {}} fields={[
        ['epf_employee_rate', 'EPF – employee %', 'number'], ['epf_employer_rate', 'EPF – employer %', 'number'], ['etf_rate', 'ETF – employer %', 'number'],
        ['ot_multiplier', 'OT rate (× hourly rate)', 'number'], ['ot_hour_divisor', 'Hourly rate = basic ÷', 'number'],
        ['nopay_day_divisor', 'Daily rate for no-pay = basic ÷', 'number'], ['mid_month_percent', 'Mid-month advance (% of basic)', 'number'],
      ]} note="Standard rates: EPF 8% + 12%, ETF 3%. OT is usually basic ÷ 240 × 1.5 per hour. Check with your accountant if your terms differ." />
      <NotificationSection initial={s.data.notifications} />
    </div>
  );
}

function Section({ title, k, initial, fields, note }) {
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => setF(initial), [initial]);
  const save = () => run(async () => { setF(await put(`/settings/${k}`, f)); setSaved(true); setTimeout(() => setSaved(false), 2000); });
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <ErrorBox error={error} />
      <div className="grid2">
        {fields.map(([key, label, type]) => (
          <Field key={key} label={label} wide={type === 'wide'}>
            <input type={type === 'number' ? 'number' : 'text'} value={f[key] ?? ''} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
          </Field>
        ))}
      </div>
      {note && <p className="small muted">{note}</p>}
      <div className="row"><button className="btn primary" disabled={busy} onClick={save}>Save</button>{saved && <span className="ok-text small">Saved ✓</span>}</div>
    </div>
  );
}

const EVENTS = [
  ['on_checkin', 'Job card opened (confirmation + status link)'],
  ['on_waiting_parts', 'Waiting for parts'],
  ['on_ready', 'Job completed – ready for pickup (with amount)'],
  ['on_delivered', 'Delivered (thank you + next service date)'],
  ['service_reminders', 'Service-due reminders'],
];

function NotificationSection({ initial }) {
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const primary = f.channels[0] || 'whatsapp';
  const fallback = f.channels[1] || '';
  const setChannels = (p, fb) => setF({ ...f, channels: [p, fb].filter((c, i, a) => c && a.indexOf(c) === i) });
  const save = () => run(async () => { setF(await put('/settings/notifications', f)); setSaved(true); setTimeout(() => setSaved(false), 2000); });
  return (
    <div className="card">
      <h2 className="card-title">Customer messages</h2>
      <ErrorBox error={error} />
      <label className="toggle"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Send automatic messages</label>
      <div className="grid2" style={{ marginTop: 12 }}>
        <Field label="Send by">
          <select value={primary} onChange={(e) => setChannels(e.target.value, fallback)}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
        </Field>
        <Field label="If that fails, use">
          <select value={fallback} onChange={(e) => setChannels(primary, e.target.value)}>
            <option value="">Nothing</option>{primary !== 'sms' && <option value="sms">SMS</option>}{primary !== 'whatsapp' && <option value="whatsapp">WhatsApp</option>}
          </select>
        </Field>
      </div>
      <div className="checks">
        {EVENTS.map(([k, label]) => (
          <label key={k} className="toggle"><input type="checkbox" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {label}</label>
        ))}
      </div>
      <p className="small muted">WhatsApp and SMS accounts are set up on the server in the .env file (see README).</p>
      <div className="row"><button className="btn primary" disabled={busy} onClick={save}>Save</button>{saved && <span className="ok-text small">Saved ✓</span>}</div>
    </div>
  );
}
