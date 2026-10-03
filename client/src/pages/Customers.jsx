import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, Loading, Empty, useLoad, useDebounced } from '../components/ui.jsx';
import { fmtMobile, fmtReg, fmtDate } from '../lib.js';

export default function Customers() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading } = useLoad(() => get('/customers', { q: dq }), [dq]);
  return (
    <div className="page">
      <div className="page-head"><h1>Customers</h1></div>
      <div className="toolbar">
        <input className="search" autoFocus placeholder="Search name, mobile or bike number…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No customers found.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Mobile</th><th>Suburb</th><th>Bikes</th><th>Since</th></tr></thead>
            <tbody>
              {data?.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/customers/${c.id}`}>{c.name}</Link></td>
                  <td>{fmtMobile(c.mobile)}</td>
                  <td>{c.suburb || '—'}</td>
                  <td>{c.bikes.map((b) => <span key={b.id} className="chip">{fmtReg(b.reg_no)} · {b.model}</span>)}</td>
                  <td className="small">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
