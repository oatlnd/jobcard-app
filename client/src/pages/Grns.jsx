import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Loading, Empty, useLoad } from '../components/ui.jsx';
import { fmtDate, money } from '../lib.js';

export default function Grns() {
  const { can } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useLoad(() => get('/purchasing/grns', { from, to }), [from, to]);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Goods received (GRN)</h1><p className="muted">Each GRN adds the received quantities to stock and updates the part's cost price.</p></div>
        {can('grn.manage') && <Link className="btn primary" to="/grns/new">+ GRN without PO</Link>}
      </div>
      <div className="toolbar">
        <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <ErrorBox error={list.error} />
      {list.loading && !list.data ? <Loading /> : list.data?.length === 0 ? <Empty>No goods received yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>GRN</th><th>Received</th><th>Supplier</th><th>PO</th><th>Supplier invoice</th><th>Received by</th><th className="num">Value</th></tr></thead>
            <tbody>
              {list.data?.map((g) => (
                <tr key={g.id}>
                  <td><Link to={`/grns/${g.id}`}><strong>{g.grn_no}</strong></Link></td>
                  <td className="small">{fmtDate(g.received_date)}</td>
                  <td>{g.supplier_name}</td>
                  <td>{g.po_no ? <Link to={`/purchase-orders/${g.po_id}`}>{g.po_no}</Link> : <span className="muted">Direct</span>}</td>
                  <td>{g.supplier_invoice_no || '—'}</td>
                  <td className="small">{g.received_by_name}</td>
                  <td className="num">{money(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
