// Daily attendance sheet + monthly summary grid
import { useEffect, useState } from 'react';
import { get, put, downloadCsv } from '../api.js';
import { ErrorBox, Loading, Tabs, useAction, useLoad } from '../components/ui.jsx';
import { todayIso, thisPeriod, fmtPeriod } from '../lib.js';

const ST = [
  ['PRESENT', 'Present', 'P'],
  ['HALF_DAY', 'Half day', '½'],
  ['ABSENT', 'Absent (no pay)', 'A'],
  ['LEAVE', 'Leave (paid)', 'L'],
  ['HOLIDAY', 'Holiday', 'H'],
];

export default function Attendance() {
  const [tab, setTab] = useState('day');
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Attendance</h1><p className="muted">Absent and half days reduce pay (no-pay). OT hours are paid at 1.5× in month-end payroll.</p></div>
      </div>
      <Tabs tabs={[['day', 'Mark attendance'], ['month', 'Monthly summary']]} value={tab} onChange={setTab} />
      {tab === 'day' ? <DaySheet /> : <MonthGrid />}
    </div>
  );
}

function DaySheet() {
  const [date, setDate] = useState(todayIso());
  const data = useLoad(() => get('/hr/attendance', { date }), [date]);
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    setRows((data.data?.rows || []).map((r) => ({ ...r, time_in: r.time_in?.slice(0, 5) || '', time_out: r.time_out?.slice(0, 5) || '', ot_hours: r.ot_hours ?? 0 })));
    setDirty(false);
  }, [data.data]);

  const set = (i, k, v) => { setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setDirty(true); setSaved(false); };
  const markAll = (status) => { setRows(rows.map((r) => ({ ...r, status: r.status || status, time_in: r.time_in || (status === 'PRESENT' ? '08:00' : ''), time_out: r.time_out || (status === 'PRESENT' ? '17:00' : '') }))); setDirty(true); };
  const save = () => run(async () => {
    await put('/hr/attendance', { date, records: rows.map((r) => ({ employee_id: r.employee_id, status: r.status || null, time_in: r.time_in, time_out: r.time_out, ot_hours: Number(r.ot_hours) || 0, note: r.note })) });
    setDirty(false);
    setSaved(true);
    data.reload({ quiet: true });
  });
  const shift = (days) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  return (
    <div className="card">
      <div className="card-title-row">
        <div className="row">
          <button className="btn small ghost" onClick={() => shift(-1)} aria-label="Previous day">‹</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn small ghost" onClick={() => shift(1)} aria-label="Next day">›</button>
          <span className="muted small">{new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}</span>
        </div>
        <div className="row wrap">
          <button className="btn small ghost" onClick={() => markAll('PRESENT')}>Mark unmarked as present</button>
          <button className="btn small ghost" onClick={() => markAll('HOLIDAY')}>Holiday for all</button>
        </div>
      </div>
      <ErrorBox error={error || data.error} />
      {data.loading && !data.data ? <Loading /> : (
        <div className="table-wrap flat">
          <table className="table compact att-table">
            <thead><tr><th>Employee</th><th>Status</th><th>In</th><th>Out</th><th className="num">OT hrs</th><th>Note</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.employee_id}>
                  <td><strong>{r.name}</strong><div className="small muted">{r.emp_no} · {r.designation}</div></td>
                  <td>
                    <div className="att-buttons">
                      {ST.map(([k, label, short]) => (
                        <button key={k} type="button" title={label} className={`att-btn a-${k}${r.status === k ? ' on' : ''}`} onClick={() => set(i, 'status', r.status === k ? null : k)}>{short}</button>
                      ))}
                    </div>
                  </td>
                  <td><input type="time" value={r.time_in} onChange={(e) => set(i, 'time_in', e.target.value)} disabled={!['PRESENT', 'HALF_DAY'].includes(r.status)} /></td>
                  <td><input type="time" value={r.time_out} onChange={(e) => set(i, 'time_out', e.target.value)} disabled={!['PRESENT', 'HALF_DAY'].includes(r.status)} /></td>
                  <td className="num"><input type="number" min="0" max="24" step="0.5" className="cell-input" style={{ width: 70 }} value={r.ot_hours} onChange={(e) => set(i, 'ot_hours', e.target.value)} disabled={r.status !== 'PRESENT'} /></td>
                  <td><input value={r.note || ''} onChange={(e) => set(i, 'note', e.target.value)} placeholder="—" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="legend small muted">{ST.map(([, label, short]) => <span key={short}><b>{short}</b> {label}</span>)}</div>
      <div className="actions-bar" style={{ marginTop: 12, marginBottom: 0 }}>
        <button className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save attendance'}</button>
        {saved && <span className="ok-text small">Saved ✓</span>}
        {dirty && <span className="small muted">Unsaved changes</span>}
      </div>
    </div>
  );
}

function MonthGrid() {
  const [period, setPeriod] = useState(thisPeriod());
  const data = useLoad(() => get('/hr/attendance/summary', { period }), [period]);
  const d = data.data;
  const short = Object.fromEntries(ST.map(([k, , s]) => [k, s]));
  const exportCsv = () => downloadCsv(`attendance_${period}.csv`, d.rows, [
    ['Emp no', 'emp_no'], ['Name', 'name'], ['Present', 'present'], ['Half day', 'half_day'], ['Absent', 'absent'], ['Leave', 'leave'], ['Holiday', 'holiday'], ['OT hours', 'ot_hours'], ['Unmarked', 'unmarked'],
    ...Array.from({ length: d.days }, (_, i) => [String(i + 1), (r) => short[r.days[i + 1]] || '']),
  ]);
  return (
    <div className="card">
      <div className="card-title-row">
        <div className="row"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto' }} /><strong>{fmtPeriod(period)}</strong></div>
        {d && <button className="btn small ghost" onClick={exportCsv}>Export to Excel</button>}
      </div>
      <ErrorBox error={data.error} />
      {data.loading && !d ? <Loading /> : (
        <div className="table-wrap flat">
          <table className="table compact month-grid">
            <thead>
              <tr>
                <th>Employee</th>
                {Array.from({ length: d.days }, (_, i) => <th key={i} className="day-col">{i + 1}</th>)}
                <th className="num">P</th><th className="num">½</th><th className="num">A</th><th className="num">L</th><th className="num">OT</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap"><strong>{r.name}</strong></td>
                  {Array.from({ length: d.days }, (_, i) => <td key={i} className={`day-col a-${r.days[i + 1] || 'NONE'}`}>{short[r.days[i + 1]] || ''}</td>)}
                  <td className="num">{r.present}</td><td className="num">{r.half_day}</td><td className="num late-text">{r.absent || ''}</td><td className="num">{r.leave}</td><td className="num">{r.ot_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
