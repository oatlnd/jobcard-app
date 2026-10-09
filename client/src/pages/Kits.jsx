// Admin: service kits, the oil chart (bike groups) and the bike model list.
import { useEffect, useMemo, useState } from 'react';
import { get, post, put, del } from '../api.js';
import { ErrorBox, Field, Loading, Tabs, useAction, useLoad } from '../components/ui.jsx';
import { SERVICE_KINDS, VISIT, isFreeService, money } from '../lib.js';

export default function Kits() {
  const [tab, setTab] = useState('kits');
  const parts = useLoad(() => get('/parts'), []);
  const groups = useLoad(() => get('/kits/groups', { all: '1' }), []);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Kits & oil chart</h1>
          <p className="muted">Kits add labour, oil and parts to a job card with one tap. The oil chart decides which oil and filter each bike group gets.</p>
        </div>
      </div>
      <Tabs tabs={[['kits', '📦 Kits'], ['chart', '🛢 Oil chart'], ['models', '🏍 Bike models']]} value={tab} onChange={setTab} />
      <ErrorBox error={parts.error || groups.error} />
      {!parts.data || !groups.data ? <Loading /> : (
        <>
          {tab === 'kits' && <KitsTab parts={parts.data} />}
          {tab === 'chart' && <ChartTab parts={parts.data} groups={groups} />}
          {tab === 'models' && <ModelsTab groups={groups.data} onChanged={() => groups.reload({ quiet: true })} />}
        </>
      )}
    </div>
  );
}

function PartSelect({ parts, value, onChange, placeholder = 'Choose part', oilsFirst }) {
  const sorted = useMemo(() => {
    const list = [...parts].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    if (!oilsFirst) return list;
    return [...list.filter((p) => /oil/i.test(p.category || '') || /oil/i.test(p.name)), ...list.filter((p) => !(/oil/i.test(p.category || '') || /oil/i.test(p.name)))];
  }, [parts, oilsFirst]);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {sorted.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.part_no} · {money(p.unit_price)}</option>)}
    </select>
  );
}

// ---------------- Kits ----------------
const blankKit = () => ({ id: null, name: 'New kit', visit_types: ['PAID'], active: true, sort_order: 10, lines: [{ kind: 'labour', description: 'Labour', unit_price: 0 }] });

function KitsTab({ parts }) {
  const kits = useLoad(() => get('/kits', { all: '1' }), []);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const act = useAction();
  const list = kits.data || [];

  useEffect(() => {
    if (!kits.data) return;
    if (selId === 'new') return;
    const k = kits.data.find((x) => x.id === selId) || kits.data[0];
    if (k) { setSelId(k.id); setDraft(JSON.parse(JSON.stringify(k))); }
  }, [kits.data, selId]);

  if (kits.loading && !kits.data) return <Loading />;
  const sel = list.find((k) => k.id === selId);
  const free = draft && draft.visit_types.some(isFreeService);
  const setLine = (i, patch) => setDraft({ ...draft, lines: draft.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) });
  const move = (i, d) => { const ls = [...draft.lines]; const [x] = ls.splice(i, 1); ls.splice(i + d, 0, x); setDraft({ ...draft, lines: ls }); };

  const save = () => act.run(async () => {
    const body = {
      name: draft.name, visit_types: draft.visit_types, active: draft.active, sort_order: Number(draft.sort_order) || 0,
      lines: draft.lines.map((l) => ({ kind: l.kind, description: l.description, unit_price: Number(l.unit_price) || 0, part_id: l.part_id, qty: Number(l.qty) || 1 })),
    };
    const saved = draft.id ? await put(`/kits/${draft.id}`, body) : await post('/kits', body);
    setSelId(saved.id);
    await kits.reload({ quiet: true });
  });
  const remove = () => confirm(`Remove "${draft.name}"? If it was used on job cards it is switched off instead.`) && act.run(async () => {
    await del(`/kits/${draft.id}`);
    setSelId(null);
    await kits.reload({ quiet: true });
  });

  return (
    <div className="kits-layout">
      <div className="card">
        <h2 className="card-title">Kits</h2>
        <div className="kit-list">
          {list.map((k) => (
            <button key={k.id} className={`kit-list-item${k.id === selId ? ' on' : ''}${k.active ? '' : ' off'}`} onClick={() => setSelId(k.id)}>
              <span><b>{k.name}</b><br /><small className="muted">{k.visit_types.map((v) => VISIT[v]?.short).join(' · ')}{k.active ? '' : ' · off'}</small></span>
              <small className="muted">from {money(Math.min(...k.prices.map((p) => p.price)))}</small>
            </button>
          ))}
        </div>
        <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => { setSelId('new'); setDraft(blankKit()); }}>+ New kit</button>
      </div>

      {draft && (
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">{draft.id ? 'Edit kit' : 'New kit'}</h2>
            <label className="toggle"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Show as a tile</label>
          </div>
          <div className="grid2">
            <Field label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Order" hint="Smaller numbers show first"><input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} /></Field>
          </div>
          <div className="field-label">Show for these visit types</div>
          <div className="row wrap" style={{ marginBottom: 12 }}>
            {SERVICE_KINDS.map((v) => (
              <label key={v} className="toggle chip-check">
                <input type="checkbox" checked={draft.visit_types.includes(v)}
                  onChange={(e) => setDraft({ ...draft, visit_types: e.target.checked ? [...draft.visit_types, v] : draft.visit_types.filter((x) => x !== v) })} />
                {VISIT[v].icon} {VISIT[v].label}
              </label>
            ))}
          </div>

          <div className="table-wrap flat">
            <table className="table compact">
              <thead><tr><th>Line</th><th>What</th><th className="num">Price / qty</th><th /></tr></thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={i}>
                    <td><span className={`kit-tag t-${l.kind}`}>{{ labour: 'Labour', part: 'Part', oil: 'Oil', filter: 'Filter' }[l.kind]}</span></td>
                    <td>
                      {l.kind === 'labour' && <input value={l.description || ''} onChange={(e) => setLine(i, { description: e.target.value })} style={{ width: '100%' }} />}
                      {l.kind === 'part' && <PartSelect parts={parts} value={l.part_id} onChange={(v) => setLine(i, { part_id: v })} />}
                      {l.kind === 'oil' && <span className="muted">Engine oil – from the oil chart (depends on model)</span>}
                      {l.kind === 'filter' && <span className="muted">Oil filter / washer – from the oil chart</span>}
                    </td>
                    <td className="num">
                      {l.kind === 'labour' && (free ? <span title="Free service kits always have free labour"><b className="ok-text">FREE</b></span>
                        : <input type="number" min="0" className="small-input" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />)}
                      {l.kind === 'part' && <input type="number" min="1" className="small-input" value={l.qty || 1} onChange={(e) => setLine(i, { qty: e.target.value })} />}
                    </td>
                    <td className="nowrap">
                      <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
                      <button className="icon-btn" disabled={i === draft.lines.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
                      <button className="icon-btn" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, n) => n !== i) })} title="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn small ghost" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'labour', description: '', unit_price: 0 }] })}>+ Labour</button>
            <button className="btn small ghost" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'part', part_id: null, qty: 1 }] })}>+ Part</button>
            {!draft.lines.some((l) => l.kind === 'oil') && <button className="btn small ghost" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'oil' }] })}>+ Engine oil (by model)</button>}
            {!draft.lines.some((l) => l.kind === 'filter') && <button className="btn small ghost" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'filter' }] })}>+ Oil filter (by model)</button>}
          </div>

          {sel && draft.id && (
            <>
              <div className="field-label" style={{ marginTop: 14 }}>Price by bike group <span className="muted small">(saved version)</span></div>
              <div className="kit-preview">
                {sel.prices.map((p) => (
                  <span key={p.group_id}><b>{p.problems.length ? '—' : money(p.price)}</b>{p.group}{p.model ? <small className="muted"> · e.g. {p.model}</small> : null}
                    {p.problems.length > 0 && <small className="late-text"><br />{p.problems[0]}</small>}</span>
                ))}
              </div>
            </>
          )}
          {free && <div className="alert info" style={{ marginTop: 10 }}>Linked to a free service: labour is always FREE and the job goes on the Honda claim list.</div>}
          <p className="small muted">Saving changes the kit for new job cards only – job cards already made don’t change.</p>
          <ErrorBox error={act.error} />
          <div className="row">
            <button className="btn primary" disabled={act.busy} onClick={save}>{act.busy ? 'Saving…' : 'Save kit'}</button>
            {draft.id && <button className="btn ghost danger" disabled={act.busy} onClick={remove}>Remove</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Oil chart ----------------
function ChartTab({ parts, groups }) {
  const act = useAction();
  const [rows, setRows] = useState([]);
  useEffect(() => setRows((groups.data || []).map((g) => ({ ...g }))), [groups.data]);
  const set = (i, patch) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch, _dirty: true } : r)));
  const save = (r) => act.run(async () => {
    const body = { name: r.name, oil_part_id: r.oil_part_id, oil_qty: Number(r.oil_qty) || 1, filter_part_id: r.filter_part_id, sort_order: Number(r.sort_order) || 0, active: r.active !== false };
    if (r.id) await put(`/kits/groups/${r.id}`, body); else await post('/kits/groups', body);
    await groups.reload({ quiet: true });
  });
  return (
    <div className="card">
      <p className="small muted">Pick the oil <b>bottle</b> (from Parts & stock) and how many bottles each group needs. Stock goes down by that number when a kit is used.</p>
      <div className="table-wrap flat">
        <table className="table compact">
          <thead><tr><th>Group</th><th>Models</th><th>Engine oil</th><th className="num">Bottles</th><th>Oil filter / washer</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || `n${i}`}>
                <td><input value={r.name} onChange={(e) => set(i, { name: e.target.value })} style={{ width: 150 }} /></td>
                <td className="small">{(r.models || []).join(', ') || <em className="muted">none – assign on Bike models</em>}</td>
                <td><PartSelect parts={parts} oilsFirst value={r.oil_part_id} placeholder="— choose oil —" onChange={(v) => set(i, { oil_part_id: v })} /></td>
                <td className="num"><input type="number" min="1" className="small-input" value={r.oil_qty} onChange={(e) => set(i, { oil_qty: e.target.value })} /></td>
                <td><PartSelect parts={parts} value={r.filter_part_id} placeholder="None" onChange={(v) => set(i, { filter_part_id: v })} /></td>
                <td><button className={`btn small${r._dirty ? ' primary' : ''}`} disabled={act.busy || !r._dirty} onClick={() => save(r)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorBox error={act.error} />
      <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => setRows([...rows, { name: 'New group', oil_qty: 1, models: [], _dirty: true }])}>+ Add group</button>
    </div>
  );
}

// ---------------- Bike models ----------------
function ModelsTab({ groups, onChanged }) {
  const models = useLoad(() => get('/kits/models', { all: '1' }), []);
  const act = useAction();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  useEffect(() => setRows((models.data || []).map((m) => ({ ...m }))), [models.data]);
  const set = (id, patch) => setRows(rows.map((r) => (r._k === id || r.id === id ? { ...r, ...patch, _dirty: true } : r)));
  const save = (r) => act.run(async () => {
    const body = { name: r.name, group_id: r.group_id || null, sort_order: Number(r.sort_order) || 0, active: r.active !== false };
    if (r.id) await put(`/kits/models/${r.id}`, body); else await post('/kits/models', body);
    await models.reload({ quiet: true });
    onChanged();
  });
  if (!models.data) return <Loading />;
  const shown = rows.filter((r) => !filter || (filter === 'none' ? !r.group_id : String(r.group_id) === filter));
  return (
    <div className="card">
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All models</option>
          <option value="none">Not in a group (no oil chart)</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <span className="small muted">These names appear in the model dropdown on new job cards.</span>
      </div>
      <div className="table-wrap flat">
        <table className="table compact">
          <thead><tr><th>Model</th><th>Group (oil chart)</th><th>In dropdown</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id || r._k}>
                <td><input value={r.name} onChange={(e) => set(r.id || r._k, { name: e.target.value })} /></td>
                <td>
                  <select value={r.group_id || ''} onChange={(e) => set(r.id || r._k, { group_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">— none —</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={r.active !== false} onChange={(e) => set(r.id || r._k, { active: e.target.checked })} /></td>
                <td><button className={`btn small${r._dirty ? ' primary' : ''}`} disabled={act.busy || !r._dirty} onClick={() => save(r)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorBox error={act.error} />
      <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => setRows([...rows, { _k: `n${Date.now()}`, name: '', group_id: null, active: true, _dirty: true }])}>+ Add model</button>
    </div>
  );
}
