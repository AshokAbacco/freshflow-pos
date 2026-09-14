import { useMemo } from 'react';
import { computeBill } from '../lib/pricing';
import { useCartStore } from '../store/cartStore';
import { useCatalogStore } from '../store/catalogStore';

export function useBill() {
  const lines = useCartStore((s) => s.lines);
  const billDiscount = useCartStore((s) => s.billDiscount);
  const settings = useCatalogStore((s) => s.settings);
  const taxRate = Number(settings?.taxRate ?? 0);
  const bill = useMemo(() => computeBill({ items: lines, billDiscount, taxRate }), [lines, billDiscount, taxRate]);
  const itemCount = lines.reduce((n, l) => n + (l.soldByWeight ? 1 : l.quantity), 0);
  return { lines, billDiscount, bill, itemCount, settings, currency: settings?.currency || 'INR' };
}
