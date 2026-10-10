// Take a payment (or give a refund) for one job card. Used by the Cashier screen and the job card page.
// Cash: the cashier types the money the customer handed over and sees the change to give back.
import { useState } from 'react';
import { get, post } from '../api.js';
import { ErrorBox, Modal, useAction, useLoad } from './ui.jsx';
import { CASHIER_METHODS, SERVICE_KIND_LABEL, money, num } from '../lib.js';

export default function PaymentModal({ job, onClose, onDone }) {
  // job: { id, job_no, reg label, customer_name, balance, service_kind }
  const refund = job.balance < 0;
  const max = Math.abs(job.balance);
  const [method, setMethod] = useState('Cash');
  const [amount, setAmount] = useState(String(max));
  const [given, setGiven] = useState('');
  const [changeEdit, setChangeEdit] = useState(null); // cashier's own change amount (null = use the rounded suggestion)
  const settings = useLoad(() => get('/settings'), []);
  const step = Number(settings.data?.cashier?.round_change_to) || 1;
  const [reference, setReference] = useState('');
  const [done, setDone] = useState(null);
  const act = useAction();

  const amt = Number(amount) || 0;
  const givenN = Number(given) || 0;
  const change = Math.round((givenN - amt) * 100) / 100;              // exact change
  const suggested = Math.max(0, Math.floor(change / step + 1e-9) * step); // rounded down (no small coins)
  const changeGiven = changeEdit !== null && changeEdit !== '' ? Number(changeEdit) : suggested;
  const kept = Math.round((change - changeGiven) * 100) / 100;
  const cash = method === 'Cash' && !refund;
  const invalid = amt <= 0 || amt > max + 0.005 || (cash && given !== '' && (givenN + 0.005 < amt || changeGiven < 0 || changeGiven > change + 0.005));

  const submit = (e) => {
    e?.preventDefault();
    if (invalid) return;
    act.run(async () => {
      const r = await post(`/cashier/jobs/${job.id}/payments`, {
        kind: refund ? 'REFUND' : 'PAYMENT', amount: amt, method,
        cash_given: cash && given !== '' ? givenN : null,
        change_given: cash && given !== '' ? changeGiven : null, reference: method === 'Cash' ? null : reference,
      });
      setDone(r.payment);
      onDone?.(r);
    });
  };

  if (done) {
    return (
      <Modal title={refund ? 'Refund recorded' : 'Payment received'} onClose={onClose}
        footer={<><button className="btn ghost" onClick={onClose}>Close</button>
          <a className="btn primary" href={`/print/receipt/${done.id}?auto=1`} target="_blank" rel="noreferrer" onClick={() => setTimeout(onClose, 300)}>🖨 Print receipt</a></>}>
        <div className="pay-done">
          <div className="pay-done-tick">✓</div>
          <div><strong>{done.receipt_no}</strong> · {money(done.amount)} · {done.method}</div>
          {done.change_given != null && Number(done.change_given) > 0 && (
            <div className="change-box">Give change: <strong>{money(done.change_given)}</strong></div>
          )}
          {Number(done.cash_over) > 0 && <p className="small muted">{money(done.cash_over)} kept as rounding (no small coins).</p>}
          {!refund && <p className="small muted">Give the printed receipt to the customer – it must go with the bike to the workshop.</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={refund ? 'Give refund' : 'Take payment'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={act.busy || invalid} onClick={submit}>
          {act.busy ? 'Saving…' : refund ? `Refund ${money(amt)}` : `Confirm ${money(amt)}`}
        </button></>}>
      <form onSubmit={submit} className="pay-form">
        <div className="pay-head">
          <div><strong>{job.job_no}</strong> · {job.label}</div>
          <div className="small muted">{job.customer_name}{job.service_kind ? ` · ${SERVICE_KIND_LABEL[job.service_kind]}` : ''}</div>
          <div className="pay-due">{refund ? 'Refund due' : 'Amount due'} <strong>{money(max)}</strong></div>
        </div>

        <div className="pay-methods">
          {CASHIER_METHODS.map((m) => (
            <button type="button" key={m} className={`pay-method${method === m ? ' on' : ''}`} onClick={() => setMethod(m)}>
              {m === 'Cash' ? '💵' : m === 'Card' ? '💳' : '🏦'} {m}
            </button>
          ))}
        </div>

        <label className="field">
          <span>{refund ? 'Refund amount (LKR)' : 'Amount paying now (LKR)'}</span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {amt > max + 0.005 && <div className="alert warn">Can't be more than {money(max)}.</div>}

        {cash && (
          <>
            <label className="field">
              <span>Cash given by customer (LKR)</span>
              <input type="number" min="0" step="0.01" autoFocus inputMode="decimal" value={given}
                onChange={(e) => { setGiven(e.target.value); setChangeEdit(null); }} placeholder={`e.g. ${num(Math.ceil(amt / 1000) * 1000).replace('.00', '')}`} />
            </label>
            {given !== '' && (
              givenN + 0.005 < amt
                ? <div className="alert warn">Not enough – {money(amt - givenN)} short.</div>
                : (
                  <div className="change-box">
                    <div className="row between wrap">
                      <span>Change to give</span>
                      <input type="number" min="0" step={step} className="change-input" value={changeEdit ?? suggested}
                        onChange={(e) => setChangeEdit(e.target.value)} aria-label="Change to give" />
                    </div>
                    {change !== changeGiven && changeGiven >= 0 && changeGiven <= change && (
                      <div className="small">Exact change {money(change)} – {money(kept)} kept as rounding</div>
                    )}
                    {changeGiven > change + 0.005 && <div className="small late-text">More than the exact change ({money(change)})</div>}
                  </div>
                )
            )}
            <div className="quick-cash">
              {[...new Set([amt, Math.ceil(amt / 500) * 500, Math.ceil(amt / 1000) * 1000, Math.ceil(amt / 5000) * 5000])].filter((v) => v > 0).map((v) => (
                <button type="button" key={v} className="chip" onClick={() => { setGiven(String(v)); setChangeEdit(null); }}>{num(v).replace('.00', '')}</button>
              ))}
            </div>
          </>
        )}
        {!cash && method !== 'Cash' && (
          <label className="field">
            <span>{method === 'Card' ? 'Card slip / approval no. (optional)' : 'Bank reference (optional)'}</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        )}
        <ErrorBox error={act.error} />
      </form>
    </Modal>
  );
}
