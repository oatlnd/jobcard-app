import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api.js';
import { ErrorBox, Loading, Empty, useAction, useLoad } from '../components/ui.jsx';
import { fmtReg, fmtMobile, fmtDate, fmtDateTime } from '../lib.js';
import { useSort } from '../components/sort.jsx';

const MSG_SORT = { when: (r) => r.sent_at || r.created_at, to: 'customer_name', channel: 'channel', msg: 'body', status: 'status' };
const DUE_SORT = { due: 'next_service_due_date', bike: 'reg_no', customer: 'customer_name', mobile: 'mobile', sent: (r) => (r.reminder_sent_for === r.next_service_due_date ? 1 : 0) };

export default function Reminders() {
  const [days, setDays] = useState(14);
  const due = useLoad(() => get('/bikes/due', { days }), [days]);
  const [status, setStatus] = useState('');
  const msgs = useLoad(() => get('/notifications', { status }), [status]);
  const { sorted: dueRows, Th } = useSort(due.data, 'due', DUE_SORT);
  const { sorted: msgRows, Th: Th2 } = useSort(msgs.data, 'msgs', MSG_SORT);
  const act = useAction();

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Reminders & messages</h1>
          <p className="muted">Service-due reminders go out automatically before each bike's due date (set the timing in Settings).</p></div>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2 className="card-title">Bikes due for service</h2>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Next 7 days</option><option value={14}>Next 14 days</option><option value={30}>Next 30 days</option>
          </select>
        </div>
        <ErrorBox error={due.error} />
        {due.loading && !due.data ? <Loading /> : due.data?.length === 0 ? <Empty>No bikes due.</Empty> : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><Th k="due">Due</Th><Th k="bike">Bike</Th><Th k="customer">Customer</Th><Th k="mobile">Mobile</Th><Th k="sent">Reminder</Th></tr></thead>
              <tbody>
                {dueRows.map((b) => (
                  <tr key={b.id}>
                    <td className={new Date(b.next_service_due_date) < new Date() ? 'late-text' : ''}>{fmtDate(b.next_service_due_date)}</td>
                    <td><strong>{fmtReg(b.reg_no)}</strong> <span className="muted small">{b.model}</span></td>
                    <td><Link to={`/customers/${b.customer_id}`}>{b.customer_name}</Link></td>
                    <td><a href={`https://wa.me/${b.mobile}`} target="_blank" rel="noreferrer">{fmtMobile(b.mobile)}</a></td>
                    <td className="small">{b.reminder_sent_for === b.next_service_due_date ? '✓ Sent' : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2 className="card-title">Message log</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option><option value="QUEUED">Queued</option><option value="SENT">Sent</option><option value="FAILED">Failed</option>
          </select>
        </div>
        <ErrorBox error={msgs.error || act.error} />
        {msgs.loading && !msgs.data ? <Loading /> : msgs.data?.length === 0 ? <Empty>No messages.</Empty> : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><Th2 k="when">When</Th2><Th2 k="to">To</Th2><Th2 k="channel">Channel</Th2><Th2 k="msg">Message</Th2><Th2 k="status">Status</Th2><th /></tr></thead>
              <tbody>
                {msgRows.map((n) => (
                  <tr key={n.id}>
                    <td className="small nowrap">{fmtDateTime(n.sent_at || n.created_at)}</td>
                    <td>{n.customer_name}<div className="small muted">{fmtMobile(n.to_number)}{n.job_no ? ` · ${n.job_no}` : ''}</div></td>
                    <td>{n.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</td>
                    <td className="small msg-cell">{n.body}{n.last_error && <div className="late-text">{n.last_error}</div>}</td>
                    <td><span className={`badge n-${n.status}`}>{n.status}</span></td>
                    <td>{n.status === 'FAILED' && <button className="btn small" disabled={act.busy}
                      onClick={() => act.run(async () => { await post(`/notifications/${n.id}/retry`); msgs.reload({ quiet: true }); })}>Retry</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
