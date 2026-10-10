// Kit tiles: ready-made sets of lines for the chosen visit type, priced for this bike's model (oil chart).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Modal, useLoad } from './ui.jsx';
import { money } from '../lib.js';
import { ask } from './confirm.jsx';

export function KitTiles({ model, visitType, chosen = [], onToggle, busy }) {
  const { can } = useAuth();
  const showMoney = can('jobs.pricing') || can('payments.record');
  const res = useLoad(() => get('/kits', { tiles: '1', model, visit_type: visitType }), [model, visitType]);
  const kits = res.data?.kits || [];
  if (res.error) return <ErrorBox error={res.error} />;
  if (!res.data) return null;
  return (
    <div className="kit-tiles-wrap">
      <div className="kit-tiles-head small muted">
        Kits for this visit{model ? <> · {model}{res.data.group ? ` (${res.data.group.name})` : ''}</> : ' · choose the bike model to see prices'}
      </div>
      {kits.length === 0 && <p className="small muted">No kits for this visit type.{can('masters.manage') && <> <Link to="/kits">Set up kits</Link></>}</p>}
      <div className="kit-tiles">
        {kits.map((k) => {
          const on = chosen.includes(k.id);
          const blocked = k.problems.length > 0;
          return (
            <button type="button" key={k.id} disabled={busy || (blocked && !on)} title={blocked ? k.problems.join('; ') : k.items.map((i) => i.description).join(', ')}
              className={`kit-tile${on ? ' on' : ''}${blocked ? ' blocked' : ''}`} onClick={() => onToggle(k)}>
              <b>{on ? '✓ ' : '📦 '}{k.name}</b>
              {blocked ? <span className="late-text small">{k.problems[0]}</span> : showMoney && <span className="small">{money(k.price)}</span>}
            </button>
          );
        })}
      </div>
      {kits.some((k) => k.problems.length) && can('masters.manage') && <p className="small"><Link to="/kits">Fix the oil chart →</Link></p>}
    </div>
  );
}

/** Modal used on an existing job card: tap a kit to add its lines. */
export default function KitPicker({ job, onClose, onAdd, busy }) {
  const [err, setErr] = useState(null);
  const added = [...new Set(job.items.map((i) => i.kit_id).filter(Boolean))];
  return (
    <Modal title="Add a kit" onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      {!job.service_kind && <p className="small muted">Tip: set the visit type on the job card to see the right kits.</p>}
      <KitTiles model={job.bike.model} visitType={job.service_kind || ''} busy={busy} chosen={added}
        onToggle={async (k) => {
          setErr(null);
          if (added.includes(k.id) && !(await ask({ title: `${k.name} is already on this job card. Add it again?`, yes: 'Yes, add again', no: 'No', danger: false }))) return;
          try { await onAdd(k); } catch (e) { setErr(e); }
        }} />
      <ErrorBox error={err} />
    </Modal>
  );
}
