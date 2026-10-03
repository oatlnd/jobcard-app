// Type-ahead part search. onPick(part)
import { useEffect, useRef, useState } from 'react';
import { get } from '../api.js';
import { useDebounced } from './ui.jsx';

export default function PartSearch({ onPick, placeholder = 'Search part to add…', autoFocus }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const dq = useDebounced(q, 200);
  const ref = useRef(null);

  useEffect(() => {
    if (!dq.trim()) { setRows([]); return; }
    let live = true;
    get('/parts', { q: dq }).then((r) => live && setRows(r.slice(0, 12))).catch(() => {});
    return () => { live = false; };
  }, [dq]);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="part-search" ref={ref}>
      <input value={q} autoFocus={autoFocus} placeholder={placeholder} onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && rows.length > 0 && (
        <div className="ps-results">
          {rows.map((p) => (
            <button type="button" key={p.id} onClick={() => { onPick(p); setQ(''); setRows([]); setOpen(false); }}>
              <span><strong>{p.name}</strong> <small className="muted">{p.part_no}</small></span>
              <small className="muted">{p.stock_qty} {p.unit} in stock</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
