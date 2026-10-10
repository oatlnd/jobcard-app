import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, post, patch } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../socket.js';
import { ErrorBox, Field, Loading, Empty, Modal, useAction, useLoad, useDebounced } from '../components/ui.jsx';
import { money } from '../lib.js';
import { ask } from '../components/confirm.jsx';
import { useSort } from '../components/sort.jsx';

const PART_SORT = { no: 'part_no', name: 'name', cat: 'category', cost: (p) => Number(p.cost_price), price: (p) => Number(p.unit_price), stock: (p) => Number(p.stock_qty) };

export default function Parts() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const low = sp.get('low') === '1';
  const dq = useDebounced(q);
  const parts = useLoad(() => get('/parts', { q: dq, category, low: low ? '1' : undefined }), [dq, category, low]);
  const cats = useLoad(() => get('/parts/categories'), []);
  const units = useLoad(() => get('/masters/lookups', { type: 'unit' }), []);
  const { sorted: partRows, Th } = useSort(parts.data, 'parts', PART_SORT);
  const [editing, setEditing] = useState(null);
  const [stock, setStock] = useState(null);
  const canEdit = can('parts.manage');
  const showCost = can('parts.manage', 'purchasing.view');
  const showPrice = can('parts.manage', 'jobs.pricing');

  useLive('parts:changed', () => parts.reload({ quiet: true }));

  const stockValue = (parts.data || []).reduce((s, p) => s + (p.cost_price || 0) * p.stock_qty, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Parts & stock</h1><p className="muted">Stock goes down when parts are added to a job card and up when goods are received (GRN).</p></div>
        <div className="row wrap">
          {can('purchasing.manage') && <Link className="btn ghost" to="/purchase-orders/new?reorder=1">Order low stock</Link>}
          {canEdit && <button className="btn primary" onClick={() => setEditing({})}>+ New part</button>}
        </div>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search part name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {(cats.data || []).map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="toggle"><input type="checkbox" checked={low} onChange={(e) => setSp(e.target.checked ? { low: '1' } : {})} /> Low stock only</label>
        {showCost && parts.data && <span className="muted small" style={{ marginLeft: 'auto' }}>Stock value at cost: <b>{money(stockValue)}</b></span>}
      </div>
      <ErrorBox error={parts.error} />
      {parts.loading && !parts.data ? <Loading /> : parts.data?.length === 0 ? <Empty>No parts found.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th k="no">Part no.</Th><Th k="name">Name</Th><Th k="cat">Category</Th>
                {showCost && <Th k="cost" className="num">Cost</Th>}{showPrice && <Th k="price" className="num">Selling price</Th>}
                <Th k="stock" className="num">In stock</Th>{(canEdit || can('stock.adjust')) && <th />}
              </tr>
            </thead>
            <tbody>
              {partRows.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.part_no}</td>
                  <td>{p.name}{(p.brand || p.location) && <div className="small muted">{[p.brand, p.location && `Rack ${p.location}`].filter(Boolean).join(' · ')}</div>}</td>
                  <td>{p.category}</td>
                  {showCost && <td className="num">{money(p.cost_price)}</td>}
                  {showPrice && <td className="num">{money(p.unit_price)}</td>}
                  <td className={`num ${p.stock_qty <= p.reorder_level ? 'late-text' : ''}`}><b>{p.stock_qty}</b> <small className="muted">{p.unit} / min {p.reorder_level}</small></td>
                  {(canEdit || can('stock.adjust')) && <td className="num nowrap">
                    {can('stock.adjust') && <button className="btn small ghost" onClick={() => setStock(p)}>Adjust</button>}
                    {canEdit && <button className="btn small ghost" onClick={() => setEditing(p)}>Edit</button>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PartForm part={editing} cats={cats.data || []} units={(units.data || []).map((u) => u.name)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); parts.reload({ quiet: true }); }} />}
      {stock && <StockForm part={stock} onClose={() => setStock(null)} onSaved={() => { setStock(null); parts.reload({ quiet: true }); }} />}
    </div>
  );
}

function PartForm({ part, cats, units, onClose, onSaved }) {
  const isNew = !part.id;
  const [f, setF] = useState({
    part_no: part.part_no || '', name: part.name || '', category: part.category || cats[0] || 'General', unit: part.unit || 'Nos',
    brand: part.brand || '', location: part.location || '',
    unit_price: part.unit_price ?? '', cost_price: part.cost_price ?? 0, stock_qty: part.stock_qty ?? 0, reorder_level: part.reorder_level ?? 0,
  });
  const { busy, error, run } = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const margin = Number(f.unit_price) && Number(f.cost_price) ? Math.round(((f.unit_price - f.cost_price) / f.unit_price) * 100) : null;
  const save = () => run(async () => {
    const body = { ...f, unit_price: Number(f.unit_price), cost_price: Number(f.cost_price) || 0, stock_qty: Number(f.stock_qty), reorder_level: Number(f.reorder_level) };
    if (isNew) await post('/parts', body); else { delete body.stock_qty; await patch(`/parts/${part.id}`, body); }
    onSaved();
  });
  return (
    <Modal title={isNew ? 'New part' : `Edit ${part.part_no}`} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={async () => (await ask({ title: `Remove “${part.name}” from the parts list?`, message: 'It is hidden, not deleted – old job cards keep it.' })) && run(async () => { await patch(`/parts/${part.id}`, { active: false }); onSaved(); })}>Remove</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Part number"><input value={f.part_no} onChange={s('part_no')} /></Field>
        <Field label="Category"><select value={f.category} onChange={s('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Name" wide><input value={f.name} onChange={s('name')} /></Field>
        <Field label="Brand"><input value={f.brand} onChange={s('brand')} placeholder="e.g. Honda Genuine" /></Field>
        <Field label="Rack / bin"><input value={f.location} onChange={s('location')} /></Field>
        <Field label="Cost price (LKR)" hint="Updated automatically from GRNs"><input type="number" min="0" value={f.cost_price} onChange={s('cost_price')} /></Field>
        <Field label="Selling price (LKR)" hint={margin !== null ? `Margin ${margin}%` : undefined}><input type="number" min="0" value={f.unit_price} onChange={s('unit_price')} /></Field>
        <Field label="Unit"><select value={f.unit} onChange={s('unit')}>{[...new Set([f.unit, ...units])].map((u) => <option key={u}>{u}</option>)}</select></Field>
        {isNew && <Field label="Opening stock"><input type="number" min="0" value={f.stock_qty} onChange={s('stock_qty')} /></Field>}
        <Field label="Reorder level" hint="Flag as low stock at or below this"><input type="number" min="0" value={f.reorder_level} onChange={s('reorder_level')} /></Field>
      </div>
    </Modal>
  );
}

function StockForm({ part, onClose, onSaved }) {
  const [delta, setDelta] = useState('');
  const [mode, setMode] = useState('out');
  const { busy, error, run } = useAction();
  return (
    <Modal title={`Adjust stock · ${part.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !Number(delta)} onClick={() => run(async () => {
          await post(`/parts/${part.id}/stock`, { delta: mode === 'in' ? Number(delta) : -Number(delta) }); onSaved();
        })}>Save</button></>}>
      <ErrorBox error={error} />
      <p>Current stock: <b>{part.stock_qty} {part.unit}</b></p>
      <p className="small muted">For stock bought from a supplier use a GRN instead, so cost and supplier are recorded.</p>
      <div className="grid2">
        <Field label="Adjustment"><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="out">Write off / damaged (−)</option><option value="in">Found / stock count correction (+)</option></select></Field>
        <Field label="Quantity"><input type="number" min="1" autoFocus value={delta} onChange={(e) => setDelta(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
