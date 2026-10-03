import { useParams, useSearchParams } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { fmtReg, fmtMobile, fmtDate, fmtDateTime, money, STATUS_LABEL } from '../lib.js';

export default function InvoicePrint() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const isJobCard = sp.get('type') === 'jobcard';
  const { data, error, loading } = useLoad(() => Promise.all([get(`/jobs/${id}`), get('/settings')]), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const [j, settings] = data;
  const shop = settings.shop || {};
  const inv = j.invoice;
  const t = inv
    ? { parts_total: inv.parts_total, labour_total: inv.labour_total, discount: inv.discount, tax_rate: inv.tax_rate, tax_amount: inv.tax_amount, total: inv.total }
    : j.totals;

  return (
    <div className="print-page">
      <div className="no-print print-bar">
        <button className="btn primary" onClick={() => window.print()}>Print</button>
        <button className="btn ghost" onClick={() => window.close()}>Close</button>
      </div>
      <div className="paper">
        <header className="paper-head">
          <div>
            <h1>{shop.name}</h1>
            <div>{shop.address}</div>
            <div>{shop.phone}{shop.email ? ` · ${shop.email}` : ''}</div>
          </div>
          <div className="right">
            <h2>{isJobCard ? 'JOB CARD' : 'INVOICE'}</h2>
            {!isJobCard && inv && <div><b>{inv.invoice_no}</b><br />{fmtDate(inv.issued_at)}</div>}
            {(isJobCard || !inv) && <div><b>{j.job_no}</b><br />{fmtDateTime(j.created_at)}</div>}
          </div>
        </header>

        <section className="paper-meta">
          <div>
            <b>Customer</b><br />{j.customer.name}<br />{fmtMobile(j.customer.mobile)}{j.customer.suburb ? <><br />{j.customer.suburb}</> : null}
          </div>
          <div>
            <b>Motorbike</b><br />{fmtReg(j.bike.reg_no)}<br />{j.bike.model} {j.bike.year || ''}
            {j.odometer != null && <><br />Odometer: {j.odometer.toLocaleString()} km</>}
          </div>
          <div>
            <b>Job</b><br />{j.job_no}<br />{j.service_type}<br />Status: {STATUS_LABEL[j.status]}
          </div>
        </section>

        {isJobCard && (
          <section className="paper-block">
            <b>Customer complaint</b><p>{j.complaint || '—'}</p>
            <b>Diagnosis / work done</b><p>{j.diagnosis || ' '}</p>
            <div className="paper-meta three">
              <div>Mechanic: {j.mechanic_name || '________________'}</div>
              <div>Fuel: {j.fuel_level || '____'}</div>
              <div>Promised: {j.promised_at ? fmtDateTime(j.promised_at) : '________'}</div>
            </div>
          </section>
        )}

        <table className="paper-table">
          <thead><tr><th>#</th><th>Description</th><th>Type</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {j.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td><td>{it.description}{it.part_no ? <small> ({it.part_no})</small> : null}</td>
                <td>{it.item_type === 'part' ? 'Part' : 'Labour'}</td>
                <td className="num">{it.qty}</td><td className="num">{money(it.unit_price)}</td><td className="num">{money(it.line_total)}</td>
              </tr>
            ))}
            {j.items.length === 0 && <tr><td colSpan="6" className="center muted">No items</td></tr>}
          </tbody>
        </table>

        <div className="paper-totals">
          <span>Parts</span><span>{money(t.parts_total)}</span>
          <span>Labour</span><span>{money(t.labour_total)}</span>
          {t.discount > 0 && <><span>Discount</span><span>− {money(t.discount)}</span></>}
          {t.tax_amount > 0 && <><span>Tax ({t.tax_rate}%)</span><span>{money(t.tax_amount)}</span></>}
          <b>Total</b><b>{money(t.total)}</b>
          {inv && !isJobCard && <><span>Paid</span><span>{money(inv.paid_amount)}</span><b>Balance</b><b>{money(inv.total - inv.paid_amount)}</b></>}
        </div>

        {j.bike.next_service_due_date && !isJobCard && <p className="center">Next service due: <b>{fmtDate(j.bike.next_service_due_date)}</b></p>}

        <div className="signatures">
          <div>Customer signature</div>
          <div>{isJobCard ? 'Service advisor' : 'Authorised signature'}</div>
        </div>
        <footer className="paper-foot">{shop.footer}</footer>
      </div>
    </div>
  );
}
