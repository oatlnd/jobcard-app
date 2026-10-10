import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Loading, Empty, useLoad, useDebounced } from '../components/ui.jsx';
import { fmtDate, money } from '../lib.js';
import { useSort } from '../components/sort.jsx';

export const PO_STATUS = { DRAFT: 'Draft', ORDERED: 'Ordered', PARTIAL: 'Partly received', RECEIVED: 'Received', CLOSED: 'Closed', CANCELLED: 'Cancelled' };

const PO_SORT = { po: 'po_no', date: 'order_date', supplier: 'supplier_name', expected: 'expected_date', lines: (r) => Number(r.line_count), total: (r) => Number(r.total), status: 'status' };

export default function PurchaseOrders() {
  const { can } = useAuth();
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q);
  const supplierId = sp.get('supplier_id') || '';
  const list = useLoad(() => get('/purchasing/purchase-orders', { q: dq, status, supplier_id: supplierId }), [dq, status, supplierId]);
  const { sorted: poRows, Th } = useSort(list.data, 'pos', PO_SORT);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Purchase orders</h1><p className="muted">Order parts from suppliers, then receive them with a GRN.</p></div>
        {can('purchasing.manage') && <Link className="btn primary" to="/purchase-orders/new">+ New purchase order</Link>}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search PO number or supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <ErrorBox error={list.error} />
      {list.loading && !list.data ? <Loading /> : list.data?.length === 0 ? <Empty>No purchase orders.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><Th k="po">PO</Th><Th k="date">Date</Th><Th k="supplier">Supplier</Th><Th k="expected">Expected</Th><Th k="lines" className="num">Lines</Th><Th k="total" className="num">Total</Th><Th k="status">Status</Th></tr></thead>
            <tbody>
              {poRows.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/purchase-orders/${p.id}`}><strong>{p.po_no}</strong></Link></td>
                  <td className="small">{fmtDate(p.order_date)}</td>
                  <td>{p.supplier_name}</td>
                  <td className="small">{fmtDate(p.expected_date)}</td>
                  <td className="num">{p.line_count}</td>
                  <td className="num">{money(p.total)}</td>
                  <td><span className={`badge po-${p.status}`}>{PO_STATUS[p.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
