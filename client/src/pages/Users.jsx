import { useState } from 'react';
import { get, post, patch } from '../api.js';
import { ErrorBox, Field, Loading, Modal, useAction, useLoad } from '../components/ui.jsx';
import { fmtMobile } from '../lib.js';

const ROLE_HELP = {
  admin: 'Everything, including staff and settings',
  advisor: 'Opens job cards, invoices, payments, parts',
  mechanic: 'Sees the board, updates their jobs, adds parts used',
};

export default function Users() {
  const users = useLoad(() => get('/users'), []);
  const [editing, setEditing] = useState(null);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Staff</h1><p className="muted">Give each person their own login so the job history shows who did what.</p></div>
        <button className="btn primary" onClick={() => setEditing({})}>+ Add staff</button>
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
      {editing && <UserForm u={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); users.reload({ quiet: true }); }} />}
    </div>
  );
}

function UserForm({ u, onClose, onSaved }) {
  const isNew = !u.id;
  const [f, setF] = useState({ name: u.name || '', username: u.username || '', role: u.role || 'mechanic', mobile: u.mobile ? fmtMobile(u.mobile) : '', password: '', active: u.active ?? true });
  const { busy, error, run } = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = () => run(async () => {
    const body = { ...f };
    if (!body.password) delete body.password;
    if (isNew) { delete body.active; await post('/users', body); } else await patch(`/users/${u.id}`, body);
    onSaved();
  });
  return (
    <Modal title={isNew ? 'Add staff' : `Edit ${u.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Full name"><input value={f.name} onChange={s('name')} /></Field>
        <Field label="Username"><input value={f.username} onChange={s('username')} autoCapitalize="none" /></Field>
        <Field label="Role" hint={ROLE_HELP[f.role]}>
          <select value={f.role} onChange={s('role')}><option value="mechanic">Mechanic</option><option value="advisor">Service advisor</option><option value="admin">Admin</option></select>
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
