import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  LuLayers,
  LuPackagePlus,
  LuPencil,
  LuSearch,
  LuBoxes,
} from "react-icons/lu";
import { SyncPill } from "../components/layout/AppShell";
import { CategoryManager } from "../components/admin/CategoryManager";
import { ProductForm } from "../components/admin/ProductForm";
import { StockAdjustModal } from "../components/admin/StockAdjustModal";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { Segmented } from "../components/ui/Segmented";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { useApiQuery } from "../hooks/useApiQuery";
import { useDebounce } from "../hooks/useDebounce";
import { formatMoney, formatNumber } from "../lib/format";
import { useCatalogStore } from "../store/catalogStore";

export default function InventoryPage() {
  const { openSync } = useOutletContext();
  const { categories, settings, load: reloadCatalog } = useCatalogStore();
  const currency = settings?.currency || "INR";

  const [search, setSearch] = useState("");
  const [stock, setStock] = useState("all");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(search, 250);

  const { data, loading, error, refetch } = useApiQuery("/products", {
    q,
    stock,
    categoryId,
    page,
    pageSize: 20,
    status: "all",
    sort: "name",
  });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [managingCategories, setManagingCategories] = useState(false);

  const refresh = () => {
    refetch();
    reloadCatalog({ silent: true });
  };

  const rows = data?.products ?? [];

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 px-4 pb-3 pt-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-desc font-semibold italic text-[#FF7B29]">
              Catalog
            </p>
            <h1 className="truncate text-h1 font-extrabold tracking-tight text-gray-900">
              Inventory
            </h1>
            <p className="truncate text-desc text-slate-500">
              Catalog and stock levels
            </p>
          </div>
          <SyncPill onClick={openSync} />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setManagingCategories(true)}
          >
            <LuLayers aria-hidden />{" "}
            <span className="hidden sm:inline">Categories</span>
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <LuPackagePlus aria-hidden />{" "}
            <span className="hidden sm:inline">Add product</span>
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              className="field h-9 pl-9"
              placeholder="Search by name, code or barcode"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search products"
            />
          </div>
          <select
            className="field h-9 w-auto py-0"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "— " : ""}
                {c.name}
              </option>
            ))}
          </select>
          <Segmented
            size="sm"
            ariaLabel="Stock filter"
            value={stock}
            onChange={(v) => {
              setStock(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "low", label: "Low" },
              { value: "out", label: "Out" },
            ]}
          />
        </div>
      </header>

      <div className="px-4 py-4 sm:px-6">
        {loading && !data ? <Spinner /> : null}
        {error ? <ErrorState message={error} onRetry={refetch} /> : null}
        {data && !rows.length ? (
          <EmptyState
            icon={LuBoxes}
            title="No products here"
            description="Try another search or filter, or add a new product."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                Add product
              </Button>
            }
          />
        ) : null}

        {rows.length ? (
          <>
            {/* Phones get cards; the table needs more width than a phone has. */}
            <ul className="space-y-2 md:hidden">
              {rows.map((p) => {
                const low = p.stock > 0 && p.stock <= p.lowStockThreshold;
                const out = p.stock <= 0;
                return (
                  <li
                    key={p.id}
                    className="rounded-xl bg-white p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-gray-900">
                          {p.name}
                          {!p.isActive ? (
                            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-desc text-slate-500">
                              Hidden
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-desc text-slate-400 tabular">
                          #{p.code}
                          {p.categoryName ? ` · ${p.categoryName}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-extrabold text-[#FF7B29] tabular">
                        {formatMoney(p.price, currency)}
                        <span className="text-desc font-normal text-slate-400">
                          /{p.unit}
                        </span>
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-desc font-medium tabular ${out ? "bg-rose-50 text-rose-700" : low ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {formatNumber(p.stock)} {p.unit}{" "}
                        {out ? "out of stock" : low ? "left, low" : "in stock"}
                      </span>
                      <div className="flex-1" />
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => setAdjusting(p)}
                      >
                        Stock
                      </Button>
                      <Button
                        size="iconSm"
                        variant="ghost"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        <LuPencil aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
              {data.total > data.pageSize ? (
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onPage={setPage}
                />
              ) : null}
            </ul>

            <div className="hidden overflow-x-auto rounded-xl bg-white p-2 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 md:block sm:p-4">
              <table className="w-full min-w-[680px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#F8F4EE] text-left text-desc text-gray-600">
                    <th className="rounded-l-lg py-2.5 pl-3 pr-3 font-semibold">
                      Product
                    </th>
                    <th className="py-2.5 pr-3 font-semibold">Category</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">
                      Price
                    </th>
                    <th className="py-2.5 pr-3 text-right font-semibold">
                      Stock
                    </th>
                    <th className="py-2.5 pr-3 text-right font-semibold">
                      Stock value
                    </th>
                    <th
                      className="w-24 rounded-r-lg py-2.5"
                      aria-label="Actions"
                    />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const low = p.stock > 0 && p.stock <= p.lowStockThreshold;
                    const out = p.stock <= 0;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-slate-50 text-body transition-colors hover:bg-[#FBFAF8]"
                      >
                        <td className="max-w-[240px] py-2.5 pl-3 pr-3">
                          <p className="truncate font-medium text-slate-800">
                            {p.name}
                            {!p.isActive ? (
                              <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-desc text-slate-500">
                                Hidden
                              </span>
                            ) : null}
                          </p>
                          <p className="text-desc text-slate-400 tabular">
                            #{p.code}
                            {p.barcode ? ` · ${p.barcode}` : ""}
                            {p.discountPercent > 0
                              ? ` · ${formatNumber(p.discountPercent)}% markdown`
                              : ""}
                          </p>
                        </td>
                        <td className="max-w-[150px] truncate py-2.5 pr-3 text-desc text-slate-500">
                          {p.categoryName}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular">
                          {formatMoney(p.price, currency)}
                          <span className="text-desc text-slate-400">
                            /{p.unit}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right font-medium tabular ${out ? "text-rose-600" : low ? "text-amber-600" : "text-slate-700"}`}
                        >
                          {formatNumber(p.stock)}{" "}
                          <span className="text-desc font-normal text-slate-400">
                            {p.unit}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular">
                          {formatMoney(
                            Math.max(0, p.stock) * p.price,
                            currency,
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() => setAdjusting(p)}
                            >
                              Stock
                            </Button>
                            <Button
                              size="iconSm"
                              variant="ghost"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => setEditing(p)}
                            >
                              <LuPencil aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.total > data.pageSize ? (
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onPage={setPage}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <ProductForm
        open={creating}
        product={null}
        categories={categories}
        onClose={() => setCreating(false)}
        onSaved={refresh}
      />
      <ProductForm
        open={Boolean(editing)}
        product={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <StockAdjustModal
        product={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={refresh}
      />
      <CategoryManager
        open={managingCategories}
        onClose={() => setManagingCategories(false)}
        categories={categories}
        onChanged={() => reloadCatalog({ silent: true })}
      />
    </div>
  );
}
