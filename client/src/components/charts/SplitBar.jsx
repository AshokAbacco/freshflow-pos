import { formatMoney } from "../../lib/format";

const COLORS = { UPI: "#4CAF50", CASH: "#FF7B29", CARD: "#334155" };

/** Payment mix as a single stacked bar — one row instead of a pie that needs its own panel. */
export function SplitBar({ data, currency }) {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  if (!total)
    return (
      <p className="py-4 text-desc text-slate-500">
        No payments in this period.
      </p>
    );

  return (
    <div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-[#F1ECE4]"
        role="img"
        aria-label="Share of revenue by payment method"
      >
        {data.map((d) =>
          d.revenue > 0 ? (
            <div
              key={d.method}
              style={{
                width: `${(d.revenue / total) * 100}%`,
                background: COLORS[d.method],
              }}
              title={`${d.method}: ${formatMoney(d.revenue, currency)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {data.map((d) => (
          <li key={d.method} className="flex items-center gap-2 text-desc">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: COLORS[d.method] }}
              aria-hidden
            />
            <span className="flex-1 text-slate-600">{d.method}</span>
            <span className="text-slate-500 tabular">
              {Math.round((d.revenue / total) * 100)}%
            </span>
            <span className="w-20 text-right font-bold text-gray-900 tabular">
              {formatMoney(d.revenue, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
