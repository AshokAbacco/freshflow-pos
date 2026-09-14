import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocate, computeBill } from '../src/utils/pricing.js';

test('allocate distributes remainders so parts always sum to the total', () => {
  const parts = allocate(100, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(parts, [34, 33, 33]);
  assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
});

test('weighed produce with markdown, bill discount and GST', () => {
  const bill = computeBill({
    items: [
      { productId: 'a', quantity: 1.25, unitPrice: 160, discountPercent: 0 }, // 200.00
      { productId: 'b', quantity: 1, unitPrice: 48, discountPercent: 20 }, // 48.00 − 9.60
    ],
    billDiscount: { type: 'PERCENT', value: 10 },
    taxRate: 5,
  });
  assert.equal(bill.subtotal, 24800);
  assert.equal(bill.itemDiscount, 960);
  assert.equal(bill.billDiscount, 2384); // 10% of 238.40
  assert.equal(bill.taxableAmount, 21456);
  assert.equal(bill.taxTotal, 1073); // 5% of 214.56 = 10.728
  assert.equal(bill.grandTotal, 22529);
  assert.equal(bill.lines.reduce((s, l) => s + l.netAmount, 0), bill.taxableAmount);
});

test('flat discount cannot exceed the bill', () => {
  const bill = computeBill({ items: [{ quantity: 2, unitPrice: 10 }], billDiscount: { type: 'FLAT', value: 500 }, taxRate: 5 });
  assert.equal(bill.billDiscount, 2000);
  assert.equal(bill.grandTotal, 0);
});

test('floating point quantities round to grams', () => {
  const bill = computeBill({ items: [{ quantity: 0.1 + 0.2, unitPrice: 99.99 }], taxRate: 0 });
  assert.equal(bill.lines[0].quantity, 0.3);
  assert.equal(bill.grandTotal, 3000); // 99.99 × 0.3 = 29.997 → 30.00
});
