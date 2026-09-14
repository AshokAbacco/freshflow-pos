import { formatDateTime, formatQuantity, invoiceLabel } from './format';
import { terminalId, uuid } from './ids';
import { computeBill, fromPaise } from './pricing';
import { enqueueBill, flushOutbox } from './sync';

const WAIT_FOR_INVOICE_MS = 6000;

export function buildReceipt({ payload, bill, lines, settings, cashierName, invoiceNo }) {
  const cgst = Math.floor(bill.taxTotal / 2);
  return {
    clientId: payload.clientId,
    invoiceNo,
    pending: invoiceNo == null,
    reference: invoiceNo != null ? invoiceLabel(invoiceNo) : `Ref ${payload.clientId.slice(0, 8).toUpperCase()}`,
    soldAt: payload.soldAt,
    dateLabel: formatDateTime(payload.soldAt),
    cashierName,
    terminalId: payload.terminalId,
    paymentMethod: payload.paymentMethod,
    amountTendered: payload.amountTendered,
    changeDue: payload.amountTendered != null ? Math.max(0, payload.amountTendered - fromPaise(bill.grandTotal)) : null,
    customerPhone: payload.customerPhone,
    store: settings,
    lines: bill.lines.map((line, i) => ({
      name: lines[i].name,
      quantityLabel: formatQuantity(line.quantity, lines[i].unit, lines[i].soldByWeight),
      unitPrice: Number(line.unitPrice),
      discountPercent: line.discountPercent,
      amount: fromPaise(line.lineSubtotal - line.lineDiscount),
    })),
    totals: {
      subtotal: fromPaise(bill.subtotal),
      itemDiscount: fromPaise(bill.itemDiscount),
      billDiscount: fromPaise(bill.billDiscount),
      discountTotal: fromPaise(bill.discountTotal),
      taxRate: bill.taxRate,
      taxableAmount: fromPaise(bill.taxableAmount),
      cgst: fromPaise(cgst),
      sgst: fromPaise(bill.taxTotal - cgst),
      taxTotal: fromPaise(bill.taxTotal),
      grandTotal: fromPaise(bill.grandTotal),
    },
  };
}

/**
 * Complete a sale: persist the bill to the IndexedDB outbox first, then try to upload it.
 * The sale is final as soon as it is in the outbox — the receipt shows a provisional reference
 * until the server assigns an invoice number.
 */
export async function completeSale({ lines, billDiscount, settings, user, paymentMethod, amountTendered, customerPhone }) {
  const taxRate = Number(settings?.taxRate ?? 0);
  const bill = computeBill({ items: lines, billDiscount, taxRate });
  const hasBillDiscount = bill.billDiscount > 0;

  const payload = {
    clientId: uuid(),
    terminalId: terminalId(),
    cashierId: user.id,
    soldAt: new Date().toISOString(),
    paymentMethod,
    customerPhone: customerPhone?.trim() || null,
    amountTendered: paymentMethod === 'CASH' && amountTendered !== '' && amountTendered != null ? Math.round(Number(amountTendered) * 100) / 100 : null,
    taxRate,
    billDiscount: hasBillDiscount
      ? { type: billDiscount.type, value: Number(billDiscount.value), reason: billDiscount.reason?.trim() || null }
      : { type: 'PERCENT', value: 0 },
    grandTotal: fromPaise(bill.grandTotal),
    wasOffline: !navigator.onLine,
    items: lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      discountPercent: Number(l.discountPercent || 0),
    })),
  };

  await enqueueBill(payload);

  const synced = await Promise.race([
    flushOutbox(),
    new Promise((resolve) => setTimeout(() => resolve([]), WAIT_FOR_INVOICE_MS)),
  ]);
  const result = synced.find((r) => r.clientId === payload.clientId);

  return buildReceipt({ payload, bill, lines, settings, cashierName: user.name, invoiceNo: result?.invoiceNo ?? null });
}

export function receiptToWhatsAppText(r) {
  const cur = (n) => `Rs.${Number(n).toFixed(2)}`;
  const rows = r.lines.map((l) => `${l.name}\n  ${l.quantityLabel} x ${cur(l.unitPrice)} = ${cur(l.amount)}`);
  return [
    `*${r.store?.storeName ?? 'Receipt'}*`,
    `${r.reference}, ${r.dateLabel}`,
    '',
    ...rows,
    '',
    `Subtotal: ${cur(r.totals.subtotal)}`,
    r.totals.discountTotal ? `You saved: ${cur(r.totals.discountTotal)}` : null,
    `GST ${r.totals.taxRate}%: ${cur(r.totals.taxTotal)}`,
    `*Total: ${cur(r.totals.grandTotal)}* (${r.paymentMethod})`,
    '',
    r.store?.receiptFooter || 'Thank you for shopping with us.',
  ]
    .filter((x) => x !== null)
    .join('\n');
}

export function whatsappLink(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
