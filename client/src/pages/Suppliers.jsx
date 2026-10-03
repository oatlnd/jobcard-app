import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, put } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, Empty, Modal, useAction, useLoad } from '../components/ui.jsx';

export default function Suppliers() {
  const { can } = useAuth();
  const [all, setAll] = useState(false);
  const list = useLoad(() => get('/purchasing/suppliers', { all: all ? '1' : undefined }), [all]);
  const [edit, setEdit] = useState(null);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Suppliers</h1>
        {can('purchasing.manage') && <button className="btn primary" onClick={() => setEdit({})}>+ Add supplier</button>}
      </div>
      <div className="toolbar"><label className="toggle"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show inactive</label></div>
      <ErrorBox error={list.error} />
      {list.loading && !list.data ? <Loading /> : list.data?.length === 0 ? <Empty>No suppliers yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Terms</th><th className="num">Open POs</th><th /></tr></thead>
            <tbody>
              {list.data?.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'dim'}>
                  <td><strong>{s.name}</strong>{s.address && <div className="small muted">{s.address}</div>}</td>
                  <td>{s.contact_person || '—'}{s.email && <div className="small muted">{s.email}</div>}</td>
                  <td>{s.phone ? <a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a> : '—'}</td>
                  <td>{s.payment_terms || '—'}</td>
                  <td className="num">{s.open_pos ? <Link to={`/purchase-orders?supplier_id=${s.id}`}>{s.open_pos}</Link> : 0}</td>
                  <td className="num">{can('purchasing.manage') && <button className="btn small ghost" onClick={() => setEdit(s)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <SupplierForm s={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload({ quiet: true }); }} />}
    </div>
  );
}

export function SupplierForm({ s, onClose, onSaved }) {
  const [f, setF] = useState({
    name: s.name || '', contact_person: s.contact_person || '', phone: s.phone || '', email: s.email || '', address: s.address || '',
    tax_no: s.tax_no || '', payment_terms: s.payment_terms || '', notes: s.notes || '', active: s.active ?? true,
  });
  const { busy, error, run } = useAction();
  const x = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = () => run(async () => { const r = s.id ? await put(`/purchasing/suppliers/${s.id}`, f) : await post('/purchasing/suppliers', f); onSaved(r); });
  return (
    <Modal title={s.id ? `Edit ${s.name}` : 'New supplier'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.name.trim()} onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Supplier name" wide><input autoFocus value={f.name} onChange={x('name')} /></Field>
        <Field label="Contact person"><input value={f.contact_person} onChange={x('contact_person')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={x('phone')} /></Field>
        <Field label="Email"><input value={f.email} onChange={x('email')} /></Field>
        <Field label="Payment terms"><input value={f.payment_terms} onChange={x('payment_terms')} placeholder="e.g. Cash, 30 days credit" /></Field>
        <Field label="Address" wide><input value={f.address} onChange={x('address')} /></Field>
        <Field label="VAT / tax no."><input value={f.tax_no} onChange={x('tax_no')} /></Field>
        <Field label="Notes"><input value={f.notes} onChange={x('notes')} /></Field>
        {s.id && <label className="toggle"><input type="checkbox" checked={f.active} onChange={x('active')} /> Active</label>}
      </div>
    </Modal>
  );
}
