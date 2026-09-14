import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LuLayers, LuScanBarcode, LuSearch, LuShoppingBasket, LuX } from 'react-icons/lu';
import { SyncPill } from '../components/layout/AppShell';
import { CartPanel } from '../components/pos/CartPanel';
import { CategoryRail } from '../components/pos/CategoryRail';
import { DiscountModal } from '../components/pos/DiscountModal';
import { HeldBillsModal } from '../components/pos/HeldBillsModal';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ProductCard } from '../components/pos/ProductCard';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { ScaleModal } from '../components/pos/ScaleModal';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState, ErrorState, Spinner } from '../components/ui/States';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useBill } from '../hooks/useBill';
import { useDebounce } from '../hooks/useDebounce';
import { useHotkeys } from '../hooks/useHotkeys';
import { completeSale } from '../lib/checkout';
import { errorMessage } from '../lib/api';
import { formatMoney } from '../lib/format';
import { fromPaise } from '../lib/pricing';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useCatalogStore } from '../store/catalogStore';
import { toast } from '../store/toastStore';

function beep(frequency = 1760) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
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
  const isAdmin = user?.role === 'ADMIN';
  const { products, categories, settings, status, source, error, load, lookup, applySale } = useCatalogStore();
  const { lines, billDiscount, bill, itemCount, currency } = useBill();
  const { addProduct, clear, holdCurrent, loadHeldBills, heldBills, setBillDiscount } = useCartStore();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [subCategory, setSubCategory] = useState('all');
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
      setQuery('');
      select(product);
    },
    [lookup, select],
  );

  useBarcodeScanner(addByCode, { enabled: !receipt && !showPayment && !scaleProduct });

  useHotkeys(
    {
      F2: () => searchRef.current?.focus(),
      F4: () => lines.length && holdCurrent().then(() => toast.info('Bill parked')),
      F8: () => lines.length && setShowPayment(true),
      F9: () => setShowHeld(true),
    },
    !receipt,
  );

  const quickKeys = useMemo(() => products.filter((p) => p.isQuickKey).slice(0, 12), [products]);

  const visibleProducts = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    const childIds = new Set(categories.filter((c) => c.parentId === category).map((c) => c.id));
    return products.filter((p) => {
      if (category !== 'all') {
        const inBranch = p.categoryId === category || childIds.has(p.categoryId);
        if (!inBranch) return false;
        if (subCategory !== 'all' && p.categoryId !== subCategory) return false;
      }
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.code.toLowerCase() === term || p.barcode === term;
    });
  }, [products, categories, category, subCategory, debouncedQuery]);

  const inCartQty = useMemo(() => {
    const map = new Map();
    lines.forEach((l) => map.set(l.productId, (map.get(l.productId) || 0) + l.quantity));
    return map;
  }, [lines]);

  const onSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const term = query.trim();
    if (!term) return;
    const exact = lookup(term);
    if (exact) {
      setQuery('');
      select(exact);
    } else if (visibleProducts.length === 1) {
      setQuery('');
      select(visibleProducts[0]);
    } else if (!visibleProducts.length) {
      beep(320);
      toast.error(`No product matches “${term}”`);
    }
  };

  const confirmPayment = async (details) => {
    setSubmitting(true);
    try {
      const sale = await completeSale({ lines, billDiscount, settings, user, ...details });
      applySale(lines.map((l) => ({ productId: l.productId, quantity: l.quantity })));
      clear();
      setShowPayment(false);
      setShowCart(false);
      setReceipt(sale);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this bill. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') return <Spinner label="Loading the catalog" />;
  if (status === 'error') return <ErrorState message={error} onRetry={load} />;

  const totalDue = fromPaise(bill.grandTotal);

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/85 px-4 pb-3 pt-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate">{settings?.storeName || 'Register'}</h1>
              <p className="truncate text-desc text-slate-500">
                {user?.name}
                {source === 'cache' ? ' · offline catalog' : ''}
              </p>
            </div>
            <SyncPill onClick={openSync} />
            <Button variant="secondary" size="sm" onClick={() => setShowHeld(true)} className="relative">
              <LuLayers aria-hidden />
              <span className="hidden sm:inline">Held</span>
              {heldBills.length ? (
                <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 text-desc font-semibold text-white tabular">{heldBills.length}</span>
              ) : null}
            </Button>
          </div>

          <div className="relative mt-3">
            <LuSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={searchRef}
              className="field h-11 pl-10 pr-10"
              placeholder="Scan barcode or search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              aria-label="Scan barcode or search products"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
                aria-label="Clear search"
              >
                <LuX aria-hidden />
              </button>
            ) : (
              <LuScanBarcode className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300" aria-hidden />
            )}
          </div>

          {quickKeys.length ? (
            <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6" aria-label="Quick codes">
              {quickKeys.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => select(p)}
                  className="h-8 shrink-0 rounded-full bg-white px-3 text-desc font-medium text-slate-700 ring-1 ring-slate-200 transition hover:ring-brand/50"
                >
                  <span className="text-slate-400 tabular">#{p.code}</span> {p.name.split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className={`scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-4 sm:px-6 ${lines.length ? "pb-24 lg:pb-4" : "pb-4"}`}>
          <CategoryRail
            categories={categories}
            selected={category}
            onSelect={(id) => {
              setCategory(id);
              setSubCategory('all');
            }}
            selectedSub={subCategory}
            onSelectSub={setSubCategory}
          />

          {visibleProducts.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {visibleProducts.map((p) => (
                <ProductCard key={p.id} product={p} inCartQty={inCartQty.get(p.id)} currency={currency} onSelect={select} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={LuSearch}
              title="Nothing matches that"
              description={query ? `No products found for “${query}”.` : 'This category has no products yet.'}
              action={
                query ? (
                  <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : null
              }
            />
          )}
        </div>
      </section>

      {/* Bill panel: docked on large screens, bottom sheet on phones and tablets */}
      <aside className="hidden w-[380px] shrink-0 border-l border-slate-200/80 bg-white lg:flex xl:w-[420px]">
        <CartPanel onCheckout={() => setShowPayment(true)} onHold={() => holdCurrent().then(() => toast.info('Bill parked'))} onDiscount={() => setShowDiscount(true)} />
      </aside>

      {lines.length ? (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 px-4 pb-3 md:bottom-0 md:px-6 md:pb-4 lg:hidden">
          <button
            type="button"
            onClick={() => setShowCart(true)}
            aria-label="Open current bill"
            className="flex h-14 w-full items-center gap-3 rounded-full bg-brand px-5 text-white shadow-lift"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20">
              <LuShoppingBasket aria-hidden />
            </span>
            <span className="flex-1 text-left font-semibold">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
            <span className="text-h2 font-bold tabular">{formatMoney(totalDue, currency)}</span>
          </button>
        </div>
      ) : null}

      <Modal open={showCart} onClose={() => setShowCart(false)} title="Current bill" size="md">
        <CartPanel
          inSheet
          onCheckout={() => setShowPayment(true)}
          onHold={async () => {
            await holdCurrent();
            setShowCart(false);
            toast.info('Bill parked');
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

      <HeldBillsModal open={showHeld} onClose={() => setShowHeld(false)} taxRate={Number(settings?.taxRate ?? 0)} currency={currency} />

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
