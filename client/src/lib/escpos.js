/**
 * Minimal ESC/POS encoder for 80 mm (48-column) thermal printers connected over Web Serial / USB-serial.
 * Only ASCII is sent; the rupee sign is written as "Rs." since most printer code pages lack it.
 */
const ESC = 0x1b;
const GS = 0x1d;
const COLS = 48;

const ascii = (text) => String(text).normalize('NFKD').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '');

export class EscPosBuilder {
  constructor() {
    this.bytes = [ESC, 0x40]; // initialise printer
  }
  raw(...b) { this.bytes.push(...b); return this; }
  align(where) { return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[where] ?? 0); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  doubleHeight(on) { return this.raw(GS, 0x21, on ? 0x01 : 0x00); }
  text(line = '') { for (const ch of ascii(line)) this.bytes.push(ch.charCodeAt(0)); return this.raw(0x0a); }
  rule(char = '-') { return this.text(char.repeat(COLS)); }
  pair(left, right) {
    const l = ascii(left);
    const r = ascii(right);
    const space = Math.max(1, COLS - l.length - r.length);
    return this.text(`${l.slice(0, COLS - r.length - 1)}${' '.repeat(space)}${r}`);
  }
  feed(lines = 3) { return this.raw(ESC, 0x64, lines); }
  cut() { return this.raw(GS, 0x56, 0x42, 0x00); }
  build() { return new Uint8Array(this.bytes); }
}

const rs = (n) => `Rs.${Number(n).toFixed(2)}`;

export function receiptToEscPos(receipt) {
  const { store, lines, totals } = receipt;
  const p = new EscPosBuilder().align('center').bold(true).doubleHeight(true).text(store.storeName).doubleHeight(false).bold(false);
  if (store.address) p.text(store.address);
  if (store.gstin) p.text(`GSTIN ${store.gstin}`);
  if (store.phone) p.text(`Ph ${store.phone}`);
  p.align('left').rule();
  p.pair(receipt.reference, receipt.dateLabel);
  p.text(`Cashier ${receipt.cashierName}   ${receipt.terminalId}`);
  p.rule();
  for (const line of lines) {
    p.text(line.name.slice(0, COLS));
    p.pair(`  ${line.quantityLabel} x ${rs(line.unitPrice)}${line.discountPercent ? ` (-${line.discountPercent}%)` : ''}`, rs(line.amount));
  }
  p.rule();
  p.pair('Subtotal', rs(totals.subtotal));
  if (totals.discountTotal) p.pair('Discounts', `-${rs(totals.discountTotal)}`);
  p.pair(`CGST ${totals.taxRate / 2}%`, rs(totals.cgst));
  p.pair(`SGST ${totals.taxRate / 2}%`, rs(totals.sgst));
  p.bold(true).pair('TOTAL', rs(totals.grandTotal)).bold(false);
  p.pair(`Paid by ${receipt.paymentMethod}`, receipt.amountTendered ? rs(receipt.amountTendered) : rs(totals.grandTotal));
  if (receipt.changeDue) p.pair('Change', rs(receipt.changeDue));
  p.rule().align('center');
  if (store.receiptFooter) p.text(store.receiptFooter);
  if (receipt.pending) p.text('Bill saved offline - syncs automatically');
  return p.feed(4).cut().build();
}
