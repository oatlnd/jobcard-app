// 80mm payment receipt. The customer takes it with the bike to the workshop – work starts once it's with the bike.
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { SERVICE_KIND_LABEL, isFreeService, bikeLabel, fmtMobile, fmtDateTime, num } from '../lib.js';

export default function ReceiptPrint() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { data, error, loading } = useLoad(() => Promise.all([get(`/cashier/payments/${id}`), get('/settings')]), [id]);

  useEffect(() => {
    if (data && sp.get('auto') === '1') setTimeout(() => window.print(), 300);
  }, [data, sp]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const [{ payment: p, job: j, paid_to_date: paidToDate, balance_after: balance }, settings] = data;
  const shop = settings.shop || {};
  const refund = p.kind === 'REFUND';
  const free = isFreeService(j.service_kind) && !j.items.some((i) => i.kit_id && Number(i.unit_price) === 0 && i.item_type === 'custom_service');

  return (
    <div className="print-page fmt-thermal">
      <style>{'@page { size: 80mm auto; margin: 3mm 4mm; } @media print { html, body { width: 72mm; } }'}</style>
      <div className="no-print print-bar">
        <button className="btn primary" onClick={() => window.print()}>Print</button>
        <span className="muted small">Choose your 80mm receipt printer and set margins to "None".</span>
      </div>
      <div className="receipt">
        <div className="r-center">
          <div className="r-shop">{shop.name}</div>
          <div>{shop.address}</div>
          <div>{shop.phone}</div>
        </div>
        <div className="r-rule" />
        <div className="r-center r-title">{refund ? 'REFUND' : 'PAYMENT RECEIPT'}</div>
        <div className="r-row"><span>Receipt</span><span><b>{p.receipt_no}</b></span></div>
        <div className="r-row"><span>Date</span><span>{fmtDateTime(p.received_at)}</span></div>
        <div className="r-big">JOB {j.job_no}</div>
        <div className="r-row"><span>Bike</span><span><b>{bikeLabel(j.bike)}</b></span></div>
        <div className="r-row"><span>Model</span><span>{j.bike.model}</span></div>
        <div className="r-row"><span>Customer</span><span>{j.customer.name}</span></div>
        <div className="r-row"><span>Mobile</span><span>{fmtMobile(j.customer.mobile)}</span></div>
        {j.service_kind && <div className="r-row"><span>Service</span><span><b>{SERVICE_KIND_LABEL[j.service_kind]}</b></span></div>}
        {j.odometer != null && <div className="r-row"><span>Odometer</span><span>{j.odometer.toLocaleString()} km</span></div>}
        <div className="r-rule" />
        {free && (
          <div className="r-item">
            <div>{SERVICE_KIND_LABEL[j.service_kind]} – labour</div>
            <div className="r-row r-sub"><span>Honda free service</span><span>FREE</span></div>
          </div>
        )}
        {j.items.map((it) => (
          <div key={it.id} className="r-item">
            <div>{it.description}</div>
            <div className="r-row r-sub"><span>{Number(it.qty)} x {num(it.unit_price)}</span><span>{isFreeService(j.service_kind) && it.item_type === 'custom_service' && Number(it.line_total) === 0 ? 'FREE' : num(it.line_total)}</span></div>
          </div>
        ))}
        <div className="r-rule" />
        {j.totals.services_total > 0 && <div className="r-row"><span>Services</span><span>{num(j.totals.services_total)}</span></div>}
        <div className="r-row"><span>Parts / oil</span><span>{num(j.totals.parts_total)}</span></div>
        {j.totals.discount > 0 && <div className="r-row"><span>Discount</span><span>-{num(j.totals.discount)}</span></div>}
        {j.totals.tax_amount > 0 && <div className="r-row"><span>Tax {j.totals.tax_rate}%</span><span>{num(j.totals.tax_amount)}</span></div>}
        <div className="r-row r-total"><span>TOTAL LKR</span><span>{num(paidToDate + balance)}</span></div>
        <div className="r-rule" />
        <div className="r-row"><b>{refund ? 'REFUNDED' : 'PAID NOW'} ({p.method})</b><b>{num(p.amount)}</b></div>
        {p.cash_given != null && <div className="r-row"><span>Cash given</span><span>{num(p.cash_given)}</span></div>}
        {p.change_given != null && Number(p.change_given) > 0 && <div className="r-row"><span>Change</span><span>{num(p.change_given)}</span></div>}
        {p.reference && <div className="r-row"><span>Ref</span><span>{p.reference}</span></div>}
        <div className="r-row"><span>Paid to date</span><span>{num(paidToDate)}</span></div>
        <div className="r-row r-total"><span>BALANCE</span><span>{balance > 0.005 ? num(balance) : '0.00'}</span></div>
        {!refund && balance <= 0.005 && <div className="r-stamp">** PAID **</div>}
        <div className="r-rule" />
        {!refund && <div className="r-center"><b>Keep this receipt with the bike.</b><br />Show it when you collect your bike.</div>}
        {j.promised_at && <div className="r-center">Ready by: {fmtDateTime(j.promised_at)}</div>}
        <div className="r-center small">Cashier: {p.received_by_name || '-'}</div>
        <div className="r-center r-foot">{shop.footer}</div>
      </div>
    </div>
  );
}
