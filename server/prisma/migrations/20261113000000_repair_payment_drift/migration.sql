-- Repairs drift between schema.prisma and the committed migrations.
--
-- schema.prisma declares the WebhookEvent model and four payment columns that no migration
-- ever created, so a database built only from `prisma migrate deploy` is missing them. The
-- Razorpay webhook handler and the capture check both write to them, so on such a database
-- those paths fail at runtime. The Platform Admin panel's Payments and Webhooks screens read
-- the same columns.
--
-- Safe to run on a database that already has them: every statement is conditional.

-- Razorpay retries an un-acknowledged webhook for up to 24 hours, so event_id being unique
-- is what stops a retry from being applied twice.
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id"          TEXT         NOT NULL,
    "event_id"    TEXT         NOT NULL,
    "event"       TEXT         NOT NULL,
    "order_id"    TEXT,
    "payment_id"  TEXT,
    "payload"     TEXT         NOT NULL,
    "handled"     BOOLEAN      NOT NULL DEFAULT false,
    "error"       TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_event_id_key" ON "webhook_events" ("event_id");
CREATE INDEX IF NOT EXISTS "webhook_events_order_id_idx" ON "webhook_events" ("order_id");

-- A valid checkout signature proves Razorpay sent the handover; it does not prove money moved.
-- amount_captured is what Razorpay reports it actually took, and is compared against amount
-- before a plan is activated.
-- How Razorpay says it was paid: upi | card | netbanking | wallet. Shown in the panel's
-- payments list and used by the revenue-by-method report.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "method"             TEXT;

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "amount_captured"    DECIMAL(12,2);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "amount_refunded"    DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "razorpay_signature" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paid_at"            TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "payments_organization_id_created_at_idx"
    ON "payments" ("organization_id", "created_at");