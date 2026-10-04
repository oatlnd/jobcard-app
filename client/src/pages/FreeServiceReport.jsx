// Free services given in a period – the list to claim free-service labour back from Honda.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, downloadCsv } from '../api.js';
import { ErrorBox, Field, Loading, useLoad } from '../components/ui.jsx';
import { SERVICE_KIND_LABEL, DELIVERY_LABEL, bikeLabel, fmtDate, todayIso } from '../lib.js';

const firstOfMonth = () => `${todayIso().slice(0, 7)}-01`;

export default function FreeServiceReport() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const rep = useLoad(() => get('/reports/free-services', { from, to }), [from, to]);
  const rows = rep.data?.rows || [];

  const csv = () => downloadCsv(`honda-free-services-${from}-to-${to}.csv`, rows, [
    ['Date', (r) => r.created_at.slice(0, 10)], ['Job no', 'job_no'], ['Free service', (r) => SERVICE_KIND_LABEL[r.service_kind]],
    ['Model', 'model'], ['Reg no', (r) => (r.reg_no.startsWith('UNREG') ? '' : r.reg_no)], ['Engine no', 'engine_no'], ['Chassis no', 'chassis_no'],
    ['Date of sale', (r) => r.sale_date || ''], ['Odometer km', 'odometer'], ['Customer', 'customer_name'], ['Mobile', 'mobile'],
    ['Mechanic', (r) => r.mechanic_name || ''], ['Delivered', (r) => (r.delivered_at ? r.delivered_at.slice(0, 10) : '')],
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Free service claims</h1>
          <p className="muted">Honda free services given – with engine and chassis numbers for your claim.</p>
        </div>
        <div className="row no-print">
          <button className="btn" onClick={() => window.print()} disabled={!rows.length}>Print</button>
          <button className="btn primary" onClick={csv} disabled={!rows.length}>Download Excel (CSV)</button>
        </div>
      </div>

      <div className="card row wrap no-print">
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {rep.data && (
          <div className="stats" style={{ marginLeft: 'auto' }}>
            <div className="stat"><span>Free service 1</span><strong>{rep.data.counts.FREE_1}</strong></div>
            <div className="stat"><span>Free service 2</span><strong>{rep.data.counts.FREE_2}</strong></div>
          </div>
        )}
      </div>

      <ErrorBox error={rep.error} />
      {rep.loading && !rep.data ? <Loading /> : (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr><th>Date</th><th>Job</th><th>Service</th><th>Model</th><th>Bike</th><th>Engine no</th><th>Chassis no</th><th>Sold</th><th className="num">km</th><th>Customer</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td><Link to={`/jobs/${r.id}`}>{r.job_no}</Link></td>
                  <td><span className={`kind-tag k-${r.service_kind}`}>{SERVICE_KIND_LABEL[r.service_kind]}</span></td>
                  <td>{r.model}</td>
                  <td>{bikeLabel(r)}</td>
                  <td className="mono">{r.engine_no}</td>
                  <td className="mono">{r.chassis_no}</td>
                  <td>{r.sale_date ? fmtDate(r.sale_date) : '—'}</td>
                  <td className="num">{r.odometer?.toLocaleString() ?? '—'}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.delivery_status === 'DELIVERED' ? 'Delivered' : DELIVERY_LABEL[r.delivery_status]}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan="11" className="center muted">No free services in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
