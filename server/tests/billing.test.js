import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { PLANS, quote } from '../src/config/plans.js';
import { subscriptionActive, verifyPaymentSignature, verifyWebhookSignature } from '../src/services/billing.service.js';

const SECRET = 'rzp_test_secret_value';

test('published pricing matches the plan sheet', () => {
  assert.deepEqual(PLANS.STANDARD.intervals.MONTHLY, { listPrice: 850, price: 650 });
  assert.deepEqual(PLANS.STANDARD.intervals.YEARLY, { listPrice: 650, price: 550 });
  assert.deepEqual(PLANS.CUSTOM.intervals.MONTHLY, { listPrice: 1300, price: 1000 });
  assert.deepEqual(PLANS.CUSTOM.intervals.YEARLY, { listPrice: 1000, price: 800 });
});

test('quotes multiply by seats, and yearly bills twelve months up front', () => {
  const monthly = quote({ plan: 'STANDARD', interval: 'MONTHLY', seats: 4 });
  assert.equal(monthly.total, 650 * 4);
  assert.equal(monthly.listTotal, 850 * 4);
  assert.equal(monthly.savings, 200 * 4);

  const yearly = quote({ plan: 'CUSTOM', interval: 'YEARLY', seats: 3 });
  assert.equal(yearly.months, 12);
  assert.equal(yearly.total, 800 * 3 * 12);
  assert.equal(yearly.savings, 200 * 3 * 12);
});

test('seat counts are clamped to the allowed range', () => {
  assert.equal(quote({ plan: 'STANDARD', interval: 'MONTHLY', seats: 0 }).seats, 1);
  assert.equal(quote({ plan: 'STANDARD', interval: 'MONTHLY', seats: 10_000 }).seats, 500);
});

test('a genuine Razorpay payment signature verifies', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';
  const signature = crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature }, SECRET), true);
});

test('tampered, swapped or missing payment signatures are rejected', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';
  const good = crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: `${good.slice(0, -1)}0` }, SECRET), false);
  assert.equal(verifyPaymentSignature({ orderId: 'order_OTHER', paymentId, signature: good }, SECRET), false);
  assert.equal(verifyPaymentSignature({ orderId, paymentId: 'pay_OTHER', signature: good }, SECRET), false);
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: good }, 'wrong-secret'), false);
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: '' }, SECRET), false);
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: good }, ''), false);
});

test('webhook signatures cover the exact raw body', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature, SECRET), true);
  assert.equal(verifyWebhookSignature(Buffer.from(`${body.toString()} `), signature, SECRET), false);
  assert.equal(verifyWebhookSignature(body, 'deadbeef', SECRET), false);
});

test('access follows the trial and paid period', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  assert.equal(subscriptionActive({ status: 'TRIALING', trialEndsAt: future }), true);
  assert.equal(subscriptionActive({ status: 'TRIALING', trialEndsAt: past }), false);
  assert.equal(subscriptionActive({ status: 'ACTIVE', currentPeriodEnd: future }), true);
  assert.equal(subscriptionActive({ status: 'ACTIVE', currentPeriodEnd: past }), false);
  assert.equal(subscriptionActive({ status: 'CANCELLED', currentPeriodEnd: future }), false);
  assert.equal(subscriptionActive(null), false);
});
