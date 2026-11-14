-- Platform Admin panel: the back office used by the software company, not by a store owner.
--
-- Additive and idempotent throughout, so it is safe on a live database. Nothing existing is
-- dropped or rewritten; the only changes to existing tables are new nullable columns and two
-- new values on an existing enum.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'FINANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BusinessType" AS ENUM ('SUPERMARKET', 'KIRANA', 'MINI_MART', 'HYPERMARKET', 'WHOLESALE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "FollowUpType" AS ENUM ('RENEWAL', 'PAYMENT_FAILED', 'ONBOARDING', 'SUPPORT_ISSUE', 'UPSELL', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "FollowUpPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "SubscriptionEventType" AS ENUM (
        'TRIAL_STARTED', 'PAID', 'RENEWED', 'PLAN_CHANGED', 'EXTENDED',
        'ENTERED_GRACE', 'EXPIRED', 'SUSPENDED', 'REACTIVATED', 'CANCELLED', 'REFUNDED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The entitlement state machine needs all seven states. The existing enum has five.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'GRACE_PERIOD';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

-- ---------------------------------------------------------------------------
-- Platform staff. Deliberately a separate table from "users": a store owner must never
-- become a platform admin, even with the same email address.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "platform_admins" (
    "id"             TEXT           NOT NULL,
    "name"           TEXT           NOT NULL,
    "email"          TEXT           NOT NULL,
    "phone"          TEXT,
    "role"           "PlatformRole" NOT NULL DEFAULT 'SUPPORT',
    "password_hash"  TEXT           NOT NULL,
    -- Encrypted at rest by the application, never the raw shared secret.
    "totp_secret"    TEXT,
    "totp_enabled"   BOOLEAN        NOT NULL DEFAULT false,
    "is_active"      BOOLEAN        NOT NULL DEFAULT true,
    "failed_logins"  INTEGER        NOT NULL DEFAULT 0,
    "locked_until"   TIMESTAMP(3),
    "last_login_at"  TIMESTAMP(3),
    "password_set_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_email_key" ON "platform_admins" ("email");
CREATE INDEX IF NOT EXISTS "platform_admins_role_is_active_idx" ON "platform_admins" ("role", "is_active");

-- One row per sign-in, so "sign out all sessions" can revoke a token before it expires.
CREATE TABLE IF NOT EXISTS "platform_sessions" (
    "id"               TEXT         NOT NULL,
    "admin_id"         TEXT         NOT NULL,
    -- SHA-256 of the refresh token. The token itself is never stored.
    "token_hash"       TEXT         NOT NULL,
    "ip"               TEXT,
    "user_agent"       TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"       TIMESTAMP(3) NOT NULL,
    "revoked_at"       TIMESTAMP(3),

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_sessions_token_hash_key" ON "platform_sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "platform_sessions_admin_id_revoked_at_idx" ON "platform_sessions" ("admin_id", "revoked_at");

DO $$ BEGIN
    ALTER TABLE "platform_sessions"
        ADD CONSTRAINT "platform_sessions_admin_id_fkey"
        FOREIGN KEY ("admin_id") REFERENCES "platform_admins" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Single-use expiring tokens for forgot-password and for invite links.
CREATE TABLE IF NOT EXISTS "platform_password_tokens" (
    "id"         TEXT         NOT NULL,
    "admin_id"   TEXT         NOT NULL,
    "token_hash" TEXT         NOT NULL,
    "purpose"    TEXT         NOT NULL DEFAULT 'RESET',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at"    TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_password_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_password_tokens_token_hash_key" ON "platform_password_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "platform_password_tokens_admin_id_idx" ON "platform_password_tokens" ("admin_id");

DO $$ BEGIN
    ALTER TABLE "platform_password_tokens"
        ADD CONSTRAINT "platform_password_tokens_admin_id_fkey"
        FOREIGN KEY ("admin_id") REFERENCES "platform_admins" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Platform settings: one row per key, JSON value.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "platform_settings" (
    "key"        TEXT         NOT NULL,
    "value"      JSONB        NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- ---------------------------------------------------------------------------
-- Audit log. Every platform action lands here with its reason.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"              TEXT         NOT NULL,
    -- Null for system/cron actions, which record actor_label instead.
    "actor_admin_id"  TEXT,
    "actor_label"     TEXT         NOT NULL,
    "actor_role"      TEXT,
    "action"          TEXT         NOT NULL,
    "organization_id" TEXT,
    "target_type"     TEXT,
    "target_id"       TEXT,
    "reason"          TEXT,
    -- Small before/after summary, not a full row dump.
    "changes"         JSONB,
    "ip"              TEXT,
    "user_agent"      TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_created_at_idx" ON "audit_logs" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_actor_admin_id_created_at_idx" ON "audit_logs" ("actor_admin_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs" ("action", "created_at");

DO $$ BEGIN
    ALTER TABLE "audit_logs"
        ADD CONSTRAINT "audit_logs_actor_admin_id_fkey"
        FOREIGN KEY ("actor_admin_id") REFERENCES "platform_admins" ("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Deliberately no FK to organizations: an audit row must survive the store being deleted.

-- ---------------------------------------------------------------------------
-- Subscription history, so the store detail page can show a real timeline.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "subscription_events" (
    "id"              TEXT                    NOT NULL,
    "organization_id" TEXT                    NOT NULL,
    "type"            "SubscriptionEventType" NOT NULL,
    "from_status"     "SubscriptionStatus",
    "to_status"       "SubscriptionStatus",
    "from_plan"       "PlanTier",
    "to_plan"         "PlanTier",
    "period_end"      TIMESTAMP(3),
    "amount"          DECIMAL(12,2),
    "reason"          TEXT,
    "actor_label"     TEXT                    NOT NULL DEFAULT 'system',
    "actor_admin_id"  TEXT,
    "created_at"      TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subscription_events_organization_id_created_at_idx"
    ON "subscription_events" ("organization_id", "created_at");

DO $$ BEGIN
    ALTER TABLE "subscription_events"
        ADD CONSTRAINT "subscription_events_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Internal notes. Never visible to the store.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tenant_notes" (
    "id"              TEXT         NOT NULL,
    "organization_id" TEXT         NOT NULL,
    "author_admin_id" TEXT,
    "author_label"    TEXT         NOT NULL,
    "body"            TEXT         NOT NULL,
    "pinned"          BOOLEAN      NOT NULL DEFAULT false,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tenant_notes_organization_id_pinned_created_at_idx"
    ON "tenant_notes" ("organization_id", "pinned", "created_at");

DO $$ BEGIN
    ALTER TABLE "tenant_notes"
        ADD CONSTRAINT "tenant_notes_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "tenant_notes"
        ADD CONSTRAINT "tenant_notes_author_admin_id_fkey"
        FOREIGN KEY ("author_admin_id") REFERENCES "platform_admins" ("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Follow-ups: renewal chasing and support tasks.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "follow_ups" (
    "id"              TEXT               NOT NULL,
    "organization_id" TEXT               NOT NULL,
    "title"           TEXT               NOT NULL,
    "type"            "FollowUpType"     NOT NULL DEFAULT 'OTHER',
    "status"          "FollowUpStatus"   NOT NULL DEFAULT 'OPEN',
    "priority"        "FollowUpPriority" NOT NULL DEFAULT 'NORMAL',
    "due_at"          TIMESTAMP(3)       NOT NULL,
    "assignee_id"     TEXT,
    "created_by_id"   TEXT,
    "result"          TEXT,
    -- Set by the daily job, e.g. "RENEWAL:<orgId>:2026-12-01". Unique, so a job that runs
    -- twice cannot raise the same follow-up twice.
    "auto_key"        TEXT,
    "closed_at"       TIMESTAMP(3),
    "created_at"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "follow_ups_auto_key_key" ON "follow_ups" ("auto_key");
CREATE INDEX IF NOT EXISTS "follow_ups_status_due_at_idx" ON "follow_ups" ("status", "due_at");
CREATE INDEX IF NOT EXISTS "follow_ups_assignee_id_status_due_at_idx" ON "follow_ups" ("assignee_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "follow_ups_organization_id_status_idx" ON "follow_ups" ("organization_id", "status");

DO $$ BEGIN
    ALTER TABLE "follow_ups"
        ADD CONSTRAINT "follow_ups_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "follow_ups"
        ADD CONSTRAINT "follow_ups_assignee_id_fkey"
        FOREIGN KEY ("assignee_id") REFERENCES "platform_admins" ("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "follow_ups"
        ADD CONSTRAINT "follow_ups_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "platform_admins" ("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Existing tables: new nullable columns only.
-- ---------------------------------------------------------------------------

-- Needed for the stores list columns and filters, and for phone sign-in.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_name"     TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "business_type"  "BusinessType" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "city"           TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "state"          TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "organizations_business_type_idx"  ON "organizations" ("business_type");
CREATE INDEX IF NOT EXISTS "organizations_last_active_at_idx" ON "organizations" ("last_active_at");
CREATE INDEX IF NOT EXISTS "organizations_created_at_idx"     ON "organizations" ("created_at");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone"        TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

-- Phone search and phone sign-in both match on the last 10 digits, so the index has to be on
-- that expression -- a plain index on "phone" cannot serve "+91 98765 43210" = "09876543210".
CREATE INDEX IF NOT EXISTS "users_phone_digits_idx"
    ON "users" (RIGHT(REGEXP_REPLACE(COALESCE("phone", ''), '\D', '', 'g'), 10));

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "grace_ends_at"     TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "suspended_at"      TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "suspended_reason"  TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancelled_at"      TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "subscriptions_status_current_period_end_idx"
    ON "subscriptions" ("status", "current_period_end");

-- ---------------------------------------------------------------------------
-- Defaults for the settings the panel reads. ON CONFLICT DO NOTHING so a re-run keeps
-- whatever the operator has since changed.
-- ---------------------------------------------------------------------------

INSERT INTO "platform_settings" ("key", "value") VALUES
    ('store_login_method',       '"EMAIL"'::jsonb),
    ('default_trial_days',       '30'::jsonb),
    ('default_grace_days',       '7'::jsonb),
    ('renewal_reminder_days',    '[7, 3, 1]'::jsonb),
    ('inactive_store_days',      '14'::jsonb),
    ('support_contact',          '{"email": null, "phone": null, "hours": null}'::jsonb),
    ('maintenance_mode',         '{"enabled": false, "message": null}'::jsonb)
ON CONFLICT ("key") DO NOTHING;