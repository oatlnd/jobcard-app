// Staff logins + roles & permissions matrix
import { useState } from 'react';
import { get, post, patch, put, del } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, Modal, Tabs, useAction, useLoad } from '../components/ui.jsx';
import { fmtMobile } from '../lib.js';

export default function Users() {
  const [tab, setTab] = useState('staff');
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Staff logins & roles</h1><p className="muted">Each person gets their own login. Their role decides which screens and actions they can use.</p></div>
      </div>
      <Tabs tabs={[['staff', 'Staff logins'], ['roles', 'Roles & permissions']]} value={tab} onChange={setTab} />
      {tab === 'staff' ? <Staff /> : <Roles />}
    </div>
  );
}

function Staff() {
  const users = useLoad(() => get('/users'), []);
  const roles = useLoad(() => get('/users/roles'), []);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setEditing({})}>+ Add staff login</button>
      </div>
      <ErrorBox error={users.error} />
      {users.loading && !users.data ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Mobile</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'dim'}>
                  <td>{u.name}</td><td className="mono">{u.username}</td>
                  <td><span className="chip">{u.role}</span></td><td>{fmtMobile(u.mobile)}</td>
                  <td>{u.active ? 'Active' : 'Disabled'}</td>
                  <td className="num"><button className="btn small ghost" onClick={() => setEditing(u)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && roles.data && <UserForm u={editing} roles={roles.data.roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); users.reload({ quiet: true }); }} />}
    </>
  );
}

function UserForm({ u, roles, onClose, onSaved }) {
  const isNew = !u.id;
  const [f, setF] = useState({
    name: u.name || '', username: u.username || '', role_id: u.role_id || roles.find((r) => r.name === 'Mechanic')?.id || roles[0]?.id,
    mobile: u.mobile ? fmtMobile(u.mobile) : '', password: '', active: u.active ?? true,
  });
  const { busy, error, run } = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const role = roles.find((r) => r.id === Number(f.role_id));
  const save = () => run(async () => {
    const body = { ...f, role_id: Number(f.role_id) };
    if (!body.password) delete body.password;
    if (isNew) { delete body.active; await post('/users', body); } else await patch(`/users/${u.id}`, body);
    onSaved();
  });
  return (
    <Modal title={isNew ? 'Add staff login' : `Edit ${u.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Full name"><input value={f.name} onChange={s('name')} /></Field>
        <Field label="Username"><input value={f.username} onChange={s('username')} autoCapitalize="none" /></Field>
        <Field label="Role" hint={role?.description}>
          <select value={f.role_id} onChange={s('role_id')}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </Field>
        <Field label="Mobile"><input value={f.mobile} onChange={s('mobile')} /></Field>
        <Field label={isNew ? 'Password' : 'New password'} hint={isNew ? 'At least 6 characters' : 'Leave blank to keep the current one'}>
          <input type="password" value={f.password} onChange={s('password')} autoComplete="new-password" />
        </Field>
        {!isNew && <label className="toggle"><input type="checkbox" checked={f.active} onChange={s('active')} /> Active (can sign in)</label>}
      </div>
    </Modal>
  );
}

function Roles() {
  const { user } = useAuth();
  const data = useLoad(() => get('/users/roles'), []);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const act = useAction();
  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} />;
  const { roles, groups } = data.data;
  const current = draft || roles.find((r) => r.id === sel) || roles[0];
  const pick = (r) => { setSel(r.id); setDraft(null); };
  const toggle = (perm) => {
    const base = draft || { ...current, permissions: [...current.permissions] };
    const has = base.permissions.includes(perm);
    setDraft({ ...base, permissions: has ? base.permissions.filter((p) => p !== perm) : [...base.permissions, perm] });
  };
  const toggleGroup = (items, on) => {
    const base = draft || { ...current, permissions: [...current.permissions] };
    const keys = items.map(([k]) => k);
    setDraft({ ...base, permissions: on ? [...new Set([...base.permissions, ...keys])] : base.permissions.filter((p) => !keys.includes(p)) });
  };
  const save = () => act.run(async () => {
    const body = { name: current.name, description: current.description, permissions: current.permissions };
    const saved = current.id ? await put(`/users/roles/${current.id}`, body) : await post('/users/roles', body);
    setDraft(null);
    setSel(saved.id);
    data.reload({ quiet: true });
  });
  const locked = current.is_system;

  return (
    <div className="roles-layout">
      <div className="card roles-list">
        <h2 className="card-title">Roles</h2>
        {roles.map((r) => (
          <button key={r.id} className={`role-item${current.id === r.id ? ' on' : ''}`} onClick={() => pick(r)}>
            <strong>{r.name}</strong>
            <small className="muted">{r.user_count} staff · {r.is_system ? 'all permissions' : `${r.permissions.length} permissions`}</small>
          </button>
        ))}
        <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setDraft({ id: null, name: 'New role', description: '', permissions: ['jobs.view'], is_system: false })}>+ New role</button>
      </div>
      <div className="card">
        <ErrorBox error={act.error} />
        <div className="grid2">
          <Field label="Role name"><input value={current.name} disabled={locked} onChange={(e) => setDraft({ ...current, name: e.target.value })} /></Field>
          <Field label="Description"><input value={current.description || ''} disabled={locked} onChange={(e) => setDraft({ ...current, description: e.target.value })} /></Field>
        </div>
        {locked && <div className="alert info">The Admin role always has every permission so you can't lock yourself out.</div>}
        {current.id === user.role_id && !locked && <div className="alert warn">This is your own role – removing "Manage staff logins" would lock you out of this page.</div>}
        <div className="perm-groups">
          {groups.map((g) => {
            const allOn = g.items.every(([k]) => current.permissions.includes(k));
            return (
              <fieldset key={g.group} className="perm-group">
                <legend>
                  {g.group}
                  {!locked && <button type="button" className="link small" onClick={() => toggleGroup(g.items, !allOn)}>{allOn ? 'none' : 'all'}</button>}
                </legend>
                {g.items.map(([k, label]) => (
                  <label key={k} className="toggle perm">
                    <input type="checkbox" checked={current.permissions.includes(k)} disabled={locked} onChange={() => toggle(k)} />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
        {!locked && (
          <div className="row wrap" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={act.busy || !draft} onClick={save}>{current.id ? 'Save changes' : 'Create role'}</button>
            {draft && <button className="btn ghost" onClick={() => setDraft(null)}>Discard</button>}
            {current.id && !draft && current.user_count === 0 && (
              <button className="btn ghost danger" style={{ marginLeft: 'auto' }} disabled={act.busy}
                onClick={() => confirm(`Delete role "${current.name}"?`) && act.run(async () => { await del(`/users/roles/${current.id}`); setSel(null); data.reload({ quiet: true }); })}>Delete role</button>
            )}
          </div>
        )}
        <p className="small muted" style={{ marginTop: 10 }}>Changes take effect the next time each person loads a page.</p>
      </div>
    </div>
  );
}
