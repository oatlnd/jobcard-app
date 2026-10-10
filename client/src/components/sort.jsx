// Click a table heading to sort by it (again to reverse). Remembers the last sort per page on this computer.
//   const { sorted, Th } = useSort(rows, 'sortKeyForThisTable', { job: (r) => r.job_no, total: 'items_total' }, ['job', 'desc']);
//   <Th k="job">Job</Th> ... {sorted.map(...)}
import { useMemo, useState } from 'react';

const read = (key) => { try { return JSON.parse(localStorage.getItem(`sort:${key}`)); } catch { return null; } };
const write = (key, v) => { try { localStorage.setItem(`sort:${key}`, JSON.stringify(v)); } catch { /* ignore */ } };

function norm(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || typeof v === 'boolean') return Number(v);
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const t = Date.parse(s); if (!Number.isNaN(t)) return t; }
  return s.toLowerCase();
}

export function useSort(rows, storageKey, getters, initial = null) {
  const [sort, setSort] = useState(() => read(storageKey) || initial); // [key, 'asc'|'desc'] or null
  const sorted = useMemo(() => {
    const list = rows || [];
    if (!sort || !getters[sort[0]]) return list;
    const g = getters[sort[0]];
    const get = typeof g === 'function' ? g : (r) => r[g];
    const dir = sort[1] === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => {
      const x = norm(get(a)); const y = norm(get(b));
      if (x === y) return 0;
      if (x === null) return 1; // empty values always last
      if (y === null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    });
  }, [rows, sort, getters]);

  const toggle = (k) => {
    const next = !sort || sort[0] !== k ? [k, 'asc'] : sort[1] === 'asc' ? [k, 'desc'] : null;
    setSort(next);
    write(storageKey, next);
  };

  function Th({ k, children, className = '', ...rest }) {
    const on = sort && sort[0] === k;
    return (
      <th {...rest} className={`sortable${on ? ' sorted' : ''} ${className}`} onClick={() => toggle(k)}
        aria-sort={on ? (sort[1] === 'asc' ? 'ascending' : 'descending') : 'none'} title="Click to sort">
        {children}<span className="sort-ind">{on ? (sort[1] === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
      </th>
    );
  }
  return { sorted, Th, sort };
}
