// Stand-in for api.razorpay.com used to exercise the billing flow end to end.
// Mirrors the real API's shapes for orders, payment fetch and capture.
import http from 'node:http';

const orders = new Map();
const payments = new Map();
let seq = 0;

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = req.url;

    if (!req.headers.authorization?.startsWith('Basic ')) return json(res, 401, { error: { description: 'auth missing' } });

    if (req.method === 'POST' && url === '/v1/orders') {
      seq += 1;
      // Unique across restarts, so re-running the suite does not collide with stored orders.
      const order = { id: `order_MOCK${Date.now().toString(36)}${seq}`, amount: body.amount, currency: body.currency, receipt: body.receipt, notes: body.notes, status: 'created' };
      orders.set(order.id, order);
      return json(res, 200, order);
    }

    const captureMatch = url.match(/^\/v1\/payments\/([^/]+)\/capture$/);
    if (req.method === 'POST' && captureMatch) {
      const p = payments.get(captureMatch[1]);
      if (!p) return json(res, 400, { error: { description: 'payment not found' } });
      if (Number(body.amount) !== Number(p.amount)) {
        return json(res, 400, { error: { description: 'capture amount mismatch' } });
      }
      p.status = 'captured';
      return json(res, 200, p);
    }

    const fetchMatch = url.match(/^\/v1\/payments\/([^/]+)$/);
    if (req.method === 'GET' && fetchMatch) {
      const p = payments.get(fetchMatch[1]);
      if (!p) return json(res, 400, { error: { description: 'payment not found' } });
      return json(res, 200, p);
    }

    return json(res, 404, { error: { description: `no mock route for ${req.method} ${url}` } });
  });
});

// Test harness control plane: create a payment in a chosen state.
server.on('request', () => {});
export function addPayment({ id, orderId, amount, status = 'authorized', method = 'upi', currency = 'INR' }) {
  payments.set(id, { id, order_id: orderId, amount, currency, status, method });
}

const PORT = Number(process.env.MOCK_PORT || 4499);
server.listen(PORT);

// Simple control endpoint so the test script can stage payments.
const control = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    if (req.method === 'POST' && req.url === '/stage') {
      addPayment(body);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/state') {
      return json(res, 200, { payments: [...payments.values()], orders: [...orders.values()] });
    }
    return json(res, 404, {});
  });
});
control.listen(PORT + 1);
console.log(`mock razorpay on ${PORT}, control on ${PORT + 1}`);
