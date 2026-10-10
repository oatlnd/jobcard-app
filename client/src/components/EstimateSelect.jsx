// "Estimated delivery" picker: quick choices (30 min … 1 month) counted in workshop hours, or pick a date & time.
import { useEffect, useState } from 'react';
import { ESTIMATE_OPTIONS, readyBy, fmtReady, isoToLocal, localToIso } from '../lib.js';

export default function EstimateSelect({ value, onChange, hours }) {
  // value: ISO string or ''; we keep which quick option was chosen locally
  const [choice, setChoice] = useState(value ? 'custom' : '');
  const [custom, setCustom] = useState(value ? isoToLocal(value) : '');
  useEffect(() => { if (!value) { setChoice(''); setCustom(''); } }, [value]);
  const pick = (k) => {
    setChoice(k);
    if (k === '') onChange('');
    else if (k !== 'custom') onChange(readyBy(k, hours).toISOString());
    else onChange(localToIso(custom) || '');
  };
  return (
    <div className="estimate">
      <select value={choice} onChange={(e) => pick(e.target.value)}>
        <option value="">— not set —</option>
        {ESTIMATE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        <option value="custom">Pick date & time…</option>
      </select>
      {choice === 'custom' && <input type="datetime-local" value={custom} onChange={(e) => { setCustom(e.target.value); onChange(localToIso(e.target.value) || ''); }} />}
      {value && <span className="estimate-when">Ready by <b>{fmtReady(value)}</b></span>}
    </div>
  );
}
