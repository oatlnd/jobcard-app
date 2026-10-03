// Public page for customers: /status?bike=NPBCJ4521
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, useAction } from '../components/ui.jsx';
import { STATUS_LABEL, DELIVERY_LABEL, STATUS_LABEL_TA, fmtReg, fmtDate, fmtDateTime } from '../lib.js';

const STEPS = ['CHECKED_IN', 'IN_PROGRESS', 'QA_CHECK', 'COMPLETED', 'DELIVERED'];

const T = {
  en: {
    title: 'Check your service status', bike: 'Bike number', mobile: 'Last 4 digits of your mobile', check: 'Check status',
    job: 'Job card', services: 'Services', promised: 'Expected ready', next: 'Next service due', none: 'No service record yet for this bike.',
    waiting: 'We are waiting for parts. Work will continue as soon as they arrive.', call: 'Questions? Call us',
  },
  ta: {
    title: 'உங்கள் சேவை நிலையைச் சரிபார்க்கவும்', bike: 'வாகன இலக்கம்', mobile: 'கைபேசி இலக்கத்தின் கடைசி 4 இலக்கங்கள்', check: 'நிலையைப் பார்க்க',
    job: 'வேலை அட்டை', services: 'சேவைகள்', promised: 'தயாராகும் நேரம்', next: 'அடுத்த சேவை', none: 'இந்த வாகனத்திற்கு இன்னும் சேவைப் பதிவு இல்லை.',
    waiting: 'உதிரிப்பாகங்களுக்காக காத்திருக்கிறோம். அவை வந்தவுடன் வேலை தொடரும்.', call: 'கேள்விகள்? அழையுங்கள்',
  },
};

export default function PublicStatus() {
  const [sp] = useSearchParams();
  const [lang, setLang] = useState('ta');
  const [bike, setBike] = useState(sp.get('bike') || '');
  const [m4, setM4] = useState('');
  const [res, setRes] = useState(null);
  const [shop, setShop] = useState(null);
  const { busy, error, run } = useAction();
  const t = T[lang];
  const L = lang === 'ta' ? STATUS_LABEL_TA : { ...STATUS_LABEL, ...DELIVERY_LABEL, COMPLETED: 'Work completed' };

  useEffect(() => { get('/public/shop').then(setShop).catch(() => {}); }, []);

  const check = (e) => { e.preventDefault(); run(async () => setRes(await get('/public/status', { bike, mobile4: m4 }))); };
  const job = res?.job;
  const stepIdx = !job ? -1 : job.delivery_status === 'DELIVERED' ? 4 : STEPS.indexOf(job.status === 'WAITING_PARTS' ? 'IN_PROGRESS' : job.status);

  return (
    <div className="public">
      <header className="public-head">
        <div className="brand"><span className="brand-mark">R</span><div><strong>{shop?.name || 'Ratnam Service Station'}</strong><small>Jaffna</small></div></div>
        <div className="lang-switch">
          <button className={lang === 'ta' ? 'on' : ''} onClick={() => setLang('ta')}>தமிழ்</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
        </div>
      </header>

      <main className="public-main">
        <h1>{t.title}</h1>
        <form className="card" onSubmit={check}>
          <label className="field"><span className="field-label">{t.bike}</span>
            <input className="reg-input" value={bike} onChange={(e) => setBike(e.target.value.toUpperCase())} placeholder="NP BCJ-4521" required /></label>
          <label className="field"><span className="field-label">{t.mobile}</span>
            <input value={m4} onChange={(e) => setM4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="4567" required /></label>
          <button className="btn primary block" disabled={busy || m4.length !== 4}>{busy ? '…' : t.check}</button>
          <ErrorBox error={error} />
        </form>

        {res && (
          <div className="card result">
            <div className="row between"><h2>{fmtReg(res.reg_no)}</h2><span className="muted">{res.model}</span></div>
            {!job ? <p>{t.none}</p> : (
              <>
                <div className={`big-status ${job.status === 'COMPLETED' ? `d-${job.delivery_status}` : `s-${job.status}`}`}>
                  {job.status === 'COMPLETED' ? (lang === 'ta' ? job.delivery_label_ta : job.delivery_label_en) : (lang === 'ta' ? job.label_ta : job.label_en)}
                </div>
                {job.status === 'WAITING_PARTS' && <p className="alert warn">{t.waiting}</p>}
                {job.status !== 'CANCELLED' && (
                  <ol className="steps">
                    {STEPS.map((s, i) => <li key={s} className={i <= stepIdx ? 'done' : ''}><span className="step-dot">{i < stepIdx ? '✓' : i + 1}</span><span>{L[s]}</span></li>)}
                  </ol>
                )}
                <div className="kv">
                  <span>{t.job}</span><span>{job.job_no}</span>
                  {job.services && <><span>{t.services}</span><span>{job.services}</span></>}
                  {job.promised_at && job.status !== 'COMPLETED' && <><span>{t.promised}</span><span>{fmtDateTime(job.promised_at)}</span></>}
                  {res.next_service_due_date && <><span>{t.next}</span><span>{fmtDate(res.next_service_due_date)}</span></>}
                </div>
              </>
            )}
          </div>
        )}

        {shop?.phone && <p className="center muted">{t.call}: <a href={`tel:${shop.phone.replace(/\s/g, '')}`}>{shop.phone}</a></p>}
      </main>
    </div>
  );
}
