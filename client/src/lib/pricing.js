// Mirrors server/src/utils/pricing.js exactly — keep both files identical.
/**
 * Bill calculation engine — shared verbatim by the POS client (client/src/lib/pricing.js)
 * and the API, so a bill rung up offline recomputes to the exact same paise on the server.
 *
 * Order of operations (mirrors the store blueprint):
 *   line subtotal → automatic line markdown → bill discount (allocated across lines) → GST on the remainder
 *
 * All money is handled as integer paise; quantities are rounded to 3 decimals (grams).
 */

export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
export const fromPaise = (paise) => Math.round(paise) / 100;
export const roundQty = (qty) => Math.round(Number(qty || 0) * 1000) / 1000;

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));

/** Split `total` across `weights` proportionally using the largest-remainder method (sums exactly). */
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - floors[i], i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < order.length && remainder > 0; k += 1, remainder -= 1) {
    floors[order[k][1]] += 1;
  }
  return floors;
}

/**
 * @param {object} input
 * @param {Array<{quantity:number, unitPrice:number, discountPercent?:number}>} input.items
 * @param {{type:'PERCENT'|'FLAT', value:number}} [input.billDiscount]
 * @param {number} input.taxRate  e.g. 5 for 5% GST
 */
export function computeBill({ items, billDiscount, taxRate }) {
  const lines = items.map((item) => {
    const quantity = roundQty(item.quantity);
    const unitPaise = toPaise(item.unitPrice);
    const discountPercent = clamp(Number(item.discountPercent || 0), 0, 100);
    const lineSubtotal = Math.round(unitPaise * quantity);
    const lineDiscount = Math.round((lineSubtotal * discountPercent) / 100);
    return { ...item, quantity, discountPercent, lineSubtotal, lineDiscount, afterMarkdown: lineSubtotal - lineDiscount };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
  const itemDiscount = lines.reduce((s, l) => s + l.lineDiscount, 0);
  const afterMarkdowns = subtotal - itemDiscount;

  const type = billDiscount?.type === 'FLAT' ? 'FLAT' : 'PERCENT';
  const value = Math.max(0, Number(billDiscount?.value || 0));
  const billDiscountPaise =
    type === 'PERCENT'
      ? Math.round((afterMarkdowns * clamp(value, 0, 100)) / 100)
      : Math.min(afterMarkdowns, toPaise(value));

  const shares = allocate(billDiscountPaise, lines.map((l) => l.afterMarkdown));
  const finalLines = lines.map((l, i) => ({
    ...l,
    billDiscountShare: shares[i],
    netAmount: l.afterMarkdown - shares[i],
  }));

  const rate = clamp(Number(taxRate || 0), 0, 100);
  const taxableAmount = afterMarkdowns - billDiscountPaise;
  const taxTotal = Math.round((taxableAmount * rate) / 100);
  const grandTotal = taxableAmount + taxTotal;

  return {
    lines: finalLines,
    subtotal,
    itemDiscount,
    billDiscount: billDiscountPaise,
    afterMarkdowns,
    discountTotal: itemDiscount + billDiscountPaise,
    billDiscountEffectivePct: afterMarkdowns > 0 ? (billDiscountPaise / afterMarkdowns) * 100 : 0,
    taxRate: rate,
    taxableAmount,
    taxTotal,
    grandTotal,
  };
}
