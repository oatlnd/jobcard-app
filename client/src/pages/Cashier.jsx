// Cashier counter: job cards waiting to pay, take payments, print receipts, today's takings.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { useLive } from '../socket.js';
import { ErrorBox, Loading, useDebounced, useLoad } from '../components/ui.jsx';
import PaymentModal from '../components/PaymentModal.jsx';
import { STATUS_LABEL, SERVICE_KIND_SHORT, CASHIER_METHODS, bikeLabel, fmtDateTime, money, timeAgo } from '../lib.js';
import { useSort } from '../components/sort.jsx';

const RC_SORT = { no: 'receipt_no', time: 'received_at', job: 'job_no', bike: 'reg_no', method: 'method', amount: (r) => (r.kind === 'REFUND' ? -1 : 1) * Number(r.amount) };

export default function Cashier() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const queue = useLoad(() => get('/cashier/queue', { q: dq || undefined }), [dq]);
  const today = useLoad(() => get('/cashier/today'), []);
  const [paying, setPaying] = useState(null);

  useLive('job:changed', () => { queue.reload({ quiet: true }); today.reload({ quiet: true }); });

  const rows = queue.data || [];
  const toPay = rows.filter((r) => r.state === 'DUE');
  const refunds = rows.filter((r) => r.state === 'REFUND');
  const open = (r) => setPaying({ ...r, label: bikeLabel(r) });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cashier</h1>
          <p className="muted">Customers bring the job card here. Take the payment and give them the receipt for the bike.</p>
        </div>
      </div>

      <div className="card cashier-search">
        <input className="reg-input" autoFocus placeholder="Job no, bike no, chassis no or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="btn ghost" onClick={() => setQ('')}>Clear</button>}
      </div>

      <ErrorBox error={queue.error} />
      {queue.loading && !queue.data ? <Loading /> : (
        <div className="card">
          <h2 className="card-title">{dq ? `Results for “${dq}”` : `Waiting to pay (${toPay.length})`}</h2>
          {rows.length === 0 && <p className="muted">{dq ? 'No open job card found.' : 'Nobody waiting. 👍'}</p>}
          <div className="pay-list">
            {(dq ? rows : toPay).map((r) => <QueueRow key={r.id} r={r} onPay={() => open(r)} />)}
          </div>
          {!dq && refunds.length > 0 && <>
            <h2 className="card-title" style={{ marginTop: 16 }}>Refunds to give ({refunds.length})</h2>
            <div className="pay-list">{refunds.map((r) => <QueueRow key={r.id} r={r} onPay={() => open(r)} />)}</div>
          </>}
        </div>
      )}

      <TodayCard today={today} />

      {paying && <PaymentModal job={paying} onClose={() => setPaying(null)} onDone={() => { queue.reload({ quiet: true }); today.reload({ quiet: true }); }} />}
    </div>
  );
}

function QueueRow({ r, onPay }) {
  const pickup = r.status === 'COMPLETED';
  return (
    <div className={`pay-row state-${r.state}`}>
      <div className="pay-row-main">
        <div className="row wrap">
          <Link to={`/jobs/${r.id}`}><strong>{r.job_no}</strong></Link>
          <strong className="reg">{bikeLabel(r)}</strong>
          {r.service_kind && <span className={`kind-tag k-${r.service_kind}`}>{SERVICE_KIND_SHORT[r.service_kind]}</span>}
          {pickup && <span className="badge s-COMPLETED">Ready – balance at pickup</span>}
          {r.status === 'CANCELLED' && <span className="badge s-CANCELLED">Cancelled</span>}
        </div>
        <div className="small muted">{r.customer_name} · {r.model} · {STATUS_LABEL[r.status]} · {timeAgo(r.created_at)}</div>
      </div>
      <div className="pay-row-amt">
        {r.paid > 0 && <div className="small muted">Paid {money(r.paid)}</div>}
        <strong>{money(Math.abs(r.balance))}</strong>
      </div>
      {r.state === 'PAID'
        ? <span className="badge p-PAID">Paid</span>
        : <button className={`btn ${r.state === 'REFUND' ? 'ghost' : 'primary'}`} onClick={onPay}>{r.state === 'REFUND' ? 'Refund' : 'Pay'}</button>}
    </div>
  );
}

function TodayCard({ today }) {
  const t = today.data;
  const { sorted: rcRows, Th } = useSort(t?.receipts, 'receipts', RC_SORT);
  if (!t) return null;
  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Today’s takings</h2>
        <strong>{money(t.total)}</strong>
      </div>
      <div className="stats">
        {CASHIER_METHODS.map((m) => <div key={m} className="stat"><span>{m}</span><strong>{money(t.by_method[m] || 0)}</strong></div>)}
        {t.cash_over > 0 && <div className="stat" title="Small change not given back (no coins)"><span>Rounding (cash over)</span><strong>{money(t.cash_over)}</strong></div>}
        <div className="stat"><span>Cash in drawer</span><strong>{money(t.cash_in_drawer ?? t.by_method.Cash)}</strong></div>
      </div>
      {t.receipts.length > 0 && (
        <div className="table-wrap"><table className="table">
          <thead><tr><Th k="no">Receipt</Th><Th k="time">Time</Th><Th k="job">Job</Th><Th k="bike">Bike</Th><Th k="method">Method</Th><Th k="amount" className="num">Amount</Th><th /></tr></thead>
          <tbody>
            {rcRows.map((p) => (
              <tr key={p.id}>
                <td>{p.receipt_no}{p.kind === 'REFUND' && <span className="badge s-CANCELLED" style={{ marginLeft: 6 }}>Refund</span>}</td>
                <td>{fmtDateTime(p.received_at)}</td>
                <td><Link to={`/jobs/${p.job_card_id}`}>{p.job_no}</Link></td>
                <td>{bikeLabel(p)}</td>
                <td>{p.method}{p.reference ? <small className="muted"> · {p.reference}</small> : null}</td>
                <td className="num">{p.kind === 'REFUND' ? '−' : ''}{money(p.amount)}</td>
                <td><a className="small" href={`/print/receipt/${p.id}`} target="_blank" rel="noreferrer">Print</a></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
