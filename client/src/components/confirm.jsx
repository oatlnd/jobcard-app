// One consistent "Are you sure?" pop-up for every remove / delete / cancel.
//   if (await ask('Remove this file?')) { ... }
//   await ask({ title: 'Cancel job?', message: '...', yes: 'Yes, cancel job', danger: true })
// "No" is focused by default so pressing Enter never deletes by accident.
import { useEffect, useRef, useState } from 'react';

let show = null;

export function ask(opts) {
  const o = typeof opts === 'string' ? { title: opts } : opts;
  if (!show) return Promise.resolve(window.confirm(o.title)); // fallback before the host mounts
  return new Promise((resolve) => show({ danger: true, yes: 'Yes, remove', no: 'No, keep it', ...o, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  const noRef = useRef(null);
  useEffect(() => { show = setReq; return () => { show = null; }; }, []);
  useEffect(() => {
    if (!req) return;
    noRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!req) return null;
  function done(v) { req.resolve(v); setReq(null); }
  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-label={req.title}>
        <div className="modal-body">
          <h3 className="confirm-title">{req.title}</h3>
          {req.message && <p className="confirm-msg">{req.message}</p>}
          {req.danger && <p className="small muted">This can’t be undone.</p>}
        </div>
        <div className="modal-foot">
          <button ref={noRef} className="btn ghost" onClick={() => done(false)}>{req.no}</button>
          <button className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{req.yes}</button>
        </div>
      </div>
    </div>
  );
}
