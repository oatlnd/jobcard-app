import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, Loading, Empty, StatusBadge, useLoad, useDebounced } from '../components/ui.jsx';
import { STATUSES, STATUS_LABEL, fmtReg, fmtDateTime, money } from '../lib.js';

export default function Jobs() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading } = useLoad(() => get('/jobs', { q: dq, status }), [dq, status]);

  return (
    <div className="page">
      <div className="page-head"><h1>All job cards</h1></div>
      <div className="toolbar">
        <input className="search" placeholder="Search job no, customer or bike number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No job cards found.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Job</th><th>Bike</th><th>Customer</th><th>Service</th><th>Status</th><th>Opened</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {data?.map((j) => (
                <tr key={j.id}>
                  <td><Link to={`/jobs/${j.id}`}>{j.job_no}</Link></td>
                  <td><strong>{fmtReg(j.reg_no)}</strong><div className="small muted">{j.model}</div></td>
                  <td>{j.customer_name}</td>
                  <td>{j.service_type}</td>
                  <td><StatusBadge status={j.status} /></td>
                  <td className="small">{fmtDateTime(j.created_at)}</td>
                  <td className="num">{money(j.items_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
