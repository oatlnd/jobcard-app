import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, Loading, Empty, useLoad } from '../components/ui.jsx';
import { fmtReg, fmtDate, money } from '../lib.js';

const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + '01';

export default function Invoices() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState('');
  const { data, error, loading } = useLoad(() => get('/invoices', { from, to, status }), [from, to, status]);
  const sum = (k) => (data || []).reduce((s, i) => s + Number(i[k]), 0);

  return (
    <div className="page">
      <div className="page-head"><h1>Invoices</h1></div>
      <div className="toolbar">
        <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partly paid</option><option value="PAID">Paid</option>
        </select>
      </div>
      {data && (
        <div className="stats">
          <div className="stat"><span>Invoices</span><strong>{data.length}</strong></div>
          <div className="stat"><span>Invoiced</span><strong>{money(sum('total'))}</strong></div>
          <div className="stat"><span>Collected</span><strong>{money(sum('paid_amount'))}</strong></div>
          <div className="stat warn"><span>Outstanding</span><strong>{money(sum('total') - sum('paid_amount'))}</strong></div>
        </div>
      )}
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No invoices in this period.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Date</th><th>Job</th><th>Customer</th><th>Bike</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {data?.map((i) => (
                <tr key={i.id}>
                  <td><Link to={`/jobs/${i.job_card_id}/invoice`} target="_blank">{i.invoice_no}</Link></td>
                  <td className="small">{fmtDate(i.issued_at)}</td>
                  <td><Link to={`/jobs/${i.job_card_id}`}>{i.job_no}</Link></td>
                  <td>{i.customer_name}</td><td>{fmtReg(i.reg_no)}</td>
                  <td className="num">{money(i.total)}</td><td className="num">{money(i.total - i.paid_amount)}</td>
                  <td><span className={`badge p-${i.status}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
