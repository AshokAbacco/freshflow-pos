import { create } from 'zustand';
import { api, errorMessage } from '../lib/api';
import { idb } from '../lib/idb';
import { roundQty } from '../lib/pricing';

const CACHE_KEY = 'catalog-v1';

function indexProducts(products) {
  const byBarcode = new Map();
  const byCode = new Map();
  for (const p of products) {
    if (p.barcode) byBarcode.set(p.barcode, p);
    byCode.set(p.code.toLowerCase(), p);
  }
  return { byBarcode, byCode };
}

export const useCatalogStore = create((set, get) => ({
  products: [],
  categories: [],
  settings: null,
  status: 'idle', // idle | loading | ready | error
  source: null, // network | cache
  error: null,
  loadedAt: null,
  _index: { byBarcode: new Map(), byCode: new Map() },

  /** Network first; fall back to the last snapshot in IndexedDB so the register keeps working offline. */
  async load({ silent = false } = {}) {
    if (!silent) set({ status: get().products.length ? 'ready' : 'loading', error: null });
    try {
      const [products, categories, settings] = await Promise.all([
        api.get('/products/catalog'),
        api.get('/categories'),
        api.get('/settings'),
      ]);
      const snapshot = {
        products: products.data.products,
        categories: categories.data.categories,
        settings: settings.data.settings,
        loadedAt: Date.now(),
      };
      set({ ...snapshot, _index: indexProducts(snapshot.products), status: 'ready', source: 'network', error: null });
      idb.put('cache', snapshot, CACHE_KEY).catch(() => {});
    } catch (err) {
      const cached = await idb.get('cache', CACHE_KEY).catch(() => null);
      if (cached) {
        set({ ...cached, _index: indexProducts(cached.products), status: 'ready', source: 'cache', error: errorMessage(err) });
      } else {
        set({ status: 'error', error: errorMessage(err) });
      }
    }
  },

  /** Exact lookup for scanners and typed codes: barcode, product code, or "#101". */
  lookup(input) {
    const term = String(input || '').trim().replace(/^#/, '');
    if (!term) return null;
    const { byBarcode, byCode } = get()._index;
    return byBarcode.get(term) || byCode.get(term.toLowerCase()) || null;
  },

  /** Reflect a sale locally so stock badges stay honest while offline. */
  applySale(lines) {
    const sold = new Map();
    lines.forEach((l) => sold.set(l.productId, (sold.get(l.productId) || 0) + l.quantity));
    const products = get().products.map((p) => (sold.has(p.id) ? { ...p, stock: roundQty(p.stock - sold.get(p.id)) } : p));
    set({ products, _index: indexProducts(products) });
    idb.put('cache', { products, categories: get().categories, settings: get().settings, loadedAt: get().loadedAt }, CACHE_KEY).catch(() => {});
  },
}));
