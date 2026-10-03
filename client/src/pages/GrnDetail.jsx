import { Link, useParams, useSearchParams } from 'react-router-dom';
import { get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import Attachments from '../components/Attachments.jsx';
import { fmtDate, fmtDateTime, money } from '../lib.js';

export default function GrnDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { can } = useAuth();
  const grn = useLoad(() => get(`/purchasing/grns/${id}`), [id]);
  if (grn.loading && !grn.data) return <Loading />;
  if (grn.error && !grn.data) return <div className="page"><ErrorBox error={grn.error} /></div>;
  const g = grn.data;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/grns">Goods received</Link> / {g.grn_no}</div>
          <h1>{g.grn_no}</h1>
          <p className="muted">{g.supplier.name} · Received {fmtDate(g.received_date)} by {g.received_by_name}</p>
        </div>
        <a className="btn ghost" href={`/print/grn/${g.id}`} target="_blank" rel="noreferrer">🖨 Print GRN</a>
      </div>
      {sp.get('new') && <div className="alert ok">Saved. Stock has been updated. Attach the supplier invoice photo below.</div>}
      <div className="detail-grid">
        <div className="card">
          <h2 className="card-title">Items</h2>
          <div className="table-wrap flat">
            <table className="table compact">
              <thead><tr><th>Item</th><th className="num">Accepted</th><th className="num">Rejected</th><th className="num">Unit cost</th><th className="num">Value</th></tr></thead>
              <tbody>
                {g.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.description}<div className="small muted">{i.part_no || 'Non-stock item'}</div></td>
                    <td className="num">{i.qty_received} <small className="muted">{i.unit}</small></td>
                    <td className="num">{i.qty_rejected || '—'}</td>
                    <td className="num">{money(i.unit_cost)}</td>
                    <td className="num">{money(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals">
            <span>Subtotal</span><span>{money(g.totals.subtotal)}</span>
            {g.discount > 0 && <><span>Discount</span><span>− {money(g.discount)}</span></>}
            {g.tax_amount > 0 && <><span>Tax</span><span>{money(g.tax_amount)}</span></>}
            <strong>Total</strong><strong>{money(g.totals.total)}</strong>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2 className="card-title">Details</h2>
            <div className="kv">
              <span>Supplier</span><strong>{g.supplier.name}</strong>
              <span>Purchase order</span><span>{g.po_no ? <Link to={`/purchase-orders/${g.po_id}`}>{g.po_no}</Link> : 'Direct (no PO)'}</span>
              <span>Supplier invoice</span><span>{g.supplier_invoice_no || '—'}{g.supplier_invoice_date && ` · ${fmtDate(g.supplier_invoice_date)}`}</span>
              <span>Delivery note</span><span>{g.delivery_note_no || '—'}</span>
              <span>Vehicle</span><span>{g.vehicle_no || '—'}</span>
              <span>Notes</span><span className="pre">{g.notes || '—'}</span>
              <span>Entered</span><span>{fmtDateTime(g.created_at)}</span>
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">Supplier invoice / photos</h2>
            <Attachments entityType="grn" entityId={g.id} canEdit={can('grn.manage')} />
          </div>
        </div>
      </div>
    </div>
  );
}
