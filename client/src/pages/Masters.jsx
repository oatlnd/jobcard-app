// Admin-maintained dropdown lists: service types (with default amount) and category lists
import { useState } from 'react';
import { get, post, put, del } from '../api.js';
import { ErrorBox, Field, Loading, Modal, Tabs, useAction, useLoad } from '../components/ui.jsx';
import { money } from '../lib.js';
import { ask } from '../components/confirm.jsx';
import { useSort } from '../components/sort.jsx';

const LIST_TABS = [
  ['service_types', 'Service types'],
  ['part_category', 'Part categories'],
  ['expense_category', 'Expense categories'],
  ['designation', 'Designations'],
  ['unit', 'Units'],
];

const ST_SORT = { order: (r) => Number(r.sort_order), name: 'name', price: (r) => Number(r.default_price), used: (r) => Number(r.used), status: (r) => (r.active ? 0 : 1) };

export default function Masters() {
  const [tab, setTab] = useState('service_types');
  return (
    <div className="page narrow">
      <div className="page-head">
        <div><h1>Lists & service types</h1><p className="muted">These are the dropdown values used across the app. Changes apply straight away.</p></div>
      </div>
      <Tabs tabs={LIST_TABS} value={tab} onChange={setTab} />
      {tab === 'service_types' ? <ServiceTypes /> : <Lookup type={tab} key={tab} label={LIST_TABS.find((t) => t[0] === tab)[1]} />}
    </div>
  );
}

function ServiceTypes() {
  const list = useLoad(() => get('/masters/service-types', { all: '1' }), []);
  const { sorted: stRows, Th } = useSort(list.data, 'servicetypes', ST_SORT);
  const [edit, setEdit] = useState(null);
  const act = useAction();
  return (
    <div className="card">
      <div className="card-title-row">
        <h2 className="card-title">Service types</h2>
        <button className="btn primary small" onClick={() => setEdit({ name: '', default_price: 0, sort_order: (list.data?.length || 0) + 1, active: true })}>+ Add service type</button>
      </div>
      <p className="small muted">The default amount is filled in when the service is added to a job card. Staff with pricing permission can change it per job.</p>
      <ErrorBox error={list.error || act.error} />
      {list.loading && !list.data ? <Loading /> : (
        <div className="table-wrap flat">
          <table className="table compact">
            <thead><tr><Th k="order">#</Th><Th k="name">Service</Th><Th k="price" className="num">Default amount</Th><Th k="used" className="num">Used</Th><Th k="status">Status</Th><th /></tr></thead>
            <tbody>
              {stRows.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'dim'}>
                  <td className="muted small">{s.sort_order}</td>
                  <td><strong>{s.name}</strong>{s.description && <div className="small muted">{s.description}</div>}</td>
                  <td className="num">{money(s.default_price)}</td>
                  <td className="num small">{s.used}</td>
                  <td>{s.active ? 'Active' : 'Hidden'}</td>
                  <td className="num nowrap">
                    <button className="btn small ghost" onClick={() => setEdit(s)}>Edit</button>
                    {s.active && <button className="btn small ghost danger" disabled={act.busy} onClick={async () => (await ask({ title: `Remove “${s.name}”?`, message: 'It is hidden if it was used before.' })) && act.run(async () => { await del(`/masters/service-types/${s.id}`); list.reload({ quiet: true }); })}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <ServiceTypeForm s={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload({ quiet: true }); }} />}
    </div>
  );
}

function ServiceTypeForm({ s, onClose, onSaved }) {
  const [f, setF] = useState({ name: s.name, description: s.description || '', default_price: s.default_price, sort_order: s.sort_order, active: s.active });
  const { busy, error, run } = useAction();
  const save = () => run(async () => {
    const body = { ...f, default_price: Number(f.default_price) || 0, sort_order: Number(f.sort_order) || 0 };
    if (s.id) await put(`/masters/service-types/${s.id}`, body); else await post('/masters/service-types', body);
    onSaved();
  });
  return (
    <Modal title={s.id ? `Edit ${s.name}` : 'New service type'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.name.trim()} onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Service name" wide><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Default amount (LKR)"><input type="number" min="0" value={f.default_price} onChange={(e) => setF({ ...f, default_price: e.target.value })} /></Field>
        <Field label="Order in list"><input type="number" min="0" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        <Field label="Description (optional)" wide><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="toggle"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Show in dropdowns</label>
      </div>
    </Modal>
  );
}

function Lookup({ type, label }) {
  const list = useLoad(() => get('/masters/lookups', { type, all: '1' }), [type]);
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null);
  const act = useAction();
  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    act.run(async () => { await post('/masters/lookups', { type, name: name.trim(), sort_order: (list.data?.length || 0) + 1 }); setName(''); list.reload({ quiet: true }); });
  };
  return (
    <div className="card">
      <h2 className="card-title">{label}</h2>
      <form className="row" onSubmit={add} style={{ marginBottom: 12 }}>
        <input placeholder={`New ${label.toLowerCase().replace(/s$/, '')}…`} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={act.busy || !name.trim()}>Add</button>
      </form>
      <ErrorBox error={list.error || act.error} />
      {list.loading && !list.data ? <Loading /> : (
        <ul className="lookup-list">
          {list.data?.map((l) => (
            <li key={l.id} className={l.active ? '' : 'dim'}>
              {edit?.id === l.id ? (
                <form className="row" style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); act.run(async () => { await put(`/masters/lookups/${l.id}`, { name: edit.name, sort_order: l.sort_order, active: l.active }); setEdit(null); list.reload({ quiet: true }); }); }}>
                  <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <button className="btn small primary">Save</button>
                  <button type="button" className="btn small ghost" onClick={() => setEdit(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span style={{ flex: 1 }}>{l.name}{!l.active && <small className="muted"> (hidden)</small>}</span>
                  <button className="btn small ghost" onClick={() => setEdit({ id: l.id, name: l.name })}>Rename</button>
                  <button className="btn small ghost" disabled={act.busy}
                    onClick={() => act.run(async () => { await put(`/masters/lookups/${l.id}`, { name: l.name, sort_order: l.sort_order, active: !l.active }); list.reload({ quiet: true }); })}>
                    {l.active ? 'Hide' : 'Show'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Renaming updates existing records too. Hidden values stay on old records but can't be picked for new ones.</p>
    </div>
  );
}
