// Services and parts on a job card, with inline quantity / amount editing
import { useEffect, useState } from 'react';
import { money, isServiceItem, ITEM_TYPE_LABEL } from '../lib.js';

function EditCell({ value, onSave, min = 0, step = 'any', disabled, width = 90, integer }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (disabled) return <span>{value}</span>;
  const commit = () => {
    const n = Number(v);
    if (Number.isNaN(n) || n < min || (integer && !Number.isInteger(n))) { setV(value); return; }
    if (n !== Number(value)) onSave(n);
  };
  return (
    <input type="number" className="cell-input" style={{ width }} min={min} step={step} value={v}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

export default function JobItems({ items, canPrice, editable, onChange, onRemove, busy }) {
  const groups = [
    ['Services', items.filter(isServiceItem)],
    ['Parts', items.filter((i) => !isServiceItem(i))],
  ];
  if (!items.length) return <p className="muted">No services or parts yet.</p>;
  return (
    <div className="table-wrap flat">
      <table className="table compact items-table">
        <thead>
          <tr><th>Item</th><th className="num">Qty</th>{canPrice && <><th className="num">Amount</th><th className="num">Total</th></>}{editable && <th />}</tr>
        </thead>
        {groups.map(([label, list]) => list.length > 0 && (
          <tbody key={label}>
            <tr className="group-row"><td colSpan={canPrice ? (editable ? 5 : 4) : (editable ? 3 : 2)}>{label}</td></tr>
            {list.map((it, idx) => (
              <tr key={it.id ?? `${label}-${idx}`}>
                <td>
                  {it.description}
                  <div className="small muted">{it.part_no || ITEM_TYPE_LABEL[it.item_type]}</div>
                </td>
                <td className="num">
                  <EditCell value={Number(it.qty)} min={it.item_type === 'part' ? 1 : 0.25} step={it.item_type === 'part' ? 1 : 0.25}
                    integer={it.item_type === 'part'} width={64} disabled={!editable || busy} onSave={(qty) => onChange(it, { qty })} />
                </td>
                {canPrice && (
                  <>
                    <td className="num"><EditCell value={Number(it.unit_price)} disabled={!editable || busy} onSave={(unit_price) => onChange(it, { unit_price })} width={100} /></td>
                    <td className="num">{money(it.line_total ?? Number(it.qty) * Number(it.unit_price))}</td>
                  </>
                )}
                {editable && (
                  <td className="num"><button className="icon-btn" title="Remove" disabled={busy} onClick={() => onRemove(it)}>×</button></td>
                )}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
