import { LuArrowDown, LuArrowUp } from 'react-icons/lu';
import { formatPercentChange } from '../../lib/format';

export function KpiCard({ label, value, previous, current, hint, invertColors = false }) {
  const change = previous === undefined ? null : formatPercentChange(current, previous);
  const good = change && (invertColors ? change.direction === 'down' : change.direction === 'up');
  const bad = change && (invertColors ? change.direction === 'up' : change.direction === 'down');
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03]">
      <p className="text-desc text-slate-500">{label}</p>
      <p className="mt-1 truncate text-h1 font-bold text-slate-900 tabular">{value}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {change ? (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-desc font-semibold ${good ? 'bg-brand-50 text-brand-700' : bad ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
            {change.direction === 'up' ? <LuArrowUp size={11} aria-hidden /> : change.direction === 'down' ? <LuArrowDown size={11} aria-hidden /> : null}
            {change.label}
          </span>
        ) : null}
        {hint ? <span className="truncate text-desc text-slate-500">{hint}</span> : null}
      </div>
    </div>
  );
}
