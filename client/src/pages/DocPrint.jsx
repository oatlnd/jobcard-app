// A4 print views for purchase orders and GRNs
import { useParams } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { fmtDate, money, num } from '../lib.js';

export default function DocPrint({ kind }) {
  const { id } = useParams();
  const url = kind === 'po' ? `/purchasing/purchase-orders/${id}` : `/purchasing/grns/${id}`;
  const { data, error, loading } = useLoad(() => Promise.all([get(url), get('/settings')]), [url]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const [d, settings] = data;
  const shop = settings.shop || {};
  const po = kind === 'po';
  return (
    <div className="print-page fmt-a4">
      <style>{'@page { size: A4; margin: 12mm; }'}</style>
      <div className="no-print print-bar"><button className="btn primary" onClick={() => window.print()}>Print</button></div>
      <div className="paper">
        <header className="paper-head">
          <div><h1>{shop.name}</h1><div>{shop.address}</div><div>{shop.phone}{shop.email ? ` · ${shop.email}` : ''}</div></div>
          <div className="right">
            <h2>{po ? 'PURCHASE ORDER' : 'GOODS RECEIVED NOTE'}</h2>
            <div><b>{po ? d.po_no : d.grn_no}</b><br />{fmtDate(po ? d.order_date : d.received_date)}</div>
          </div>
        </header>
        <section className="paper-meta">
          <div><b>{po ? 'To (supplier)' : 'Supplier'}</b><br />{d.supplier.name}{d.supplier.address && <><br />{d.supplier.address}</>}{d.supplier.phone && <><br />{d.supplier.phone}</>}</div>
          {po ? (
            <div><b>Order details</b><br />Expected: {fmtDate(d.expected_date)}<br />Terms: {d.payment_terms || '—'}<br />Ref: {d.reference || '—'}</div>
          ) : (
            <div><b>Supplier invoice</b><br />{d.supplier_invoice_no || '—'} {d.supplier_invoice_date && `(${fmtDate(d.supplier_invoice_date)})`}<br />Delivery note: {d.delivery_note_no || '—'}<br />Vehicle: {d.vehicle_no || '—'}</div>
          )}
          <div><b>{po ? 'Deliver to' : 'Purchase order'}</b><br />{po ? (d.delivery_to || shop.name) : (d.po_no || 'Direct purchase')}{!po && <><br />Received by: {d.received_by_name}</>}</div>
        </section>
        <table className="paper-table">
          <thead>
            <tr><th>#</th><th>Part no.</th><th>Description</th>{po ? <th className="num">Qty</th> : <><th className="num">Accepted</th><th className="num">Rejected</th></>}<th className="num">Unit cost</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {d.items.map((i, k) => (
              <tr key={i.id}>
                <td>{k + 1}</td><td>{i.part_no || '—'}</td><td>{i.description}</td>
                {po ? <td className="num">{i.qty_ordered}</td> : <><td className="num">{i.qty_received}</td><td className="num">{i.qty_rejected || ''}</td></>}
                <td className="num">{num(i.unit_cost)}</td><td className="num">{num(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="paper-totals">
          <span>Subtotal</span><span>{money(d.totals.subtotal)}</span>
          {d.discount > 0 && <><span>Discount</span><span>− {money(d.discount)}</span></>}
          {d.tax_amount > 0 && <><span>Tax</span><span>{money(d.tax_amount)}</span></>}
          <b>Total</b><b>{money(d.totals.total)}</b>
        </div>
        {d.notes && <p><b>Notes:</b> {d.notes}</p>}
        <div className="signatures">
          <div>{po ? 'Prepared by' : 'Received by'}</div>
          <div>{po ? 'Authorised by' : 'Checked by'}</div>
        </div>
      </div>
    </div>
  );
}
