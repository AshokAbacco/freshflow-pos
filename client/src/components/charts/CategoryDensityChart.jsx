import { useMemo, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { formatMoney } from '../../lib/format';

/**
 * Every category in one screen, however many there are.
 *
 * Rows work up to ~40 categories. Past that the same data is drawn as a packed column grid —
 * one thin bar per category, sorted by revenue, with the previous period as a faint marker.
 * A thousand categories fit in a few hundred pixels instead of a thousand table rows.
 */
export function CategoryDensityChart({ rows: allRows, currency, height = 260 }) {
  const [wrapRef, { width }] = useElementSize();
  const [hover, setHover] = useState(null);

  /*
   * Categories with no sales in either period would render as a blank row each. At 1,000+ categories
   * that is most of the chart, so they are counted in a footnote instead of drawn.
   */
  const rows = useMemo(() => allRows.filter((r) => r.revenue > 0 || r.prevRevenue > 0), [allRows]);
  const idleCount = allRows.length - rows.length;

  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.prevRevenue)));
  const dense = rows.length > 40;

  const layout = useMemo(() => {
    if (!dense || !width) return null;
    const gap = 1;
    const minBar = 2;
    const perColumn = Math.max(1, Math.floor((width + gap) / (minBar + gap)));
    const columns = Math.min(rows.length, perColumn);
    const barW = Math.max(minBar, (width - (columns - 1) * gap) / columns - gap);
    const rowsCount = Math.ceil(rows.length / columns);
    const bandH = Math.min(64, Math.max(30, (height - 4) / rowsCount));
    return { columns, barW: barW + gap, bandH, rowsCount };
  }, [dense, width, rows.length, height]);

  const Footnote = ({ children }) => (
    <p className="mt-2 text-desc text-slate-400">
      {children}
      {idleCount ? `${children ? ' ' : ''}${idleCount.toLocaleString('en-IN')} more had no sales in either period.` : ''}
    </p>
  );

  if (!rows.length) {
    return (
      <div ref={wrapRef}>
        <p className="py-6 text-center text-desc text-slate-500">No category sold anything in this period.</p>
      </div>
    );
  }

  if (!dense) {
    return (
      <div ref={wrapRef}>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const pct = (r.revenue / max) * 100;
          const prevPct = (r.prevRevenue / max) * 100;
          return (
            <li key={r.id} className="grid grid-cols-[minmax(96px,1.1fr)_3fr_auto] items-center gap-3">
              <span className="truncate text-desc text-slate-600" title={r.parentName ? `${r.parentName} › ${r.name}` : r.name}>
                {r.icon ? `${r.icon} ` : ''}
                {r.name}
              </span>
              <span className="relative h-4 rounded-full bg-slate-100">
                <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                {r.prevRevenue > 0 ? (
                  <span className="absolute inset-y-0 w-0.5 bg-slate-400" style={{ left: `calc(${prevPct}% - 1px)` }} title={`Previous ${formatMoney(r.prevRevenue, currency)}`} />
                ) : null}
              </span>
              <span className="w-20 text-right text-desc font-medium text-slate-800 tabular">{formatMoney(r.revenue, currency)}</span>
            </li>
          );
        })}
      </ul>
      <Footnote />
      </div>
    );
  }

  const totalHeight = layout ? layout.rowsCount * layout.bandH : height;

  return (
    <div ref={wrapRef} className="relative w-full">
      {layout ? (
        <>
          <svg
            width={width}
            height={totalHeight}
            role="img"
            aria-label={`Revenue for ${rows.length} categories, highest first`}
            onMouseLeave={() => setHover(null)}
          >
            {rows.map((r, i) => {
              const col = i % layout.columns;
              const row = Math.floor(i / layout.columns);
              const track = layout.bandH - 5;
              // Square-root scale: a long tail of small categories stays visible next to the leaders.
              const barH = r.revenue > 0 ? Math.max(3, Math.sqrt(r.revenue / max) * track) : 0;
              const prevH = r.prevRevenue > 0 ? Math.max(2, Math.sqrt(r.prevRevenue / max) * track) : 0;
              const x = col * layout.barW;
              const baseline = row * layout.bandH + layout.bandH - 3;
              return (
                <g key={r.id} onMouseEnter={() => setHover(i)}>
                  <rect x={x} y={row * layout.bandH} width={layout.barW} height={layout.bandH} fill="transparent" />
                  <rect x={x} y={baseline - barH} width={Math.max(1.5, layout.barW - 1)} height={barH} rx="1" fill={hover === i ? '#047857' : '#10B981'} />
                  {prevH > 0.5 ? <rect x={x} y={baseline - prevH} width={Math.max(1.5, layout.barW - 1)} height={0.8} fill="#64748B" opacity="0.75" /> : null}
                </g>
              );
            })}
          </svg>
          <Footnote>
            {`${rows.length.toLocaleString('en-IN')} categories sold, highest first. Heights use a square-root scale so smaller categories stay visible; the grey tick marks the previous period.`}
          </Footnote>
        </>
      ) : (
        <div style={{ height }} />
      )}

      {hover !== null && layout ? (
        <div
          className="glass pointer-events-none absolute z-10 max-w-[220px] rounded-xl px-2.5 py-1.5 text-desc shadow-card"
          style={{
            left: Math.min((hover % layout.columns) * layout.barW, Math.max(0, width - 220)),
            top: Math.max(0, Math.floor(hover / layout.columns) * layout.bandH - 54),
          }}
        >
          <p className="truncate font-semibold text-slate-800">{rows[hover].name}</p>
          {rows[hover].parentName ? <p className="truncate text-slate-500">{rows[hover].parentName}</p> : null}
          <p className="text-brand-700 tabular">{formatMoney(rows[hover].revenue, currency)}</p>
          <p className="text-slate-500 tabular">was {formatMoney(rows[hover].prevRevenue, currency)}</p>
        </div>
      ) : null}
    </div>
  );
}
