// Print job card / invoice as A4, 80mm thermal receipt or dot-matrix
import { useEffect, useRef, useState } from 'react';

const FORMATS = [['a4', 'A4 page'], ['thermal', '80mm thermal'], ['dotmatrix', 'Dot-matrix']];

export default function PrintMenu({ jobId, hasInvoice }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const docs = [['jobcard', 'Job card'], ...(hasInvoice ? [['invoice', 'Invoice']] : [['estimate', 'Estimate']])];
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open}>🖨 Print ▾</button>
      {open && (
        <div className="menu" role="menu">
          {docs.map(([doc, label]) => (
            <div key={doc} className="menu-group">
              <div className="menu-head">{label}</div>
              {FORMATS.map(([fmt, fl]) => (
                <a key={fmt} role="menuitem" href={`/print/job/${jobId}?doc=${doc}&format=${fmt}`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>{fl}</a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
