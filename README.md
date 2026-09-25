# FreshFlow — grocery POS and back office

A till that keeps selling when the internet drops, and a back office that answers "how did today go?"

- **Public site**: landing page, pricing, and sign-up that creates a store with a one-month free trial.
- **Register** (cashiers and admins): barcode scanning, quick codes, category browsing, weighing-scale support, held bills, cash/UPI/card payment, printed and WhatsApp receipts.
- **Back office** (admins only): daily business report, category and product analytics, bill ledger with voids, inventory, categories, stock ledger, team management, and billing.

Bills completed during an outage are stored on the till and upload on their own once the connection returns. Nothing is lost and nothing is counted twice.

## Multiple stores on one deployment

Every business is an **organization**. Users, categories, products, bills, stock and settings all belong to one, and every query is filtered by it, so two stores on the same server never see each other's data. Invoice numbers run 1, 2, 3… separately for each store.

Anyone can create a store from `/signup`; the first account becomes its admin. Staff are then invited from Settings › Team, and each active account uses one seat on the plan.

| Route | Who |
| --- | --- |
| `/` | Landing page, public |
| `/pricing` | Plans and seat calculator, public |
| `/signup` | Create a store, public |
| `/login` | Sign in |
| `/app` | Register (cashiers and admins) |
| `/app/reports`, `/app/inventory`, `/app/billing`, `/app/settings` | Admins only |

## Plans and payment

Prices are per staff account, per month, in rupees:

| Plan | Monthly | Yearly (billed 12 months up front) |
| --- | --- | --- |
| Free trial | ₹0 for 30 days, up to 3 users | — |
| Standard | ₹850, **₹650** after the launch discount | ₹650, **₹550** after the launch discount |
| Custom | ₹1,300, **₹1,000** after the launch discount | ₹1,000, **₹800** after the launch discount |

Change the catalogue in `server/src/config/plans.js`; the pricing page, the billing page and the amount charged all read from it, so they can never disagree.

Payment goes through **Razorpay**. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `server/.env` to switch it on; without them the Billing page says payments are not configured and everything else still works. Add a webhook in the Razorpay dashboard pointing at `https://your-api/api/billing/webhook` (events `payment.captured` and `payment.failed`) with `RAZORPAY_WEBHOOK_SECRET` set, so a payment still lands if the customer closes the browser mid-way.

Payments are only trusted after the signature check: the handover from checkout is verified as HMAC-SHA256 of `order_id|payment_id`, and webhooks are verified against the exact raw request body. A forged or replayed signature never changes a plan.

**When a trial or plan ends**, the store keeps its data and cashiers keep billing — queued bills still upload, because they describe sales that already happened. What pauses is adding products, categories and staff, until a plan is chosen in Billing.

## Categories are yours to build

Admins manage the category tree from Inventory › Categories: add a department such as **Meat**, give it an icon, and add sub-categories such as Poultry or Mutton under it. Cashiers browse those on the register straight away. A category that holds products, sub-categories, or appears on past bills is kept rather than deleted, so old receipts and reports stay accurate.

## Requirements

- Node.js 20.19 or newer
- PostgreSQL 14 or newer (or Docker, see below)

## Getting started

```bash
# 1. Install both apps
npm run setup

# 2. Start PostgreSQL (skip if you already have one running)
docker compose up -d

# 3. Configure the API
cd server
cp .env.example .env
#    Edit .env and set JWT_SECRET to a long random string:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Create the tables and load the starter catalog
npm run db:deploy
npm run db:seed

# 5. Configure the web app
cd ../client
cp .env.example .env

# 6. Run both (in separate terminals, from the project root)
npm run dev:server     # http://localhost:4000
npm run dev:client     # http://localhost:5173
```

Open http://localhost:5173 and sign in with the accounts printed by the seed:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@freshflow.local` | `Admin@12345` |
| Cashier | `cashier@freshflow.local` | `Cashier@12345` |

Change both passwords after the first sign-in (Settings › Team). The seed only creates accounts that don't already exist, so it is safe to re-run.

## What each role can do

| Area | Cashier | Admin |
| --- | --- | --- |
| Register, scanning, scale, held bills, payments | Yes | Yes |
| Billing and plan changes | No | Yes |
| Categories | No | Yes |
| Bill discounts | Up to the configured limit (10% by default) | Any amount |
| Daily business report and analytics | No | Yes |
| Bill ledger and voids | No | Yes |
| Inventory and stock ledger | No | Yes |
| Store settings and team | No | Yes |

Roles are enforced by the API, not just hidden in the interface: every restricted endpoint checks the role claim on the signed token against the account in the database, so a cashier's token cannot reach a report even if the request is made by hand. Changing someone's role or deactivating them takes effect on their next request.

## How offline selling works

1. A completed bill is written to IndexedDB on the till before anything else. At that point the sale is safe.
2. The till tries to upload it. If that fails, the bill stays queued and retries on reconnect, every 30 seconds, and whenever the tab regains focus.
3. Each bill carries a `clientId` generated on the till. The server treats a repeat upload of the same `clientId` as a duplicate and returns the original invoice, so retries never double-count revenue or stock.
4. The server recalculates every bill from the items and rejects it if the total doesn't match, so a stale price list on a till cannot book the wrong revenue.

The sync panel (the status pill in any page header) shows what is waiting, what failed and why, and lets you retry or discard individual bills.

Money is handled as whole paise everywhere, in one shared calculation used by both the till and the server (`client/src/lib/pricing.js` and `server/src/utils/pricing.js` are the same file). Bill discounts are spread across lines with the largest-remainder method, so line amounts always add back up to the bill total exactly.

## Hardware

Weighing scales and receipt printers connect over the Web Serial API, which needs Chrome or Edge on a computer and a secure context (`https://` or `localhost`). Connect them in Settings › Hardware.

- **Scale**: reads continuous output over USB or RS-232 and handles the common formats (`ST,GS,+ 1.250kg`, grams, pounds). Without a scale, the weigh dialog accepts manual entry with tare and ±250 g buttons.
- **Printer**: prints 80 mm ESC/POS receipts. Without one, the browser print dialog produces the same receipt on any printer.

UPI QR codes are generated on the till from the store's UPI ID (Settings › Payments) using the standard `upi://pay` format, so any UPI app can scan them. Until a UPI ID is set, the payment screen says so and cash or card still work.

## Reports

Reports always compare the selected period against the period of equal length immediately before it. Days are the store's local days: set `REPORT_TIMEZONE` in `server/.env` to the store's timezone (`Asia/Kolkata` by default) and the bucketing stays correct regardless of where the server runs.

The category chart is built for large catalogs. Up to 40 categories it draws labelled rows; beyond that it packs one bar per category into a compact grid on a square-root scale, so a thousand-plus categories stay readable and comparable in a few hundred pixels instead of a thousand table rows. Verified at 1,207 categories, where the query returns in about 120 ms.

To try that scale yourself:

```bash
cd server
STRESS_CATEGORIES=1200 STRESS_BILLS=4000 npm run db:seed:stress
```

That script refuses to run with `NODE_ENV=production`. It writes through the same code path as a real sale, so the numbers it produces are internally consistent.

## Tests

```bash
cd server && npm test
```

Covers the bill engine: markdowns, percentage and flat discounts, the discount allocation adding up exactly, GST rounding, and gram-level quantity rounding.

## Deploying

Build the web app and serve `client/dist` as static files:

```bash
cd client && npm run build
```

Point the web server at the API under `/api` (the same-origin setup the app expects), or set `VITE_API_URL` at build time if the API lives elsewhere. On the API set `NODE_ENV=production`, a `JWT_SECRET` of at least 32 characters, `CORS_ORIGIN` to the site's URL, and `TRUST_PROXY=true` behind nginx or a load balancer. Run migrations with `npm run db:deploy`.

The web app registers a service worker in production builds so a till can reload during an outage and still open.

## Regenerating the project

`build-zip.js` contains the whole workspace inline. Running it writes a fresh copy of every file:

```bash
node build-zip.js                # writes ./freshflow-pos (and a zip if `archiver` is installed)
node build-zip.js --out ./target # write it somewhere else
node build-zip.js --no-zip       # skip the archive
```

It never touches `node_modules`, `dist` or your `.env`, so it is a clean way to restore a file you edited by accident.

## Project layout

```
server/
  prisma/schema.prisma        Database schema
  prisma/migrations/          SQL migrations
  prisma/seed.js              Store profile, accounts, catalog
  prisma/stress-seed.js       Load-test data generator
  src/routes/                 HTTP endpoints, one file per resource
  src/services/               Bill ingest, voids, reporting queries
  src/middleware/auth.js      Token verification and role checks
  src/utils/pricing.js        Bill calculation (shared with the client)
client/
  src/pages/                  Register, reports, inventory, settings, login
  src/components/pos/         Cart, scale, payment, receipt, held bills
  src/components/charts/      Trend, payment split, category density
  src/lib/sync.js             Outbox queue and upload engine
  src/lib/idb.js              IndexedDB wrapper
  src/store/                  Zustand stores
```

## Notes

- The starter catalog uses Unsplash image URLs. If they are blocked or slow on your network, products fall back to a lettered tile; replace the URLs in Settings or per product.
- Deactivating a product hides it from tills but keeps it on past bills, so old receipts and reports stay accurate. The same applies to categories that appear on past bills.
- Voiding a bill returns its items to stock and records the reason against it; nothing is deleted.
