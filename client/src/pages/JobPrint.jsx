// Printable job card / estimate / invoice in three layouts:
//   a4        – full page with logo area, tables and signatures
//   thermal   – 80mm receipt printer (72mm printable width)
//   dotmatrix – plain fixed-width text (80 columns) that prints cleanly on dot-matrix printers
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { get } from '../api.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { fmtMobile, fmtDate, fmtDateTime, money, num, STATUS_LABEL, DELIVERY_LABEL, isServiceItem, SERVICE_KIND_LABEL, isFreeService, bikeLabel } from '../lib.js';

const fmtReg = (r) => bikeLabel({ reg_no: r });

const PAGE_CSS = {
  a4: '@page { size: A4; margin: 12mm; }',
  thermal: '@page { size: 80mm auto; margin: 3mm 4mm; } @media print { html, body { width: 72mm; } }',
  dotmatrix: '@page { size: auto; margin: 8mm 10mm; }',
};

export default function JobPrint() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const doc = ['jobcard', 'invoice', 'estimate'].includes(sp.get('doc')) ? sp.get('doc') : 'jobcard';
  const format = ['a4', 'thermal', 'dotmatrix'].includes(sp.get('format')) ? sp.get('format') : 'a4';
  const { data, error, loading } = useLoad(() => Promise.all([get(`/jobs/${id}`), get('/settings')]), [id]);

  useEffect(() => {
    if (data && sp.get('auto') === '1') setTimeout(() => window.print(), 300);
  }, [data, sp]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const [j, settings] = data;
  const shop = settings.shop || {};
  const inv = j.invoice;
  const showPrices = doc !== 'jobcard' && !!j.totals;
  const t = inv && inv.total !== undefined
    ? { services_total: inv.labour_total, parts_total: inv.parts_total, discount: inv.discount, tax_rate: inv.tax_rate, tax_amount: inv.tax_amount, total: inv.total }
    : j.totals;
  const title = { jobcard: 'JOB CARD', invoice: 'INVOICE', estimate: 'ESTIMATE' }[doc];
  const props = { j, shop, inv, doc, t, showPrices, title };

  return (
    <div className={`print-page fmt-${format}`}>
      <style>{PAGE_CSS[format]}</style>
      <div className="no-print print-bar">
        <button className="btn primary" onClick={() => window.print()}>Print</button>
        <span className="muted small">
          {format === 'thermal' && 'Choose your 80mm receipt printer and set margins to "None" in the print dialog.'}
          {format === 'dotmatrix' && 'Choose your dot-matrix printer. Plain text layout, 80 characters wide.'}
          {format === 'a4' && 'A4 paper.'}
        </span>
        <span className="row" style={{ marginLeft: 'auto' }}>
          {['a4', 'thermal', 'dotmatrix'].map((f) => (
            <a key={f} className={`chip${f === format ? ' chip-on' : ''}`} href={`?doc=${doc}&format=${f}`}>{f === 'a4' ? 'A4' : f === 'thermal' ? '80mm' : 'Dot-matrix'}</a>
          ))}
        </span>
      </div>
      {format === 'a4' && <A4 {...props} />}
      {format === 'thermal' && <Thermal {...props} />}
      {format === 'dotmatrix' && <DotMatrix {...props} />}
    </div>
  );
}

function A4({ j, shop, inv, doc, t, showPrices, title }) {
  const groups = [['Services', j.items.filter(isServiceItem)], ['Parts', j.items.filter((i) => !isServiceItem(i))]];
  let n = 0;
  return (
    <div className="paper">
      <header className="paper-head">
        <div>
          <h1>{shop.name}</h1>
          <div>{shop.address}</div>
          <div>{shop.phone}{shop.email ? ` · ${shop.email}` : ''}</div>
        </div>
        <div className="right">
          <h2>{title}</h2>
          {doc === 'invoice' && inv ? <div><b>{inv.invoice_no}</b><br />{fmtDate(inv.issued_at)}<br />Job {j.job_no}</div>
            : <div><b>{j.job_no}</b><br />{fmtDateTime(j.created_at)}</div>}
        </div>
      </header>

      <section className="paper-meta">
        <div><b>Customer</b><br />{j.customer.name}<br />{fmtMobile(j.customer.mobile)}{j.customer.suburb ? <><br />{j.customer.suburb}</> : null}</div>
        <div>
          <b>Motorbike</b><br />{fmtReg(j.bike.reg_no)}<br />{j.bike.model} {j.bike.year || ''}
          {j.odometer != null && <><br />Odometer: {j.odometer.toLocaleString()} km</>}
          {(j.bike.engine_no || j.bike.chassis_no) && <><br /><small>Engine {j.bike.engine_no || '—'} · Chassis {j.bike.chassis_no || '—'}</small></>}
          {j.service_kind && <><br /><b>{SERVICE_KIND_LABEL[j.service_kind]}</b></>}
        </div>
        <div>
          <b>Status</b><br />Job: {STATUS_LABEL[j.status]}<br />Delivery: {DELIVERY_LABEL[j.delivery_status]}
          {j.delivery_method === 'HOME_DELIVERY' && <><br />Home delivery</>}
        </div>
      </section>

      {doc === 'jobcard' && (
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
        <thead>
          <tr><th>#</th><th>Description</th><th className="num">Qty</th>{showPrices && <><th className="num">Rate</th><th className="num">Amount</th></>}{!showPrices && <th>Done ✓</th>}</tr>
        </thead>
        {groups.map(([label, list]) => list.length > 0 && (
          <tbody key={label}>
            <tr className="paper-group"><td colSpan={showPrices ? 5 : 4}>{label}</td></tr>
            {list.map((it) => (
              <tr key={it.id}>
                <td>{++n}</td>
                <td>{it.description}{it.part_no ? <small> ({it.part_no})</small> : null}</td>
                <td className="num">{Number(it.qty)}</td>
                {showPrices ? <><td className="num">{num(it.unit_price)}</td><td className="num">{num(it.line_total)}</td></> : <td>☐</td>}
              </tr>
            ))}
          </tbody>
        ))}
        {j.items.length === 0 && <tbody><tr><td colSpan="5" className="center muted">No items</td></tr></tbody>}
      </table>

      {showPrices && t && (
        <div className="paper-totals">
          <span>Services</span><span>{money(t.services_total)}</span>
          <span>Parts</span><span>{money(t.parts_total)}</span>
          {t.discount > 0 && <><span>Discount</span><span>− {money(t.discount)}</span></>}
          {t.tax_amount > 0 && <><span>Tax ({t.tax_rate}%)</span><span>{money(t.tax_amount)}</span></>}
          <b>Total</b><b>{money(t.total)}</b>
          {doc === 'invoice' && inv?.paid_amount !== undefined && <><span>Paid</span><span>{money(inv.paid_amount)}</span><b>Balance</b><b>{money(inv.total - inv.paid_amount)}</b></>}
        </div>
      )}
      {doc === 'jobcard' && <PayNote j={j} />}
      {doc === 'estimate' && <p className="small center">This is an estimate. The final amount may change if more work is needed.</p>}
      {j.bike.next_service_due_date && doc === 'invoice' && <p className="center">Next service due: <b>{fmtDate(j.bike.next_service_due_date)}</b></p>}

      <div className="signatures">
        <div>Customer signature</div>
        <div>{doc === 'jobcard' ? 'Service advisor' : 'Authorised signature'}</div>
      </div>
      <footer className="paper-foot">{shop.footer}</footer>
    </div>
  );
}

function Thermal({ j, shop, inv, doc, t, showPrices, title }) {
  return (
    <div className="receipt">
      <div className="r-center">
        <div className="r-shop">{shop.name}</div>
        <div>{shop.address}</div>
        <div>{shop.phone}</div>
      </div>
      <div className="r-rule" />
      <div className="r-center r-title">{title}</div>
      <div className="r-row"><span>{doc === 'invoice' && inv ? inv.invoice_no : j.job_no}</span><span>{fmtDateTime(doc === 'invoice' && inv ? inv.issued_at : j.created_at)}</span></div>
      {doc === 'invoice' && <div className="r-row"><span>Job</span><span>{j.job_no}</span></div>}
      <div className="r-row"><span>Bike</span><span><b>{fmtReg(j.bike.reg_no)}</b></span></div>
      <div className="r-row"><span>Model</span><span>{j.bike.model} {j.bike.year || ''}</span></div>
      <div className="r-row"><span>Customer</span><span>{j.customer.name}</span></div>
      <div className="r-row"><span>Mobile</span><span>{fmtMobile(j.customer.mobile)}</span></div>
      {j.odometer != null && <div className="r-row"><span>Odometer</span><span>{j.odometer.toLocaleString()} km</span></div>}
      {j.service_kind && <div className="r-row"><span>Service</span><span><b>{SERVICE_KIND_LABEL[j.service_kind]}</b></span></div>}
      {isFreeService(j.service_kind) && <div className="r-row"><span>Chassis</span><span>{j.bike.chassis_no}</span></div>}
      {doc === 'jobcard' && <>
        <div className="r-row"><span>Mechanic</span><span>{j.mechanic_name || '-'}</span></div>
        {j.promised_at && <div className="r-row"><span>Promised</span><span>{fmtDateTime(j.promised_at)}</span></div>}
        {j.complaint && <div className="r-note">Complaint: {j.complaint}</div>}
      </>}
      <div className="r-rule" />
      {j.items.map((it) => (
        <div key={it.id} className="r-item">
          <div>{it.description}</div>
          <div className="r-row r-sub">
            <span>{Number(it.qty)}{showPrices ? ` x ${num(it.unit_price)}` : ''}</span>
            <span>{showPrices ? num(it.line_total) : '[  ]'}</span>
          </div>
        </div>
      ))}
      {showPrices && t && <>
        <div className="r-rule" />
        <div className="r-row"><span>Services</span><span>{num(t.services_total)}</span></div>
        <div className="r-row"><span>Parts</span><span>{num(t.parts_total)}</span></div>
        {t.discount > 0 && <div className="r-row"><span>Discount</span><span>-{num(t.discount)}</span></div>}
        {t.tax_amount > 0 && <div className="r-row"><span>Tax {t.tax_rate}%</span><span>{num(t.tax_amount)}</span></div>}
        <div className="r-row r-total"><span>TOTAL LKR</span><span>{num(t.total)}</span></div>
        {doc === 'invoice' && inv?.paid_amount !== undefined && <>
          <div className="r-row"><span>Paid {inv.payment_method ? `(${inv.payment_method})` : ''}</span><span>{num(inv.paid_amount)}</span></div>
          <div className="r-row"><b>Balance</b><b>{num(inv.total - inv.paid_amount)}</b></div>
        </>}
      </>}
      <div className="r-rule" />
      {doc === 'invoice' && j.bike.next_service_due_date && <div className="r-center">Next service: {fmtDate(j.bike.next_service_due_date)}</div>}
      {doc === 'jobcard' && <PayNote j={j} thermal />}
      {doc === 'jobcard' && <div className="r-sign">Customer signature<br /><br />.............................</div>}
      <div className="r-center r-foot">{shop.footer}</div>
    </div>
  );
}

// ---------- Dot-matrix: plain fixed-width text ----------
const W = 80;
const pad = (s, n, right) => {
  const str = String(s ?? '');
  if (str.length >= n) return str.slice(0, n);
  return right ? ' '.repeat(n - str.length) + str : str + ' '.repeat(n - str.length);
};
const center = (s) => pad(' '.repeat(Math.max(0, Math.floor((W - String(s).length) / 2))) + s, W);
const twoCol = (l, r) => pad(l, W - String(r).length) + r;
const rule = (c = '-') => c.repeat(W);
function wrap(text, width) {
  const words = String(text || '').split(/\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function DotMatrix({ j, shop, inv, doc, t, showPrices, title }) {
  const L = [];
  L.push(center(String(shop.name || '').toUpperCase()));
  if (shop.address) L.push(center(shop.address));
  if (shop.phone) L.push(center(`Tel: ${shop.phone}`));
  L.push(rule('='));
  L.push(twoCol(title, doc === 'invoice' && inv ? `${inv.invoice_no}  ${fmtDate(inv.issued_at)}` : `${j.job_no}  ${fmtDateTime(j.created_at)}`));
  L.push(rule('='));
  L.push(pad(`Customer : ${j.customer.name}`, 44) + pad(`Bike No : ${fmtReg(j.bike.reg_no)}`, 36));
  L.push(pad(`Mobile   : ${fmtMobile(j.customer.mobile)}`, 44) + pad(`Model   : ${j.bike.model} ${j.bike.year || ''}`, 36));
  L.push(pad(`Job No   : ${j.job_no}`, 44) + pad(`Odometer: ${j.odometer != null ? j.odometer.toLocaleString() + ' km' : '-'}`, 36));
  L.push(pad(`Status   : ${STATUS_LABEL[j.status]}`, 44) + pad(`Delivery: ${DELIVERY_LABEL[j.delivery_status]}`, 36));
  if (doc === 'jobcard') {
    L.push(pad(`Mechanic : ${j.mechanic_name || '________________'}`, 44) + pad(`Promised: ${j.promised_at ? fmtDateTime(j.promised_at) : '________'}`, 36));
    L.push(rule());
    wrap(`Complaint: ${j.complaint || '-'}`, W).forEach((l) => L.push(l));
    wrap(`Diagnosis: ${j.diagnosis || '_'.repeat(60)}`, W).forEach((l) => L.push(l));
  }
  L.push(rule());
  L.push(showPrices
    ? pad('No', 4) + pad('Description', 44) + pad('Qty', 6, true) + pad('Rate', 12, true) + pad('Amount', 14, true)
    : pad('No', 4) + pad('Description', 62) + pad('Qty', 6, true) + pad('Done', 8, true));
  L.push(rule());
  let n = 0;
  for (const [label, list] of [['SERVICES', j.items.filter(isServiceItem)], ['PARTS', j.items.filter((i) => !isServiceItem(i))]]) {
    if (!list.length) continue;
    L.push(label);
    for (const it of list) {
      n += 1;
      const desc = it.description + (it.part_no ? ` (${it.part_no})` : '');
      const lines = wrap(desc, showPrices ? 43 : 61);
      L.push(showPrices
        ? pad(n, 4) + pad(lines[0], 44) + pad(Number(it.qty), 6, true) + pad(num(it.unit_price), 12, true) + pad(num(it.line_total), 14, true)
        : pad(n, 4) + pad(lines[0], 62) + pad(Number(it.qty), 6, true) + pad('[ ]', 8, true));
      lines.slice(1).forEach((l) => L.push('    ' + l));
    }
  }
  L.push(rule());
  if (showPrices && t) {
    const tot = (label, v) => L.push(pad('', 46) + pad(label, 20) + pad(v, 14, true));
    tot('Services', num(t.services_total));
    tot('Parts', num(t.parts_total));
    if (t.discount > 0) tot('Discount', `-${num(t.discount)}`);
    if (t.tax_amount > 0) tot(`Tax ${t.tax_rate}%`, num(t.tax_amount));
    L.push(pad('', 46) + '-'.repeat(34));
    tot('TOTAL (LKR)', num(t.total));
    if (doc === 'invoice' && inv?.paid_amount !== undefined) {
      tot('Paid', num(inv.paid_amount));
      tot('Balance', num(inv.total - inv.paid_amount));
    }
    L.push(rule());
  }
  if (doc === 'invoice' && j.bike.next_service_due_date) L.push(center(`Next service due: ${fmtDate(j.bike.next_service_due_date)}`));
  L.push('');
  L.push('');
  L.push(pad('..........................', 40) + pad('..........................', 40, true));
  L.push(pad('Customer signature', 40) + pad(doc === 'jobcard' ? 'Service advisor' : 'Authorised signature', 40, true));
  L.push('');
  if (shop.footer) L.push(center(shop.footer.slice(0, W)));
  return <pre className="dotmatrix">{L.join('\n')}</pre>;
}

/** On the job card: tells the customer to pay at the cashier (or shows it is paid) */
function PayNote({ j, thermal }) {
  if (!j.pay_upfront || !j.totals) return null;
  const due = j.payment_state === 'DUE';
  if (thermal) {
    return (
      <div className="r-paynote">
        {due ? <>PAY AT CASHIER<br /><span className="r-big">LKR {num(j.totals.balance)}</span></> : <>** PAID **</>}
      </div>
    );
  }
  return (
    <div className="paper-paynote">
      {due ? <>Please pay <b>{money(j.totals.balance)}</b> at the cashier. Work starts once the receipt is with the bike.</> : <b>PAID – thank you.</b>}
    </div>
  );
}
