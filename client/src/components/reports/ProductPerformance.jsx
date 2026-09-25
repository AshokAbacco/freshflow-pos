import { useState } from "react";
import { LuSearch } from "react-icons/lu";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useDebounce } from "../../hooks/useDebounce";
import {
  formatMoney,
  formatNumber,
  formatPercentChange,
} from "../../lib/format";
import { Pagination } from "../ui/Pagination";
import { Segmented } from "../ui/Segmented";
import { EmptyState, ErrorState, Spinner } from "../ui/States";

const SORTS = [
  { value: "revenue", label: "Revenue" },
  { value: "units", label: "Volume" },
  { value: "growth", label: "Growth" },
  { value: "stock", label: "Low stock" },
];

function StockPill({ row }) {
  if (row.stock <= 0)
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-desc font-medium text-rose-700">
        Out of stock
      </span>
    );
  if (row.stock <= row.lowStockThreshold)
    return (
      <span className="rounded-full bg-[#FFF1E6] px-2 py-0.5 text-desc font-semibold text-[#C2560F]">
        Low
      </span>
    );
  return <span className="text-desc text-slate-500">In stock</span>;
}

export function ProductPerformance({ range, currency }) {
  const [sort, setSort] = useState("revenue");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(search, 250);
  const { data, loading, error, refetch } = useApiQuery("/reports/products", {
    from: range.from,
    to: range.to,
    sort,
    q,
    page,
    pageSize: 20,
  });
  const rows = data?.rows ?? [];

  return (
    <section className="rounded-xl bg-white p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="font-extrabold text-gray-900">
            Items sold and stock left
          </h2>
          <p className="text-desc text-slate-500">
            Sales in the period beside what is still on the shelf
          </p>
        </div>
        <Segmented
          size="sm"
          ariaLabel="Sort products"
          value={sort}
          onChange={(v) => {
            setSort(v);
            setPage(1);
          }}
          options={SORTS}
        />
        <div className="relative min-w-[180px] flex-1 sm:max-w-[220px]">
          <LuSearch
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="field h-9 pl-9"
            placeholder="Search products"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search products"
          />
        </div>
      </div>

      {loading && !data ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={refetch} /> : null}
      {data && !rows.length ? (
        <EmptyState
          title="No products match"
          description="Try a different search or period."
        />
      ) : null}

      {rows.length ? (
        <ul className="mt-3 space-y-2 md:hidden">
          {rows.map((r) => {
            const change = formatPercentChange(r.revenue, r.prevRevenue);
            return (
              <li
                key={r.id}
                className="rounded-lg bg-white p-3 ring-1 ring-black/5"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">
                      {r.name}
                    </p>
                    <p className="truncate text-desc text-slate-400">
                      {r.categoryName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-extrabold text-gray-900 tabular">
                      {formatMoney(r.revenue, currency)}
                    </p>
                    <p
                      className={`text-desc tabular ${change.direction === "up" ? "text-brand-700" : change.direction === "down" ? "text-rose-600" : "text-slate-400"}`}
                    >
                      {r.revenue || r.prevRevenue ? change.label : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-desc text-slate-500 tabular">
                  <span>
                    Sold {formatNumber(r.quantity)} {r.unit}
                  </span>
                  <span>Left {formatNumber(r.stock)}</span>
                  <div className="flex-1" />
                  <StockPill row={r} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {rows.length ? (
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F8F4EE] text-left text-desc text-gray-600">
                <th className="rounded-l-lg py-2.5 pl-3 pr-3 font-semibold">
                  Product
                </th>
                <th className="py-2.5 pr-3 font-semibold">Category</th>
                <th className="py-2.5 pr-3 text-right font-semibold">Sold</th>
                <th className="py-2.5 pr-3 text-right font-semibold">
                  Revenue
                </th>
                <th className="py-2.5 pr-3 text-right font-semibold">
                  vs before
                </th>
                <th className="py-2.5 pr-3 text-right font-semibold">
                  Stock left
                </th>
                <th className="rounded-r-lg py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const change = formatPercentChange(r.revenue, r.prevRevenue);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-slate-50 text-body transition-colors hover:bg-[#FBFAF8]"
                  >
                    <td className="max-w-[220px] py-2.5 pl-3 pr-3">
                      <p className="truncate font-medium text-slate-800">
                        {r.name}
                      </p>
                      <p className="text-desc text-slate-400 tabular">
                        #{r.code} · {formatMoney(r.price, currency)}/{r.unit}
                      </p>
                    </td>
                    <td className="max-w-[140px] truncate py-2.5 pr-3 text-desc text-slate-500">
                      {r.categoryName}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular">
                      {formatNumber(r.quantity)}{" "}
                      <span className="text-desc text-slate-400">{r.unit}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-extrabold text-gray-900 tabular">
                      {formatMoney(r.revenue, currency)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right text-desc tabular ${change.direction === "up" ? "text-brand-700" : change.direction === "down" ? "text-rose-600" : "text-slate-400"}`}
                    >
                      {r.revenue || r.prevRevenue ? change.label : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular">
                      {formatNumber(r.stock)}
                    </td>
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

      {data && data.total > data.pageSize ? (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={setPage}
        />
      ) : null}
    </section>
  );
}
