-- Plans and in-app messaging.
--
-- Two things the panel could not do without storage of its own:
--
--   1. Plans lived in config/plans.js as hardcoded objects with marketing copy and no limits,
--      so "does this store fit that plan?" had nothing to check beyond seats. A plan is a
--      commercial record -- prices change, old plans must keep billing the stores already on
--      them -- so it belongs in the database, not in a file that redeploys.
--
--   2. Messages to stores had no home at all. These are in-app: a message lands in the store's
--      own app and they can reply there. No SMS or WhatsApp provider is involved, so nothing
--      here depends on an account that has not been opened yet.
--
-- Written to be safe to run twice: every statement is IF NOT EXISTS or guarded.

-- ---------------------------------------------------------------- plans

CREATE TABLE IF NOT EXISTS "plans" (
    "id"                  TEXT PRIMARY KEY,
    "code"                TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "blurb"               TEXT,
    "is_active"           BOOLEAN NOT NULL DEFAULT true,
    "is_public"           BOOLEAN NOT NULL DEFAULT true,
    "sort_order"          INTEGER NOT NULL DEFAULT 0,

    -- Limits. NULL means unlimited, which is why they are nullable rather than defaulted to a
    -- large number: "unlimited" and "a million" are different promises.
    "max_users"           INTEGER,
    "max_products"        INTEGER,
    "max_bills_per_month" INTEGER,

    "features"            JSONB NOT NULL DEFAULT '[]'::jsonb,

    "monthly_list_price"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monthly_price"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "yearly_list_price"   DECIMAL(10,2) NOT NULL DEFAULT 0,
    "yearly_price"        DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency"            TEXT NOT NULL DEFAULT 'INR',

    -- Retiring a plan hides it from the pricing page without touching the stores already on
    -- it. Deleting a plan someone is paying for would orphan their subscription.
    "retired_at"          TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_code_key" ON "plans" ("code");
CREATE INDEX IF NOT EXISTS "plans_active_sort_idx" ON "plans" ("is_active", "sort_order");

-- Seed from config/plans.js so the panel opens with the plans that are already being sold.
-- ON CONFLICT DO NOTHING means a second run never overwrites prices edited in the panel.
INSERT INTO "plans" (
    "id", "code", "name", "blurb", "sort_order",
    "max_users", "max_products", "max_bills_per_month", "features",
    "monthly_list_price", "monthly_price", "yearly_list_price", "yearly_price"
) VALUES
(
    'plan_standard', 'STANDARD', 'Standard',
    'Everything a single store needs to sell and stay on top of stock.', 10,
    NULL, NULL, NULL,
    '["Unlimited bills and products","Offline selling with automatic sync","Barcode scanning and weighing scale","Daily business report and analytics","Inventory and stock ledger","UPI, cash and card payments","Email support"]'::jsonb,
    850, 650, 650, 550
),
(
    'plan_custom', 'CUSTOM', 'Custom',
    'For chains and larger teams that need tailoring and priority help.', 20,
    NULL, NULL, NULL,
    '["Everything in Standard","Custom categories, fields and receipt layout","Multiple registers and higher seat counts","Priority onboarding and data migration","Custom reports on request","Priority support"]'::jsonb,
    1300, 1000, 1000, 800
),
(
    'plan_trial', 'TRIAL', 'Trial',
    'Thirty days to try everything, no card needed.', 0,
    NULL, NULL, NULL,
    '["Everything in Standard for 30 days"]'::jsonb,
    0, 0, 0, 0
)
ON CONFLICT ("code") DO NOTHING;

-- The trial is not something to sell on the pricing page.
UPDATE "plans" SET "is_public" = false WHERE "code" = 'TRIAL' AND "is_public" = true;

-- ------------------------------------------------------------- messages

CREATE TABLE IF NOT EXISTS "platform_messages" (
    "id"                TEXT PRIMARY KEY,
    "subject"           TEXT NOT NULL,
    "body"              TEXT NOT NULL,
    -- The filter the message was aimed at, kept as sent. Re-deriving "who got this" from a
    -- live filter months later would give a different answer as stores change state.
    "audience"          JSONB NOT NULL DEFAULT '{}'::jsonb,
    "channel"           TEXT NOT NULL DEFAULT 'IN_APP',
    "status"            TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by_id"     TEXT,
    "created_by_label"  TEXT NOT NULL DEFAULT 'system',
    "sent_at"           TIMESTAMPTZ,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "platform_messages_status_idx" ON "platform_messages" ("status", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "platform_message_recipients" (
    "id"              TEXT PRIMARY KEY,
    "message_id"      TEXT NOT NULL REFERENCES "platform_messages"("id") ON DELETE CASCADE,
    "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "read_at"         TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per store per message: sending twice to the same shop is a bug, not a feature.
CREATE UNIQUE INDEX IF NOT EXISTS "platform_message_recipients_unique"
    ON "platform_message_recipients" ("message_id", "organization_id");
CREATE INDEX IF NOT EXISTS "platform_message_recipients_org_idx"
    ON "platform_message_recipients" ("organization_id", "read_at");

CREATE TABLE IF NOT EXISTS "store_message_replies" (
    "id"                TEXT PRIMARY KEY,
    -- A reply usually answers a message, but a store can also start a thread, so this is
    -- nullable and set null rather than cascading: deleting a campaign must not delete the
    -- replies it provoked.
    "message_id"        TEXT REFERENCES "platform_messages"("id") ON DELETE SET NULL,
    "organization_id"   TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "user_id"           TEXT,
    "author_label"      TEXT NOT NULL,
    "body"              TEXT NOT NULL,
    "handled_at"        TIMESTAMPTZ,
    "handled_by_id"     TEXT,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The inbox is "unhandled, oldest first", so that is what the index serves.
CREATE INDEX IF NOT EXISTS "store_message_replies_inbox_idx"
    ON "store_message_replies" ("handled_at", "created_at");
CREATE INDEX IF NOT EXISTS "store_message_replies_org_idx"
    ON "store_message_replies" ("organization_id", "created_at" DESC);
