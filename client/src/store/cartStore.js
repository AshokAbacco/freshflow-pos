import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idb } from '../lib/idb';
import { uuid } from '../lib/ids';
import { roundQty } from '../lib/pricing';

const EMPTY_DISCOUNT = { type: 'PERCENT', value: 0, reason: '' };

const lineFromProduct = (product, quantity) => ({
  lineId: uuid(),
  productId: product.id,
  code: product.code,
  name: product.name,
  unit: product.unit,
  soldByWeight: product.soldByWeight,
  unitPrice: product.price,
  discountPercent: product.discountPercent || 0,
  imageUrl: product.imageUrl,
  categoryId: product.categoryId,
  quantity,
});

export const useCartStore = create(
  persist(
    (set, get) => ({
      lines: [],
      billDiscount: EMPTY_DISCOUNT,
      lastAddedLineId: null,
      heldBills: [],

      /** Piece items merge into one line; each weighing becomes its own line (like a printed scale label). */
      addProduct(product, quantity = 1) {
        const qty = roundQty(quantity);
        if (qty <= 0) return;
        const lines = get().lines;
        if (!product.soldByWeight) {
          const existing = lines.find((l) => l.productId === product.id);
          if (existing) {
            set({ lines: lines.map((l) => (l.lineId === existing.lineId ? { ...l, quantity: l.quantity + qty } : l)), lastAddedLineId: existing.lineId });
            return;
          }
        }
        const line = lineFromProduct(product, qty);
        set({ lines: [line, ...lines], lastAddedLineId: line.lineId });
      },

      setQuantity(lineId, quantity) {
        const qty = roundQty(quantity);
        if (qty <= 0) return get().removeLine(lineId);
        set({ lines: get().lines.map((l) => (l.lineId === lineId ? { ...l, quantity: qty } : l)) });
      },

      removeLine(lineId) {
        set({ lines: get().lines.filter((l) => l.lineId !== lineId) });
      },

      setBillDiscount(discount) {
        set({ billDiscount: { ...EMPTY_DISCOUNT, ...discount } });
      },

      clear() {
        set({ lines: [], billDiscount: EMPTY_DISCOUNT, lastAddedLineId: null });
      },

      async loadHeldBills() {
        const bills = await idb.getAll('heldBills').catch(() => []);
        set({ heldBills: bills.sort((a, b) => b.heldAt - a.heldAt) });
      },

      async holdCurrent(label) {
        const { lines, billDiscount } = get();
        if (!lines.length) return null;
        const bill = { id: uuid(), label: label?.trim() || `Bill ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, lines, billDiscount, heldAt: Date.now() };
        await idb.put('heldBills', bill);
        get().clear();
        await get().loadHeldBills();
        return bill;
      },

      /** Resume a parked bill. If a bill is in progress, it is parked first so nothing is lost. */
      async resumeHeld(id) {
        const bill = get().heldBills.find((b) => b.id === id);
        if (!bill) return;
        if (get().lines.length) await get().holdCurrent('Swapped bill');
        await idb.delete('heldBills', id);
        set({ lines: bill.lines, billDiscount: bill.billDiscount || EMPTY_DISCOUNT, lastAddedLineId: null });
        await get().loadHeldBills();
      },

      async discardHeld(id) {
        await idb.delete('heldBills', id);
        await get().loadHeldBills();
      },
    }),
    {
      name: 'ff_cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines, billDiscount: s.billDiscount }),
    },
  ),
);
