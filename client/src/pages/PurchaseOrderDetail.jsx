import { Link, useParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Loading, useAction, useLoad } from '../components/ui.jsx';
import Attachments from '../components/Attachments.jsx';
import { PO_STATUS } from './PurchaseOrders.jsx';
import { fmtDate, fmtDateTime, money } from '../lib.js';

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const po = useLoad(() => get(`/purchasing/purchase-orders/${id}`), [id]);
  const act = useAction();
  if (po.loading && !po.data) return <Loading />;
  if (po.error && !po.data) return <div className="page"><ErrorBox error={po.error} /></div>;
  const p = po.data;
  const setStatus = (status, msg) => (!msg || confirm(msg)) && act.run(async () => po.setData(await post(`/purchasing/purchase-orders/${id}/status`, { status })));
  const manage = can('purchasing.manage');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/purchase-orders">Purchase orders</Link> / {p.po_no}</div>
          <h1 className="row">{p.po_no} <span className={`badge po-${p.status}`}>{PO_STATUS[p.status]}</span></h1>
          <p className="muted">{p.supplier.name} · Ordered {fmtDate(p.order_date)}{p.expected_date && ` · Expected ${fmtDate(p.expected_date)}`}</p>
        </div>
        <div className="row wrap">
          <a className="btn ghost" href={`/print/po/${p.id}`} target="_blank" rel="noreferrer">🖨 Print PO</a>
          {manage && p.status === 'DRAFT' && <Link className="btn ghost" to={`/purchase-orders/${p.id}/edit`}>Edit</Link>}
          {manage && p.status === 'DRAFT' && <button className="btn primary" disabled={act.busy} onClick={() => setStatus('ORDERED')}>Mark as ordered</button>}
          {can('grn.manage') && ['ORDERED', 'PARTIAL'].includes(p.status) && <Link className="btn primary" to={`/grns/new?po=${p.id}`}>Receive goods (GRN)</Link>}
          {manage && p.status === 'PARTIAL' && <button className="btn ghost" disabled={act.busy} onClick={() => setStatus('CLOSED', 'Close this PO? The remaining items will not be received.')}>Close PO</button>}
          {manage && ['DRAFT', 'ORDERED'].includes(p.status) && <button className="btn ghost danger" disabled={act.busy} onClick={() => setStatus('CANCELLED', 'Cancel this purchase order?')}>Cancel</button>}
        </div>
      </div>
      <ErrorBox error={act.error} />
      <div className="detail-grid">
        <div className="stack">
          <div className="card">
            <h2 className="card-title">Items</h2>
            <div className="table-wrap flat">
              <table className="table compact">
                <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Unit cost</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {p.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.description}<div className="small muted">{i.part_no || 'Non-stock item'}</div></td>
                      <td className="num">{i.qty_ordered} <small className="muted">{i.unit}</small></td>
                      <td className={`num ${i.qty_received >= i.qty_ordered ? 'ok-text' : i.qty_received > 0 ? 'warn-text' : ''}`}>{i.qty_received}</td>
                      <td className="num">{money(i.unit_cost)}</td>
                      <td className="num">{money(i.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals">
              <span>Subtotal</span><span>{money(p.totals.subtotal)}</span>
              {p.discount > 0 && <><span>Discount</span><span>− {money(p.discount)}</span></>}
              {p.tax_amount > 0 && <><span>Tax</span><span>{money(p.tax_amount)}</span></>}
              <strong>Total</strong><strong>{money(p.totals.total)}</strong>
            </div>
          </div>
          {p.grns.length > 0 && (
            <div className="card">
              <h2 className="card-title">Goods received</h2>
              <ul className="plain-list">
                {p.grns.map((g) => <li key={g.id}><Link to={`/grns/${g.id}`}>{g.grn_no}</Link> · {fmtDate(g.received_date)}{g.supplier_invoice_no && ` · Supplier invoice ${g.supplier_invoice_no}`}</li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card">
            <h2 className="card-title">Details</h2>
            <div className="kv">
              <span>Supplier</span><span><strong>{p.supplier.name}</strong>{p.supplier.phone && <><br />{p.supplier.phone}</>}</span>
              <span>Payment terms</span><span>{p.payment_terms || '—'}</span>
              <span>Reference</span><span>{p.reference || '—'}</span>
              <span>Deliver to</span><span>{p.delivery_to || '—'}</span>
              <span>Notes</span><span className="pre">{p.notes || '—'}</span>
              <span>Created by</span><span>{p.created_by_name} · {fmtDateTime(p.created_at)}</span>
              {p.ordered_at && <><span>Ordered</span><span>{fmtDateTime(p.ordered_at)}</span></>}
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">Documents</h2>
            <Attachments entityType="purchase_order" entityId={p.id} canEdit={manage} />
          </div>
        </div>
      </div>
    </div>
  );
}
