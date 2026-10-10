// Receive goods against a purchase order (?po=ID) or directly from a supplier
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { ErrorBox, Field, Loading, useAction, useLoad } from '../components/ui.jsx';
import PartSearch from '../components/PartSearch.jsx';
import { money, todayIso } from '../lib.js';
import { ask } from '../components/confirm.jsx';

export default function GrnForm() {
  const [sp] = useSearchParams();
  const poId = sp.get('po');
  const nav = useNavigate();
  const po = useLoad(() => (poId ? get(`/purchasing/purchase-orders/${poId}`) : Promise.resolve(null)), [poId]);
  const suppliers = useLoad(() => get('/purchasing/suppliers'), []);
  const [f, setF] = useState({
    supplier_id: '', received_date: todayIso(), supplier_invoice_no: '', supplier_invoice_date: '', delivery_note_no: '', vehicle_no: '',
    notes: '', discount: 0, tax_amount: 0, update_cost: true,
  });
  const [lines, setLines] = useState([]);
  const { busy, error, run } = useAction();

  useEffect(() => {
    const p = po.data;
    if (!p) return;
    setF((cur) => ({ ...cur, supplier_id: p.supplier_id }));
    setLines(p.items.filter((i) => i.qty_received < i.qty_ordered).map((i) => ({
      key: i.id, po_item_id: i.id, part_id: i.part_id, part_no: i.part_no, description: i.description,
      ordered: i.qty_ordered, already: i.qty_received, remaining: i.qty_ordered - i.qty_received,
      qty_received: i.qty_ordered - i.qty_received, qty_rejected: 0, unit_cost: i.unit_cost,
    })));
  }, [po.data]);

  const setLine = (key, k, v) => setLines(lines.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const pickPart = (p) => setLines((cur) => [...cur, { key: Math.random(), part_id: p.id, part_no: p.part_no, description: p.name, qty_received: 1, qty_rejected: 0, unit_cost: p.cost_price || 0 }]);
  const subtotal = lines.reduce((s, l) => s + Number(l.qty_received || 0) * Number(l.unit_cost || 0), 0);
  const total = subtotal - Number(f.discount || 0) + Number(f.tax_amount || 0);
  const x = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const overLine = lines.find((l) => l.remaining !== undefined && Number(l.qty_received) > l.remaining);

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const g = await post('/purchasing/grns', {
        ...f, po_id: poId ? Number(poId) : null, supplier_id: Number(f.supplier_id),
        discount: Number(f.discount) || 0, tax_amount: Number(f.tax_amount) || 0,
        items: lines.map((l) => ({
          po_item_id: l.po_item_id || null, part_id: l.part_id || null, description: l.description,
          qty_received: Number(l.qty_received) || 0, qty_rejected: Number(l.qty_rejected) || 0, unit_cost: Number(l.unit_cost) || 0,
        })),
      });
      nav(`/grns/${g.id}?new=1`);
    });
  };

  if (poId && po.loading) return <Loading />;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Receive goods</h1>
          {po.data && <p className="muted">Against <Link to={`/purchase-orders/${po.data.id}`}>{po.data.po_no}</Link> · {po.data.supplier.name}</p>}
        </div>
      </div>
      <form onSubmit={save}>
        <div className="card">
          <div className="grid3">
            <Field label="Supplier *">
              <select value={f.supplier_id} onChange={x('supplier_id')} disabled={!!poId} required>
                <option value="">Select supplier</option>
                {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Received date"><input type="date" value={f.received_date} onChange={x('received_date')} /></Field>
            <Field label="Supplier invoice no."><input value={f.supplier_invoice_no} onChange={x('supplier_invoice_no')} /></Field>
            <Field label="Supplier invoice date"><input type="date" value={f.supplier_invoice_date} onChange={x('supplier_invoice_date')} /></Field>
            <Field label="Delivery note no."><input value={f.delivery_note_no} onChange={x('delivery_note_no')} /></Field>
            <Field label="Vehicle no."><input value={f.vehicle_no} onChange={x('vehicle_no')} /></Field>
            <Field label="Notes" wide><input value={f.notes} onChange={x('notes')} placeholder="e.g. 2 boxes damaged, returned" /></Field>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Items received</h2>
          {!poId && <PartSearch onPick={pickPart} />}
          {poId && lines.length === 0 && <div className="alert info">Everything on this PO has already been received.</div>}
          <div className="table-wrap flat" style={{ marginTop: 10 }}>
            <table className="table compact">
              <thead>
                <tr><th>Item</th>{poId && <th className="num">Remaining</th>}<th className="num">Received (accepted)</th><th className="num">Rejected</th><th className="num">Unit cost</th><th className="num">Value</th>{!poId && <th />}</tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>{l.description}<div className="small muted">{l.part_no || 'Non-stock item'}</div></td>
                    {poId && <td className="num">{l.remaining}</td>}
                    <td className="num"><input type="number" min="0" step="any" className={`cell-input${l.remaining !== undefined && Number(l.qty_received) > l.remaining ? ' bad' : ''}`} style={{ width: 80 }} value={l.qty_received} onChange={(e) => setLine(l.key, 'qty_received', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="any" className="cell-input" style={{ width: 70 }} value={l.qty_rejected} onChange={(e) => setLine(l.key, 'qty_rejected', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="any" className="cell-input" style={{ width: 100 }} value={l.unit_cost} onChange={(e) => setLine(l.key, 'unit_cost', e.target.value)} /></td>
                    <td className="num">{money(Number(l.qty_received) * Number(l.unit_cost))}</td>
                    {!poId && <td className="num"><button type="button" className="icon-btn" onClick={async () => (await ask({ title: `Remove “${l.description || 'this line'}”?` })) && setLines(lines.filter((x2) => x2.key !== l.key))}>×</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overLine && <div className="alert warn">{overLine.description}: you entered more than the remaining quantity on the PO.</div>}
          <div className="row between wrap" style={{ marginTop: 10 }}>
            <label className="toggle"><input type="checkbox" checked={f.update_cost} onChange={x('update_cost')} /> Update parts' cost price from this GRN</label>
            <div className="totals" style={{ margin: 0 }}>
              <span>Subtotal</span><span>{money(subtotal)}</span>
              <span>Discount</span><span><input type="number" min="0" className="small-input" value={f.discount} onChange={x('discount')} /></span>
              <span>Tax</span><span><input type="number" min="0" className="small-input" value={f.tax_amount} onChange={x('tax_amount')} /></span>
              <strong>Total</strong><strong>{money(total)}</strong>
            </div>
          </div>
        </div>
        <ErrorBox error={error || po.error} />
        <div className="actions-bar">
          <button className="btn primary" disabled={busy || !lines.length || !f.supplier_id || !!overLine}>{busy ? 'Saving…' : 'Save GRN & add to stock'}</button>
          <span className="small muted">You can attach a photo of the supplier invoice on the next screen.</span>
        </div>
      </form>
    </div>
  );
}
