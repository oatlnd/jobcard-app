// Multi-select pickers for services, parts and custom lines (used on New job card and Job detail)
import { useMemo, useState } from 'react';
import { get } from '../api.js';
import { Modal, useLoad, useDebounced } from './ui.jsx';
import { money } from '../lib.js';

export function ServicePicker({ existingIds = [], canPrice, onClose, onAdd, busy }) {
  const types = useLoad(() => get('/masters/service-types'), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState({}); // id -> price
  const list = useMemo(() => (types.data || []).filter((t) => t.name.toLowerCase().includes(q.toLowerCase())), [types.data, q]);
  const toggle = (t) => setSel((s) => {
    const n = { ...s };
    if (t.id in n) delete n[t.id]; else n[t.id] = t.default_price;
    return n;
  });
  const chosen = (types.data || []).filter((t) => t.id in sel);
  const add = () => onAdd(chosen.map((t) => ({
    item_type: 'service', service_type_id: t.id, description: t.name, qty: 1,
    unit_price: canPrice ? Number(sel[t.id]) || 0 : t.default_price,
  })));
  return (
    <Modal title="Add services" onClose={onClose}
      footer={<><span className="muted small" style={{ marginRight: 'auto' }}>{chosen.length} selected</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!chosen.length || busy} onClick={add}>Add {chosen.length || ''} service{chosen.length === 1 ? '' : 's'}</button></>}>
      <input className="search" autoFocus placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pick-list">
        {list.map((t) => {
          const already = existingIds.includes(t.id);
          const on = t.id in sel;
          return (
            <div key={t.id} className={`pick-row${on ? ' on' : ''}${already ? ' dim' : ''}`}>
              <label className="pick-check">
                <input type="checkbox" checked={on || already} disabled={already} onChange={() => toggle(t)} />
                <span><strong>{t.name}</strong>{already && <small className="muted"> · already added</small>}</span>
              </label>
              {canPrice && on
                ? <input type="number" min="0" className="price-input" value={sel[t.id]} onChange={(e) => setSel({ ...sel, [t.id]: e.target.value })} aria-label={`${t.name} amount`} />
                : canPrice && <span className="small muted">{money(t.default_price)}</span>}
            </div>
          );
        })}
        {types.data && list.length === 0 && <p className="muted">No matching services. Admin can add them under Lists & service types.</p>}
      </div>
    </Modal>
  );
}

export function PartPicker({ canPrice, onClose, onAdd, busy }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const parts = useLoad(() => get('/parts', { q: dq }), [dq]);
  const [sel, setSel] = useState({}); // id -> { part, qty, price }
  const toggle = (p) => setSel((s) => {
    const n = { ...s };
    if (p.id in n) delete n[p.id]; else n[p.id] = { part: p, qty: 1, price: p.unit_price };
    return n;
  });
  const chosen = Object.values(sel);
  const invalid = chosen.some((c) => !(Number(c.qty) >= 1) || Number(c.qty) > c.part.stock_qty);
  const add = () => onAdd(chosen.map((c) => ({
    item_type: 'part', part_id: c.part.id, description: c.part.name, part_no: c.part.part_no, qty: Number(c.qty),
    ...(canPrice ? { unit_price: Number(c.price) || 0 } : {}),
  })));
  return (
    <Modal title="Add parts" onClose={onClose}
      footer={<><span className="muted small" style={{ marginRight: 'auto' }}>{chosen.length} selected</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!chosen.length || invalid || busy} onClick={add}>Add {chosen.length || ''} part{chosen.length === 1 ? '' : 's'}</button></>}>
      <input className="search" autoFocus placeholder="Search part name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pick-list">
        {(parts.data || []).map((p) => {
          const on = p.id in sel;
          const out = p.stock_qty <= 0;
          return (
            <div key={p.id} className={`pick-row${on ? ' on' : ''}${out ? ' dim' : ''}`}>
              <label className="pick-check">
                <input type="checkbox" checked={on} disabled={out && !on} onChange={() => toggle(p)} />
                <span><strong>{p.name}</strong><small className="muted"> {p.part_no} · {p.category}</small><br />
                  <small className={p.stock_qty <= p.reorder_level ? 'late-text' : 'muted'}>{p.stock_qty} {p.unit} in stock</small>
                  {canPrice && <small className="muted"> · {money(p.unit_price)}</small>}</span>
              </label>
              {on && (
                <div className="row">
                  <input type="number" min="1" max={p.stock_qty} className="qty-input" value={sel[p.id].qty} aria-label="Quantity"
                    onChange={(e) => setSel({ ...sel, [p.id]: { ...sel[p.id], qty: e.target.value } })} />
                  {canPrice && <input type="number" min="0" className="price-input" value={sel[p.id].price} aria-label="Unit price"
                    onChange={(e) => setSel({ ...sel, [p.id]: { ...sel[p.id], price: e.target.value } })} />}
                </div>
              )}
            </div>
          );
        })}
        {parts.data?.length === 0 && <p className="muted">No parts found.</p>}
      </div>
    </Modal>
  );
}

const blank = (type) => ({ item_type: type, description: '', qty: 1, unit_price: '' });

export function CustomPicker({ canPrice, onClose, onAdd, busy, defaultType = 'custom_service' }) {
  const [rows, setRows] = useState([blank(defaultType)]);
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const valid = rows.filter((r) => r.description.trim());
  const add = () => onAdd(valid.map((r) => ({ ...r, description: r.description.trim(), qty: Number(r.qty) || 1, unit_price: canPrice ? Number(r.unit_price) || 0 : 0 })));
  return (
    <Modal title="Add custom service / part" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!valid.length || busy} onClick={add}>Add {valid.length || ''} line{valid.length === 1 ? '' : 's'}</button></>}>
      <p className="small muted">For work or parts that are not in the lists, e.g. outside lathe work or a part the customer brought.</p>
      <div className="custom-rows">
        {rows.map((r, i) => (
          <div key={i} className="custom-row">
            <select value={r.item_type} onChange={(e) => set(i, 'item_type', e.target.value)} aria-label="Type">
              <option value="custom_service">Service</option>
              <option value="custom_part">Part</option>
            </select>
            <input placeholder="Description" value={r.description} autoFocus={i === rows.length - 1} onChange={(e) => set(i, 'description', e.target.value)} />
            <input type="number" min="0.25" step="0.25" className="qty-input" value={r.qty} onChange={(e) => set(i, 'qty', e.target.value)} aria-label="Quantity" />
            {canPrice && <input type="number" min="0" className="price-input" placeholder="Amount" value={r.unit_price} onChange={(e) => set(i, 'unit_price', e.target.value)} aria-label="Amount" />}
            <button className="icon-btn" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blank(defaultType)])} aria-label="Remove line">×</button>
          </div>
        ))}
      </div>
      <button className="btn small ghost" onClick={() => setRows([...rows, blank(rows[rows.length - 1]?.item_type || defaultType)])}>+ Another line</button>
    </Modal>
  );
}
