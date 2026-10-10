import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../socket.js';
import { DeliveryBadge, ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { BOARD_COLUMNS, STATUS_LABEL, money, timeAgo, fmtDateTime, bikeLabel, SERVICE_KIND_SHORT, PAY_STATE_LABEL } from '../lib.js';

const COLS = [...BOARD_COLUMNS, 'DELIVERED_TODAY'];
const COL_LABEL = { ...STATUS_LABEL, COMPLETED: 'Completed – to deliver', DELIVERED_TODAY: 'Delivered today' };

export default function Board() {
  const { can } = useAuth();
  const [mine, setMine] = useState(false);
  const board = useLoad(() => get('/jobs/board', { mine: mine ? '1' : undefined }), [mine]);
  const summary = useLoad(() => get('/dashboard/summary'), []);

  useLive('job:changed', () => { board.reload({ quiet: true }); summary.reload({ quiet: true }); });

  const cols = useMemo(() => {
    const by = Object.fromEntries(COLS.map((s) => [s, []]));
    (board.data || []).forEach((j) => {
      if (j.delivery_status === 'DELIVERED') by.DELIVERED_TODAY.push(j);
      else by[j.status]?.push(j);
    });
    return by;
  }, [board.data]);

  const s = summary.data;
  const finance = can('dashboard.finance');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Job board</h1>
          <p className="muted">Every bike in the workshop right now. Updates live.</p>
        </div>
        <div className="row">
          {can('jobs.status') && <label className="toggle"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My jobs only</label>}
          {can('payments.record') && <Link className="btn" to="/cashier">💵 Cashier</Link>}
          {can('jobs.create') && <Link className="btn primary" to="/jobs/new">+ New job card</Link>}
        </div>
      </div>

      {s && (
        <div className="stats">
          <div className="stat"><span>In workshop</span><strong>{Object.values(s.open_by_status).reduce((a, b) => a + b, 0)}</strong></div>
          <div className="stat"><span>Waiting for delivery</span><strong>{(s.awaiting_delivery.READY || 0) + (s.awaiting_delivery.OUT_FOR_DELIVERY || 0)}</strong></div>
          <div className="stat"><span>Checked in today</span><strong>{s.today.checked_in}</strong></div>
          <div className="stat"><span>Delivered today</span><strong>{s.today.delivered}</strong></div>
          {finance && <div className="stat"><span>Collected today</span><strong>{money(s.today.collected)}</strong></div>}
          {finance && s.today.expenses > 0 && <div className="stat"><span>Expenses today</span><strong>{money(s.today.expenses)}</strong></div>}
          {can('parts.view') && s.low_stock > 0 && <Link to="/parts?low=1" className="stat warn"><span>Low stock parts</span><strong>{s.low_stock}</strong></Link>}
          {can('messages.view') && s.failed_notifications_7d > 0 && <Link to="/reminders" className="stat warn"><span>Failed messages</span><strong>{s.failed_notifications_7d}</strong></Link>}
        </div>
      )}

      <ErrorBox error={board.error} />
      {board.loading && !board.data ? <Loading /> : (
        <div className="board">
          {COLS.map((st) => (
            <section key={st} className={`col c-${st}`}>
              <header><span>{COL_LABEL[st]}</span><b>{cols[st].length}</b></header>
              <div className="col-body">
                {cols[st].map((j) => <JobTile key={j.id} job={j} showMoney={can('jobs.pricing')} />)}
                {cols[st].length === 0 && <div className="col-empty">—</div>}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function JobTile({ job, showMoney }) {
  const late = job.promised_at && new Date(job.promised_at) < new Date() && !['COMPLETED', 'CANCELLED'].includes(job.status);
  return (
    <Link to={`/jobs/${job.id}`} className={`tile${late ? ' late' : ''}`}>
      <div className="tile-top">
        <strong className="reg">{bikeLabel(job)}</strong>
        <span className="muted small">{job.job_no}</span>
      </div>
      {(job.service_kind || job.pay_upfront) && (
        <div className="tile-tags">
          {job.service_kind && <span className={`kind-tag k-${job.service_kind}`}>{SERVICE_KIND_SHORT[job.service_kind]}</span>}
          {job.pay_upfront && <span className={`badge pay-${job.payment_state}`}>{job.payment_state === 'DUE' && job.status === 'CHECKED_IN' ? 'Waiting for cashier' : PAY_STATE_LABEL[job.payment_state]}</span>}
        </div>
      )}
      <div className="tile-model">{job.model}{job.year ? ` · ${job.year}` : ''}</div>
      <div className="small muted ellipsis">{job.customer_name}</div>
      {job.services && <div className="small ellipsis tile-complaint">{job.services}</div>}
      {job.status === 'COMPLETED' && <div style={{ marginTop: 6 }}><DeliveryBadge status={job.delivery_status} /></div>}
      <div className="tile-foot small">
        <span>{job.mechanic_name ? `🔧 ${job.mechanic_name}` : <em className="muted">Unassigned</em>}</span>
        <span className={late ? 'late-text' : 'muted'} title={job.promised_at ? `Estimated delivery ${fmtDateTime(job.promised_at)}` : ''}>
          {late ? 'Overdue' : timeAgo(job.created_at)}
        </span>
      </div>
      {showMoney && job.items_total > 0 && <div className="tile-amount small">{money(job.items_total)}</div>}
    </Link>
  );
}
