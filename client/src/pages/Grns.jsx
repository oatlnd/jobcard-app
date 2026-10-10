import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Loading, Empty, useLoad } from '../components/ui.jsx';
import { fmtDate, money } from '../lib.js';
import { useSort } from '../components/sort.jsx';

const GRN_SORT = { grn: 'grn_no', date: 'received_date', supplier: 'supplier_name', po: 'po_no', inv: 'supplier_invoice_no', by: 'received_by_name', value: (r) => Number(r.total) };

export default function Grns() {
  const { can } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useLoad(() => get('/purchasing/grns', { from, to }), [from, to]);
  const { sorted: grnRows, Th } = useSort(list.data, 'grns', GRN_SORT);
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
            <thead><tr><Th k="grn">GRN</Th><Th k="date">Received</Th><Th k="supplier">Supplier</Th><Th k="po">PO</Th><Th k="inv">Supplier invoice</Th><Th k="by">Received by</Th><Th k="value" className="num">Value</Th></tr></thead>
            <tbody>
              {grnRows.map((g) => (
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
