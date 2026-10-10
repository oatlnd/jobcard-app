// Photo / receipt gallery with phone-camera capture. entityType: expense | grn | purchase_order | job_card | employee
import { useRef, useState } from 'react';
import { get, upload, del } from '../api.js';
import { compressImage } from '../lib.js';
import { ErrorBox, useAction, useLoad } from './ui.jsx';
import { ask } from './confirm.jsx';

export default function Attachments({ entityType, entityId, canEdit, initial }) {
  const list = useLoad(() => (initial && !entityId ? Promise.resolve([]) : get(`/attachments/${entityType}/${entityId}`)), [entityType, entityId]);
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const { busy, error, run } = useAction();
  const [view, setView] = useState(null);

  const onFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    run(async () => {
      const ready = await Promise.all(files.map((f) => compressImage(f)));
      list.setData(await upload(`/attachments/${entityType}/${entityId}`, ready));
    });
  };

  const items = list.data || [];
  return (
    <div className="attachments">
      <ErrorBox error={error || list.error} />
      <div className="thumbs">
        {items.map((a) => (
          <div key={a.id} className="thumb">
            {a.mime_type.startsWith('image/')
              ? <button className="thumb-img" onClick={() => setView(a)} title={a.original_name}><img src={a.url} alt={a.original_name || 'photo'} loading="lazy" /></button>
              : <a className="thumb-file" href={a.url} target="_blank" rel="noreferrer">PDF<br /><small>{a.original_name}</small></a>}
            {canEdit && (
              <button className="thumb-del" title="Remove" disabled={busy}
                onClick={async () => (await ask({ title: 'Remove this file?', message: a.original_name || '' })) && run(async () => {
                  await del(`/attachments/${entityType}/${entityId}/${a.id}`);
                  list.setData((d) => d.filter((x) => x.id !== a.id));
                })}>×</button>
            )}
          </div>
        ))}
        {items.length === 0 && !canEdit && <span className="muted small">No photos attached.</span>}
      </div>
      {canEdit && (
        <div className="row wrap">
          <button type="button" className="btn small" disabled={busy} onClick={() => camRef.current?.click()}>📷 Take photo</button>
          <button type="button" className="btn small ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Attach file</button>
          {busy && <span className="small muted">Uploading…</span>}
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {view && (
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={view.url} alt={view.original_name || 'photo'} />
          <a className="btn small" href={view.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open full size</a>
        </div>
      )}
    </div>
  );
}
