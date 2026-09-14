import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  LuLayers,
  LuScanBarcode,
  LuSearch,
  LuShoppingBasket,
  LuX,
} from "react-icons/lu";
import { SyncPill } from "../components/layout/AppShell";
import { CartPanel } from "../components/pos/CartPanel";
import { CategoryRail } from "../components/pos/CategoryRail";
import { DiscountModal } from "../components/pos/DiscountModal";
import { HeldBillsModal } from "../components/pos/HeldBillsModal";
import { PaymentModal } from "../components/pos/PaymentModal";
import { ProductCard } from "../components/pos/ProductCard";
import { ReceiptModal } from "../components/pos/ReceiptModal";
import { ScaleModal } from "../components/pos/ScaleModal";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useBill } from "../hooks/useBill";
import { useDebounce } from "../hooks/useDebounce";
import { useHotkeys } from "../hooks/useHotkeys";
import { completeSale } from "../lib/checkout";
import { errorMessage } from "../lib/api";
import { formatMoney } from "../lib/format";
import { fromPaise } from "../lib/pricing";
import { useAuthStore } from "../store/authStore";
import { useCartStore } from "../store/cartStore";
import { useCatalogStore } from "../store/catalogStore";
import { toast } from "../store/toastStore";

function beep(frequency = 1760) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    setTimeout(() => ctx.close(), 300);
  } catch {
    /* audio is a nicety, never block a sale for it */
  }
}

export default function PosPage() {
  const { openSync } = useOutletContext();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const {
    products,
    categories,
    settings,
    status,
    source,
    error,
    load,
    lookup,
    applySale,
  } = useCatalogStore();
  const { lines, billDiscount, bill, itemCount, currency } = useBill();
  const {
    addProduct,
    clear,
    holdCurrent,
    loadHeldBills,
    heldBills,
    setBillDiscount,
  } = useCartStore();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  const [scaleProduct, setScaleProduct] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef(null);
  const debouncedQuery = useDebounce(query, 150);

  useEffect(() => {
    load();
    loadHeldBills();
  }, [load, loadHeldBills]);

  const select = useCallback(
    (product) => {
      if (product.soldByWeight) {
        setScaleProduct(product);
        return;
      }
      addProduct(product, 1);
      beep();
    },
    [addProduct],
  );

  const addByCode = useCallback(
    (code) => {
      const product = lookup(code);
      if (!product) {
        beep(320);
        toast.error(`No product matches “${code}”`);
        return;
      }
      setQuery("");
      select(product);
    },
    [lookup, select],
  );

  useBarcodeScanner(addByCode, {
    enabled: !receipt && !showPayment && !scaleProduct,
  });

  useHotkeys(
    {
      F2: () => searchRef.current?.focus(),
      F4: () =>
        lines.length && holdCurrent().then(() => toast.info("Bill parked")),
      F8: () => lines.length && setShowPayment(true),
      F9: () => setShowHeld(true),
    },
    !receipt,
  );

  const quickKeys = useMemo(
    () => products.filter((p) => p.isQuickKey).slice(0, 12),
    [products],
  );

  const visibleProducts = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    const childIds = new Set(
      categories.filter((c) => c.parentId === category).map((c) => c.id),
    );
    return products.filter((p) => {
      if (category !== "all") {
        const inBranch =
          p.categoryId === category || childIds.has(p.categoryId);
        if (!inBranch) return false;
        if (subCategory !== "all" && p.categoryId !== subCategory) return false;
      }
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase() === term ||
        p.barcode === term
      );
    });
  }, [products, categories, category, subCategory, debouncedQuery]);

  const inCartQty = useMemo(() => {
    const map = new Map();
    lines.forEach((l) =>
      map.set(l.productId, (map.get(l.productId) || 0) + l.quantity),
    );
    return map;
  }, [lines]);

  const onSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const term = query.trim();
    if (!term) return;
    const exact = lookup(term);
    if (exact) {
      setQuery("");
      select(exact);
    } else if (visibleProducts.length === 1) {
      setQuery("");
      select(visibleProducts[0]);
    } else if (!visibleProducts.length) {
      beep(320);
      toast.error(`No product matches “${term}”`);
    }
  };

  const confirmPayment = async (details) => {
    setSubmitting(true);
    try {
      const sale = await completeSale({
        lines,
        billDiscount,
        settings,
        user,
        ...details,
      });
      applySale(
        lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );
      clear();
      setShowPayment(false);
      setShowCart(false);
      setReceipt(sale);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save this bill. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return <Spinner label="Loading the catalog" />;
  if (status === "error") return <ErrorState message={error} onRetry={load} />;

  const totalDue = fromPaise(bill.grandTotal);

  return (
    <div className="flex h-full min-h-0 bg-[#F9FCF9] text-gray-800 font-sans selection:bg-green-200">
      <section className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {/* Glassmorphism Header */}
        <header className="sticky top-0 z-20 border-b border-green-100/60 bg-white/70 px-4 pb-4 pt-5 backdrop-blur-xl sm:px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold tracking-tight text-gray-900">
                {settings?.storeName || "Register"}
              </h1>
              <p className="truncate text-sm font-medium text-gray-500">
                {user?.name}
                {source === "cache" ? " · offline catalog" : ""}
              </p>
            </div>
            <SyncPill onClick={openSync} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowHeld(true)}
              className="relative bg-white border-green-100 text-green-800 hover:bg-green-50 hover:border-green-200 transition-all shadow-sm"
            >
              <LuLayers aria-hidden className="text-green-700" />
              <span className="hidden sm:inline font-medium">Held</span>
              {heldBills.length ? (
                <span className="ml-1 rounded-full bg-green-600 px-2 text-xs font-bold text-white tabular-nums shadow-sm">
                  {heldBills.length}
                </span>
              ) : null}
            </Button>
          </div>

          {/* Search Bar matching the modern rounded aesthetic */}
          <div className="relative mt-4">
            <LuSearch
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-green-700 w-5 h-5"
              aria-hidden
            />
            <input
              ref={searchRef}
              className="w-full h-12 pl-12 pr-12 rounded-full bg-white border border-green-100 shadow-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
              placeholder="Scan barcode or search fresh products..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              aria-label="Scan barcode or search products"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-green-50 hover:text-green-700 transition-colors"
                aria-label="Clear search"
              >
                <LuX aria-hidden className="w-5 h-5" />
              </button>
            ) : (
              <LuScanBarcode
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-green-300 w-5 h-5"
                aria-hidden
              />
            )}
          </div>

          {/* Quick Keys formatted as minimalist pills */}
          {quickKeys.length ? (
            <div
              className="no-scrollbar -mx-4 mt-4 flex gap-2.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
              aria-label="Quick codes"
            >
              {quickKeys.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => select(p)}
                  className="flex items-center h-9 shrink-0 rounded-full bg-white px-4 text-sm font-medium text-gray-700 border border-green-100 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-900"
                >
                  <span className="text-green-600/70 mr-1.5 text-xs tabular-nums font-semibold">
                    #{p.code}
                  </span>{" "}
                  {p.name.split(" ").slice(0, 2).join(" ")}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div
          className={`scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-6 sm:px-6 ${lines.length ? "pb-24 lg:pb-6" : "pb-6"}`}
        >
          <div className="mb-6">
            <CategoryRail
              categories={categories}
              selected={category}
              onSelect={(id) => {
                setCategory(id);
                setSubCategory("all");
              }}
              selectedSub={subCategory}
              onSelectSub={setSubCategory}
            />
          </div>

          {visibleProducts.length ? (
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  inCartQty={inCartQty.get(p.id)}
                  currency={currency}
                  onSelect={select}
                />
              ))}
            </div>
          ) : (
            <div className="mt-12">
              <EmptyState
                icon={LuSearch}
                title="Nothing matches that"
                description={
                  query
                    ? `No fresh products found for “${query}”.`
                    : "This category is empty."
                }
                action={
                  query ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setQuery("")}
                      className="bg-white border-green-200 text-green-800 hover:bg-green-50"
                    >
                      Clear search
                    </Button>
                  ) : null
                }
              />
            </div>
          )}
        </div>
      </section>

      {/* Right Sidebar Cart Panel */}
      <aside className="hidden w-[380px] shrink-0 border-l border-green-100/80 bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.02)] lg:flex xl:w-[420px]">
        <CartPanel
          onCheckout={() => setShowPayment(true)}
          onHold={() => holdCurrent().then(() => toast.info("Bill parked"))}
          onDiscount={() => setShowDiscount(true)}
        />
      </aside>

      {/* Mobile Sticky Cart Button */}
      {lines.length ? (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 px-4 pb-4 md:bottom-0 md:px-6 md:pb-6 lg:hidden">
          <button
            type="button"
            onClick={() => setShowCart(true)}
            aria-label="Open current bill"
            className="flex h-16 w-full items-center gap-4 rounded-2xl bg-green-800 px-6 text-white shadow-[0_8px_30px_rgba(22,101,52,0.3)] transition-transform active:scale-[0.98]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
              <LuShoppingBasket aria-hidden className="w-5 h-5" />
            </span>
            <span className="flex-1 text-left font-medium text-green-50">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            <span className="text-xl font-bold tracking-tight tabular-nums">
              {formatMoney(totalDue, currency)}
            </span>
          </button>
        </div>
      ) : null}

      <Modal
        open={showCart}
        onClose={() => setShowCart(false)}
        title="Current bill"
        size="md"
      >
        <CartPanel
          inSheet
          onCheckout={() => setShowPayment(true)}
          onHold={async () => {
            await holdCurrent();
            setShowCart(false);
            toast.info("Bill parked");
          }}
          onDiscount={() => setShowDiscount(true)}
        />
      </Modal>

      <ScaleModal
        product={scaleProduct}
        currency={currency}
        onClose={() => setScaleProduct(null)}
        onAdd={(product, weight) => {
          addProduct(product, weight);
          setScaleProduct(null);
          beep();
        }}
      />

      <DiscountModal
        open={showDiscount}
        onClose={() => setShowDiscount(false)}
        afterMarkdownsPaise={bill.afterMarkdowns}
        current={billDiscount}
        maxCashierPct={Number(settings?.maxCashierDiscountPct ?? 10)}
        isAdmin={isAdmin}
        currency={currency}
        onApply={(d) => {
          setBillDiscount(d);
          setShowDiscount(false);
        }}
      />

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        total={totalDue}
        itemCount={itemCount}
        settings={settings}
        isAdmin={isAdmin}
        submitting={submitting}
        onConfirm={confirmPayment}
      />

      <HeldBillsModal
        open={showHeld}
        onClose={() => setShowHeld(false)}
        taxRate={Number(settings?.taxRate ?? 0)}
        currency={currency}
      />

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
