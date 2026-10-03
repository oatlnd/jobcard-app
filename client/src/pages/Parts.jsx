import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post, patch } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../socket.js';
import { ErrorBox, Field, Loading, Empty, Modal, useAction, useLoad, useDebounced } from '../components/ui.jsx';
import { money } from '../lib.js';

export default function Parts() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const low = sp.get('low') === '1';
  const dq = useDebounced(q);
  const parts = useLoad(() => get('/parts', { q: dq, category, low: low ? '1' : undefined }), [dq, category, low]);
  const cats = useLoad(() => get('/parts/categories'), []);
  const [editing, setEditing] = useState(null);
  const [stock, setStock] = useState(null);
  const canEdit = user.role !== 'mechanic';

  useLive('parts:changed', () => parts.reload({ quiet: true }));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Parts & stock</h1><p className="muted">Genuine parts catalogue. Stock goes down automatically when parts are added to a job card.</p></div>
        {canEdit && <button className="btn primary" onClick={() => setEditing({})}>+ New part</button>}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search part name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {(cats.data || []).map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="toggle"><input type="checkbox" checked={low} onChange={(e) => setSp(e.target.checked ? { low: '1' } : {})} /> Low stock only</label>
      </div>
      <ErrorBox error={parts.error} />
      {parts.loading && !parts.data ? <Loading /> : parts.data?.length === 0 ? <Empty>No parts found.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Part no.</th><th>Name</th><th>Category</th><th className="num">Price</th><th className="num">In stock</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {parts.data?.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.part_no}</td><td>{p.name}</td><td>{p.category}</td>
                  <td className="num">{money(p.unit_price)}</td>
                  <td className={`num ${p.stock_qty <= p.reorder_level ? 'late-text' : ''}`}><b>{p.stock_qty}</b> <small className="muted">/ min {p.reorder_level}</small></td>
                  {canEdit && <td className="num nowrap">
                    <button className="btn small ghost" onClick={() => setStock(p)}>Stock</button>
                    <button className="btn small ghost" onClick={() => setEditing(p)}>Edit</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PartForm part={editing} cats={cats.data || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); parts.reload({ quiet: true }); }} />}
      {stock && <StockForm part={stock} onClose={() => setStock(null)} onSaved={() => { setStock(null); parts.reload({ quiet: true }); }} />}
    </div>
  );
}

function PartForm({ part, cats, onClose, onSaved }) {
  const isNew = !part.id;
  const [f, setF] = useState({
    part_no: part.part_no || '', name: part.name || '', category: part.category || 'General',
    unit_price: part.unit_price ?? '', stock_qty: part.stock_qty ?? 0, reorder_level: part.reorder_level ?? 0,
  });
  const { busy, error, run } = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => run(async () => {
    const body = { ...f, unit_price: Number(f.unit_price), stock_qty: Number(f.stock_qty), reorder_level: Number(f.reorder_level) };
    if (isNew) await post('/parts', body); else { delete body.stock_qty; await patch(`/parts/${part.id}`, body); }
    onSaved();
  });
  return (
    <Modal title={isNew ? 'New part' : `Edit ${part.part_no}`} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Hide this part from the catalogue?') && run(async () => { await patch(`/parts/${part.id}`, { active: false }); onSaved(); })}>Remove</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Part number"><input value={f.part_no} onChange={s('part_no')} /></Field>
        <Field label="Category"><select value={f.category} onChange={s('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Name" wide><input value={f.name} onChange={s('name')} /></Field>
        <Field label="Price (LKR)"><input type="number" min="0" value={f.unit_price} onChange={s('unit_price')} /></Field>
        {isNew && <Field label="Opening stock"><input type="number" min="0" value={f.stock_qty} onChange={s('stock_qty')} /></Field>}
        <Field label="Reorder level" hint="Flag as low stock at or below this"><input type="number" min="0" value={f.reorder_level} onChange={s('reorder_level')} /></Field>
      </div>
    </Modal>
  );
}

function StockForm({ part, onClose, onSaved }) {
  const [delta, setDelta] = useState('');
  const [mode, setMode] = useState('in');
  const { busy, error, run } = useAction();
  return (
    <Modal title={`Stock · ${part.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !Number(delta)} onClick={() => run(async () => {
          await post(`/parts/${part.id}/stock`, { delta: mode === 'in' ? Number(delta) : -Number(delta) }); onSaved();
        })}>Save</button></>}>
      <ErrorBox error={error} />
      <p>Current stock: <b>{part.stock_qty}</b></p>
      <div className="grid2">
        <Field label="Action"><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="in">Received (+)</option><option value="out">Write off / correction (−)</option></select></Field>
        <Field label="Quantity"><input type="number" min="1" autoFocus value={delta} onChange={(e) => setDelta(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
