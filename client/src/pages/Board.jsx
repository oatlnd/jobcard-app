import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../socket.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { BOARD_COLUMNS, STATUS_LABEL, fmtReg, money, timeAgo, fmtDateTime } from '../lib.js';

export default function Board() {
  const { user } = useAuth();
  const [mine, setMine] = useState(false);
  const board = useLoad(() => get('/jobs/board', { mine: mine ? '1' : undefined }), [mine]);
  const summary = useLoad(() => get('/dashboard/summary'), []);

  useLive('job:changed', () => { board.reload({ quiet: true }); summary.reload({ quiet: true }); });

  const cols = useMemo(() => {
    const by = Object.fromEntries(BOARD_COLUMNS.map((s) => [s, []]));
    (board.data || []).forEach((j) => by[j.status]?.push(j));
    return by;
  }, [board.data]);

  const s = summary.data;
  const canMoney = user.role !== 'mechanic';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Job board</h1>
          <p className="muted">Every bike in the workshop right now. Updates live.</p>
        </div>
        <div className="row">
          {user.role === 'mechanic' && (
            <label className="toggle"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My jobs only</label>
          )}
          {user.role !== 'mechanic' && <Link className="btn primary" to="/jobs/new">+ New job card</Link>}
        </div>
      </div>

      {s && (
        <div className="stats">
          <div className="stat"><span>In workshop</span><strong>{Object.values(s.open_by_status).reduce((a, b) => a + b, 0)}</strong></div>
          <div className="stat"><span>Checked in today</span><strong>{s.today.checked_in}</strong></div>
          <div className="stat"><span>Delivered today</span><strong>{s.today.delivered}</strong></div>
          {canMoney && <div className="stat"><span>Collected today</span><strong>{money(s.today.collected)}</strong></div>}
          {canMoney && s.low_stock > 0 && <Link to="/parts?low=1" className="stat warn"><span>Low stock parts</span><strong>{s.low_stock}</strong></Link>}
          {canMoney && s.failed_notifications_7d > 0 && <Link to="/reminders" className="stat warn"><span>Failed messages</span><strong>{s.failed_notifications_7d}</strong></Link>}
        </div>
      )}

      <ErrorBox error={board.error} />
      {board.loading && !board.data ? <Loading /> : (
        <div className="board">
          {BOARD_COLUMNS.map((st) => (
            <section key={st} className={`col c-${st}`}>
              <header><span>{st === 'DELIVERED' ? 'Delivered today' : STATUS_LABEL[st]}</span><b>{cols[st].length}</b></header>
              <div className="col-body">
                {cols[st].map((j) => <JobTile key={j.id} job={j} showMoney={canMoney} />)}
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
  const late = job.promised_at && new Date(job.promised_at) < new Date() && !['READY', 'DELIVERED'].includes(job.status);
  return (
    <Link to={`/jobs/${job.id}`} className={`tile${late ? ' late' : ''}`}>
      <div className="tile-top">
        <strong className="reg">{fmtReg(job.reg_no)}</strong>
        <span className="muted small">{job.job_no}</span>
      </div>
      <div className="tile-model">{job.model}{job.year ? ` · ${job.year}` : ''}</div>
      <div className="small muted ellipsis">{job.customer_name} · {job.service_type}</div>
      {job.complaint && <div className="small ellipsis tile-complaint">{job.complaint}</div>}
      <div className="tile-foot small">
        <span>{job.mechanic_name ? `🔧 ${job.mechanic_name.replace(/\s*\(.*\)/, '')}` : <em className="muted">Unassigned</em>}</span>
        <span className={late ? 'late-text' : 'muted'} title={job.promised_at ? `Promised ${fmtDateTime(job.promised_at)}` : ''}>
          {late ? 'Overdue' : timeAgo(job.created_at)}
        </span>
      </div>
      {showMoney && job.items_total > 0 && <div className="tile-amount small">{money(job.items_total)}</div>}
    </Link>
  );
}
