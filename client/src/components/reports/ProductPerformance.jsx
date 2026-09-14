import { useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useDebounce } from '../../hooks/useDebounce';
import { formatMoney, formatNumber, formatPercentChange } from '../../lib/format';
import { Pagination } from '../ui/Pagination';
import { Segmented } from '../ui/Segmented';
import { EmptyState, ErrorState, Spinner } from '../ui/States';

const SORTS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'units', label: 'Volume' },
  { value: 'growth', label: 'Growth' },
  { value: 'stock', label: 'Low stock' },
];

function StockPill({ row }) {
  if (row.stock <= 0) return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-desc font-medium text-rose-700">Out of stock</span>;
  if (row.stock <= row.lowStockThreshold) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-desc font-medium text-amber-700">Low</span>;
  return <span className="text-desc text-slate-500">In stock</span>;
}

export function ProductPerformance({ range, currency }) {
  const [sort, setSort] = useState('revenue');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search, 250);
  const { data, loading, error, refetch } = useApiQuery('/reports/products', { from: range.from, to: range.to, sort, q, page, pageSize: 20 });
  const rows = data?.rows ?? [];

  return (
    <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2>Items sold and stock left</h2>
          <p className="text-desc text-slate-500">Sales in the period beside what is still on the shelf</p>
        </div>
        <Segmented size="sm" ariaLabel="Sort products" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORTS} />
        <div className="relative min-w-[180px] flex-1 sm:max-w-[220px]">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="field h-9 pl-9" placeholder="Search products" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search products" />
        </div>
      </div>

      {loading && !data ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={refetch} /> : null}
      {data && !rows.length ? <EmptyState title="No products match" description="Try a different search or period." /> : null}

      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-left text-desc text-slate-500">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 text-right font-medium">Sold</th>
                <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                <th className="py-2 pr-3 text-right font-medium">vs before</th>
                <th className="py-2 pr-3 text-right font-medium">Stock left</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const change = formatPercentChange(r.revenue, r.prevRevenue);
                return (
                  <tr key={r.id} className="border-b border-slate-50 text-body">
                    <td className="max-w-[220px] py-2.5 pr-3">
                      <p className="truncate font-medium text-slate-800">{r.name}</p>
                      <p className="text-desc text-slate-400 tabular">
                        #{r.code} · {formatMoney(r.price, currency)}/{r.unit}
                      </p>
                    </td>
                    <td className="max-w-[140px] truncate py-2.5 pr-3 text-desc text-slate-500">{r.categoryName}</td>
                    <td className="py-2.5 pr-3 text-right tabular">
                      {formatNumber(r.quantity)} <span className="text-desc text-slate-400">{r.unit}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular">{formatMoney(r.revenue, currency)}</td>
                    <td className={`py-2.5 pr-3 text-right text-desc tabular ${change.direction === 'up' ? 'text-brand-700' : change.direction === 'down' ? 'text-rose-600' : 'text-slate-400'}`}>
                      {r.revenue || r.prevRevenue ? change.label : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular">{formatNumber(r.stock)}</td>
                    <td className="py-2.5">
                      <StockPill row={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.total > data.pageSize ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </section>
  );
}
