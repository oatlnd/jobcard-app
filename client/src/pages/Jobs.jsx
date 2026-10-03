// Job card list: key information at a glance, change job / delivery status right in the list
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../socket.js';
import { DeliveryBadge, ErrorBox, Loading, Empty, StatusBadge, useAction, useLoad, useDebounced } from '../components/ui.jsx';
import {
  STATUSES, STATUS_LABEL, DELIVERY_STATUSES, DELIVERY_LABEL, allowedStatuses, allowedDelivery, actionLabel, DELIVERY_ACTION,
  fmtReg, fmtMobile, fmtDateTime, money, timeAgo,
} from '../lib.js';

export default function Jobs() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [delivery, setDelivery] = useState('');
  const [mechanic, setMechanic] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const dq = useDebounced(q);
  const list = useLoad(() => get('/jobs', { q: dq, status, delivery, mechanic_id: mechanic, open: openOnly ? '1' : undefined }), [dq, status, delivery, mechanic, openOnly]);
  const users = useLoad(() => get('/users'), []);
  const act = useAction();
  const [flash, setFlash] = useState(null);

  useLive('job:changed', () => list.reload({ quiet: true }));

  const changeStatus = (job, to) => {
    let note;
    if (to === 'CANCELLED' || to === 'WAITING_PARTS' || (to === 'IN_PROGRESS' && ['QA_CHECK', 'COMPLETED'].includes(job.status))) {
      note = window.prompt(to === 'CANCELLED' ? 'Reason for cancelling?' : to === 'WAITING_PARTS' ? 'Which parts are we waiting for?' : 'What needs fixing?');
      if (note === null) return;
    }
    act.run(async () => {
      await post(`/jobs/${job.id}/status`, { status: to, note });
      setFlash(`${job.job_no} → ${STATUS_LABEL[to]}`);
      list.reload({ quiet: true });
    });
  };
  const changeDelivery = (job, to) => {
    let deliveredTo;
    if (to === 'DELIVERED') {
      deliveredTo = window.prompt('Handed over to (name)?', job.customer_name);
      if (deliveredTo === null) return;
    }
    act.run(async () => {
      await post(`/jobs/${job.id}/delivery`, { delivery_status: to, delivered_to: deliveredTo });
      setFlash(`${job.job_no} → ${DELIVERY_LABEL[to]}`);
      list.reload({ quiet: true });
    });
  };

  const showMoney = can('jobs.pricing');
  const workers = (users.data || []).filter((u) => u.can_work);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Job cards</h1><p className="muted">Change job or delivery status straight from the list.</p></div>
        {can('jobs.create') && <Link className="btn primary" to="/jobs/new">+ New job card</Link>}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search job no, customer, mobile or bike number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Job status">
          <option value="">All job statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={delivery} onChange={(e) => setDelivery(e.target.value)} aria-label="Delivery status">
          <option value="">All delivery</option>
          {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{DELIVERY_LABEL[s]}</option>)}
        </select>
        {can('jobs.view_all') && (
          <select value={mechanic} onChange={(e) => setMechanic(e.target.value)} aria-label="Mechanic">
            <option value="">Everyone</option>
            {workers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <label className="toggle"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only</label>
      </div>
      <ErrorBox error={list.error || act.error} />
      {flash && !act.error && <div className="alert ok" onAnimationEnd={() => setFlash(null)}>{flash}</div>}
      {list.loading && !list.data ? <Loading /> : list.data?.length === 0 ? <Empty>No job cards found.</Empty> : (
        <div className="table-wrap">
          <table className="table job-list">
            <thead>
              <tr>
                <th>Job</th><th>Bike</th><th>Customer</th><th>Services / parts</th><th>Assigned</th>
                <th>Job status</th><th>Delivery</th>{showMoney && <th className="num">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {list.data?.map((j) => {
                const nextS = allowedStatuses(j, can);
                const nextD = allowedDelivery(j, can);
                const late = j.promised_at && new Date(j.promised_at) < new Date() && !['COMPLETED', 'CANCELLED'].includes(j.status);
                return (
                  <tr key={j.id} className={late ? 'row-late' : ''}>
                    <td className="nowrap">
                      <Link to={`/jobs/${j.id}`}><strong>{j.job_no}</strong></Link>
                      <div className="small muted" title={fmtDateTime(j.created_at)}>{timeAgo(j.created_at)}</div>
                      {late && <div className="small late-text">Overdue</div>}
                    </td>
                    <td className="nowrap"><strong className="reg">{fmtReg(j.reg_no)}</strong><div className="small muted">{j.model}{j.year ? ` · ${j.year}` : ''}</div></td>
                    <td>{j.customer_name}<div className="small muted"><a href={`tel:+${j.mobile}`}>{fmtMobile(j.mobile)}</a></div></td>
                    <td className="svc-cell">
                      <div className="ellipsis-2">{j.services || <em className="muted">No services yet</em>}</div>
                      {j.part_lines > 0 && <div className="small muted">{j.part_lines} part line{j.part_lines > 1 ? 's' : ''}</div>}
                    </td>
                    <td className="small">{j.mechanic_name || <em className="muted">—</em>}</td>
                    <td>
                      {nextS.length ? (
                        <select className={`status-select s-${j.status}`} value="" disabled={act.busy} onChange={(e) => e.target.value && changeStatus(j, e.target.value)} aria-label={`Change status of ${j.job_no}`}>
                          <option value="">{STATUS_LABEL[j.status]} ▾</option>
                          {nextS.map((s) => <option key={s} value={s}>{actionLabel(j.status, s)}</option>)}
                        </select>
                      ) : <StatusBadge status={j.status} />}
                    </td>
                    <td>
                      {nextD.length ? (
                        <select className={`status-select d-${j.delivery_status}`} value="" disabled={act.busy} onChange={(e) => e.target.value && changeDelivery(j, e.target.value)} aria-label={`Change delivery of ${j.job_no}`}>
                          <option value="">{DELIVERY_LABEL[j.delivery_status]} ▾</option>
                          {nextD.map((s) => <option key={s} value={s}>{DELIVERY_ACTION[s]}</option>)}
                        </select>
                      ) : <DeliveryBadge status={j.delivery_status} />}
                      {j.delivery_method === 'HOME_DELIVERY' && <div className="small muted">Home delivery</div>}
                    </td>
                    {showMoney && (
                      <td className="num nowrap">
                        {money(j.invoice_total ?? j.items_total)}
                        {j.invoice_status && <div><span className={`badge p-${j.invoice_status}`}>{j.invoice_status}</span></div>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
