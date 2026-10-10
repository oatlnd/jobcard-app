// Create / edit a draft purchase order
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, post, put } from '../api.js';
import { ErrorBox, Field, Loading, useAction, useLoad } from '../components/ui.jsx';
import PartSearch from '../components/PartSearch.jsx';
import { SupplierForm } from './Suppliers.jsx';
import { money, todayIso } from '../lib.js';
import { ask } from '../components/confirm.jsx';

const emptyLine = () => ({ key: Math.random(), part_id: null, part_no: '', description: '', qty_ordered: 1, unit_cost: 0 });

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const suppliers = useLoad(() => get('/purchasing/suppliers'), []);
  const existing = useLoad(() => (id ? get(`/purchasing/purchase-orders/${id}`) : Promise.resolve(null)), [id]);
  const [f, setF] = useState({ supplier_id: '', order_date: todayIso(), expected_date: '', reference: '', payment_terms: '', delivery_to: '', notes: '', discount: 0, tax_amount: 0 });
  const [lines, setLines] = useState([]);
  const [newSupplier, setNewSupplier] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    const po = existing.data;
    if (!po) return;
    setF({
      supplier_id: po.supplier_id, order_date: po.order_date, expected_date: po.expected_date || '', reference: po.reference || '',
      payment_terms: po.payment_terms || '', delivery_to: po.delivery_to || '', notes: po.notes || '', discount: po.discount, tax_amount: po.tax_amount,
    });
    setLines(po.items.map((i) => ({ ...i, key: i.id })));
  }, [existing.data]);

  const addReorder = () => run(async () => {
    const rows = await get('/purchasing/reorder-suggestions');
    setLines((cur) => {
      const have = new Set(cur.map((l) => l.part_id));
      return [...cur, ...rows.filter((r) => !have.has(r.part_id)).map((r) => ({
        key: Math.random(), part_id: r.part_id, part_no: r.part_no, description: r.name, qty_ordered: r.suggested_qty, unit_cost: r.cost_price,
      }))];
    });
  });

  useEffect(() => { if (!id && sp.get('reorder') === '1') addReorder(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (key, k, v) => setLines(lines.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const pickPart = (p) => setLines((cur) => {
    const found = cur.find((l) => l.part_id === p.id);
    if (found) return cur.map((l) => (l.part_id === p.id ? { ...l, qty_ordered: Number(l.qty_ordered) + 1 } : l));
    return [...cur, { key: Math.random(), part_id: p.id, part_no: p.part_no, description: p.name, qty_ordered: 1, unit_cost: p.cost_price || 0 }];
  });
  const subtotal = lines.reduce((s, l) => s + Number(l.qty_ordered || 0) * Number(l.unit_cost || 0), 0);
  const total = subtotal - Number(f.discount || 0) + Number(f.tax_amount || 0);
  const x = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const body = {
        ...f, supplier_id: Number(f.supplier_id), discount: Number(f.discount) || 0, tax_amount: Number(f.tax_amount) || 0,
        items: lines.filter((l) => l.description.trim()).map((l) => ({ part_id: l.part_id, description: l.description, qty_ordered: Number(l.qty_ordered), unit_cost: Number(l.unit_cost) || 0 })),
      };
      const po = id ? await put(`/purchasing/purchase-orders/${id}`, body) : await post('/purchasing/purchase-orders', body);
      nav(`/purchase-orders/${po.id}`);
    });
  };

  if (id && existing.loading) return <Loading />;
  return (
    <div className="page">
      <div className="page-head"><h1>{id ? `Edit ${existing.data?.po_no}` : 'New purchase order'}</h1></div>
      <form onSubmit={save}>
        <div className="card">
          <div className="grid3">
            <Field label="Supplier *">
              <div className="row">
                <select value={f.supplier_id} onChange={(e) => {
                  const s = suppliers.data?.find((x2) => x2.id === Number(e.target.value));
                  setF({ ...f, supplier_id: e.target.value, payment_terms: f.payment_terms || s?.payment_terms || '' });
                }} required>
                  <option value="">Select supplier</option>
                  {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" className="btn small ghost" onClick={() => setNewSupplier(true)} title="New supplier">+</button>
              </div>
            </Field>
            <Field label="Order date"><input type="date" value={f.order_date} onChange={x('order_date')} /></Field>
            <Field label="Expected delivery"><input type="date" value={f.expected_date} onChange={x('expected_date')} /></Field>
            <Field label="Supplier quote / reference"><input value={f.reference} onChange={x('reference')} /></Field>
            <Field label="Payment terms"><input value={f.payment_terms} onChange={x('payment_terms')} /></Field>
            <Field label="Deliver to"><input value={f.delivery_to} onChange={x('delivery_to')} placeholder="Workshop" /></Field>
            <Field label="Notes / instructions" wide><input value={f.notes} onChange={x('notes')} /></Field>
          </div>
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Items</h2>
            <div className="row wrap">
              <button type="button" className="btn small ghost" onClick={addReorder} disabled={busy}>+ Add all low-stock parts</button>
              <button type="button" className="btn small ghost" onClick={() => setLines([...lines, emptyLine()])}>+ Non-stock line</button>
            </div>
          </div>
          <PartSearch onPick={pickPart} />
          <div className="table-wrap flat" style={{ marginTop: 10 }}>
            <table className="table compact">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Total</th><th /></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      {l.part_id ? <>{l.description}<div className="small muted">{l.part_no}</div></>
                        : <input placeholder="Description" value={l.description} onChange={(e) => setLine(l.key, 'description', e.target.value)} />}
                    </td>
                    <td className="num"><input type="number" min="0.01" step="any" className="cell-input" style={{ width: 80 }} value={l.qty_ordered} onChange={(e) => setLine(l.key, 'qty_ordered', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="any" className="cell-input" style={{ width: 110 }} value={l.unit_cost} onChange={(e) => setLine(l.key, 'unit_cost', e.target.value)} /></td>
                    <td className="num">{money(Number(l.qty_ordered) * Number(l.unit_cost))}</td>
                    <td className="num"><button type="button" className="icon-btn" onClick={async () => (await ask({ title: `Remove “${l.description || 'this line'}”?` })) && setLines(lines.filter((x2) => x2.key !== l.key))}>×</button></td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan="5" className="muted center">Search above to add parts.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="totals">
            <span>Subtotal</span><span>{money(subtotal)}</span>
            <span>Discount</span><span><input type="number" min="0" className="small-input" value={f.discount} onChange={x('discount')} /></span>
            <span>Tax</span><span><input type="number" min="0" className="small-input" value={f.tax_amount} onChange={x('tax_amount')} /></span>
            <strong>Total</strong><strong>{money(total)}</strong>
          </div>
        </div>
        <ErrorBox error={error || suppliers.error} />
        <div className="actions-bar">
          <button className="btn primary" disabled={busy || !lines.length || !f.supplier_id}>{busy ? 'Saving…' : 'Save draft'}</button>
          <span className="small muted">You can review and print the PO, then mark it as ordered.</span>
        </div>
      </form>
      {newSupplier && <SupplierForm s={{}} onClose={() => setNewSupplier(false)} onSaved={(s) => { setNewSupplier(false); suppliers.reload({ quiet: true }).then(() => setF((cur) => ({ ...cur, supplier_id: s.id, payment_terms: cur.payment_terms || s.payment_terms || '' }))); }} />}
    </div>
  );
}
