import { useMemo, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { formatCompactMoney, formatMoney } from '../../lib/format';

/**
 * Revenue over time with the previous period behind it for comparison.
 * Bars for short periods (they read as discrete days/hours); a line once there are too many
 * buckets for bars to stay legible.
 */
export function TrendChart({ current, previous, currency, height = 200 }) {
  const [wrapRef, { width }] = useElementSize();
  const [hover, setHover] = useState(null);

  const max = Math.max(1, ...current.map((d) => d.revenue), ...previous.map((d) => d.revenue));
  const asLine = current.length > 45;
  const padding = { top: 12, right: 8, bottom: 22, left: 46 };
  const innerW = Math.max(40, width - padding.left - padding.right);
  const innerH = height - padding.top - padding.bottom;
  const step = innerW / Math.max(1, current.length);

  const x = (i) => padding.left + step * (i + 0.5);
  const y = (v) => padding.top + innerH - (v / max) * innerH;

  const path = (series) =>
    series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.revenue).toFixed(1)}`).join(' ');

  const ticks = useMemo(() => [0, max / 2, max], [max]);
  const labelEvery = Math.ceil(current.length / Math.max(2, Math.floor(innerW / 64)));

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={`Revenue trend across ${current.length} periods`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeDasharray={i === 0 ? '0' : '3 3'} />
              <text x={padding.left - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
                {formatCompactMoney(t, currency)}
              </text>
            </g>
          ))}

          {asLine ? (
            <>
              <path d={path(previous)} fill="none" stroke="#CBD5E1" strokeWidth="1.5" />
              <path d={path(current)} fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" />
            </>
          ) : (
            current.map((d, i) => {
              const barW = Math.max(3, Math.min(26, step * 0.56));
              const prev = previous[i]?.revenue ?? 0;
              return (
                <g key={d.key}>
                  {prev > 0 ? (
                    <rect x={x(i) - barW / 2 - 2} y={y(prev)} width={barW} height={Math.max(1, innerH - (y(prev) - padding.top))} rx="3" fill="#E2E8F0" />
                  ) : null}
                  <rect
                    x={x(i) - barW / 2 + 2}
                    y={y(d.revenue)}
                    width={barW}
                    height={Math.max(d.revenue > 0 ? 2 : 0, innerH - (y(d.revenue) - padding.top))}
                    rx="3"
                    fill={hover === i ? '#047857' : '#059669'}
                  />
                </g>
              );
            })
          )}

          {current.map((d, i) => (
            <rect
              key={`hit-${d.key}`}
              x={padding.left + step * i}
              y={padding.top}
              width={step}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={padding.top} y2={padding.top + innerH} stroke="#059669" strokeWidth="1" strokeDasharray="3 3" /> : null}

          {current.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={`lbl-${d.key}`} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="#94A3B8">
                {d.label}
              </text>
            ) : null,
          )}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {hover !== null ? (
        <div
          className="glass pointer-events-none absolute top-1 rounded-xl px-2.5 py-1.5 text-desc shadow-card"
          style={{ left: Math.min(Math.max(0, x(hover) - 60), Math.max(0, width - 130)) }}
        >
          <p className="font-semibold text-slate-800">{current[hover].label}</p>
          <p className="text-brand-700 tabular">{formatMoney(current[hover].revenue, currency)}</p>
          <p className="text-slate-500 tabular">was {formatMoney(previous[hover]?.revenue ?? 0, currency)}</p>
          <p className="text-slate-500 tabular">{current[hover].orders} bills</p>
        </div>
      ) : null}
    </div>
  );
}
