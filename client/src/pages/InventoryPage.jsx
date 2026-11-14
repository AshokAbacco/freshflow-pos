import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  LuLayers,
  LuPackagePlus,
  LuScanBarcode,
  LuPencil,
  LuSearch,
  LuBoxes,
} from "react-icons/lu";
import { SyncPill } from "../components/layout/AppShell";
import { CategoryManager } from "../components/admin/CategoryManager";
import { ProductForm } from "../components/admin/ProductForm";
import { StockAdjustModal } from "../components/admin/StockAdjustModal";
import { ScannerSetupModal } from "../components/hardware/ScannerSetupModal";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { Segmented } from "../components/ui/Segmented";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { useApiQuery } from "../hooks/useApiQuery";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useDebounce } from "../hooks/useDebounce";
import { formatMoney, formatNumber } from "../lib/format";
import { useCatalogStore } from "../store/catalogStore";
import { toast } from "../store/toastStore";

export default function InventoryPage() {
  const { openSync } = useOutletContext();
  const {
    categories,
    settings,
    load: reloadCatalog,
    lookupScan,
  } = useCatalogStore();
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
  const [showScanner, setShowScanner] = useState(false);
  /** A scanned code with no product behind it, offered to the add-product form. */
  const [unknownScan, setUnknownScan] = useState(null);

  /*
   * The barcode index lives in the catalog store, which this page otherwise has no reason to
   * load -- its rows come from /products, one page at a time. Loading it here is what lets a
   * scan resolve a product that is not on the page currently shown. It is cached in
   * IndexedDB, so this is close to free after the first visit.
   */
  useEffect(() => {
    reloadCatalog({ silent: true });
  }, [reloadCatalog]);

  /*
   * Scanning on this screen is for taking stock in: scan a box, the product's stock dialog
   * opens straight away. That is the whole job, so it should not need a search and two clicks.
   * A code with no product behind it is the other half of stock entry -- new line, never
   * stocked before -- so it offers to create it rather than just reporting a miss.
   */
  useBarcodeScanner(
    (code) => {
      const hit = lookupScan(code);
      if (hit) {
        setUnknownScan(null);
        setAdjusting(hit.product);
        return;
      }
      setAdjusting(null);
      setUnknownScan(code);
      setSearch(code);
      setPage(1);
      toast.info(`No product has the barcode ${code} yet`);
    },
    // While a dialog is open it owns the scanner, so a scan does not reshuffle the page behind it.
    {
      enabled:
        !adjusting &&
        !editing &&
        !creating &&
        !managingCategories &&
        !showScanner,
    },
  );

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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowScanner(true)}
            title="Barcode scanner"
            aria-label="Barcode scanner settings"
          >
            <LuScanBarcode aria-hidden />
            <span className="hidden lg:inline">Scanner</span>
          </Button>
        </div>

        {unknownScan ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5">
            <LuScanBarcode className="shrink-0 text-brand-700" aria-hidden />
            <p className="min-w-0 flex-1 text-desc text-slate-700">
              Scanned <span className="font-mono font-bold">{unknownScan}</span>
              , which no product has yet.
            </p>
            <Button size="sm" onClick={() => setCreating(true)}>
              Add this product
            </Button>
            <button
              type="button"
              onClick={() => setUnknownScan(null)}
              className="text-desc font-semibold text-slate-500 hover:text-slate-800"
            >
              Dismiss
            </button>
          </div>
        ) : null}

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
        initialBarcode={unknownScan ?? ""}
        onClose={() => {
          setCreating(false);
          setUnknownScan(null);
        }}
        onSaved={() => {
          setUnknownScan(null);
          refresh();
        }}
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
      <ScannerSetupModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
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
