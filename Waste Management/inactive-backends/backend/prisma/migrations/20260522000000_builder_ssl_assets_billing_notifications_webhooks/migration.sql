-- Migration: builder_ssl_assets_billing_notifications_webhooks
-- Covers items 1-17 from the schema alignment plan:
--   deployment_aliases, domains (remodel), dns_records (2 fields),
--   ssl_certificates, builder_sites/pages/page_versions, templates,
--   assets, billing_plans (redesign), billing_subscriptions (fix),
--   billing_invoices (fix), billing_usage_records (redesign),
--   webhook_events, outgoing_webhook_deliveries,
--   notifications, notification_preferences

-- ─── New enums ───────────────────────────────────────────────────────────────

CREATE TYPE "DnsRecordStatus" AS ENUM ('pending', 'active', 'failed');
CREATE TYPE "SslCertificateStatus" AS ENUM ('pending', 'issued', 'active', 'renewing', 'expired', 'failed');
CREATE TYPE "BuilderSiteStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "BuilderPageStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "AssetVisibility" AS ENUM ('public', 'private');
CREATE TYPE "WebhookEventStatus" AS ENUM ('received', 'processed', 'failed', 'ignored');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed', 'dead');
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'in_app');

-- ─── #1  deployment_aliases ──────────────────────────────────────────────────

CREATE TABLE "deployment_aliases" (
    "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID        NOT NULL,
    "project_id"      UUID        NOT NULL,
    "deployment_id"   UUID        NOT NULL,
    "domain_id"       UUID,
    "hostname"        TEXT        NOT NULL,
    "is_primary"      BOOLEAN     NOT NULL DEFAULT false,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deployment_aliases_hostname_key" ON "deployment_aliases"("hostname");
CREATE INDEX "deployment_aliases_deployment_id_idx" ON "deployment_aliases"("deployment_id");
CREATE INDEX "deployment_aliases_domain_id_idx" ON "deployment_aliases"("domain_id");
CREATE INDEX "deployment_aliases_organization_id_idx" ON "deployment_aliases"("organization_id");
CREATE INDEX "deployment_aliases_project_id_is_primary_idx" ON "deployment_aliases"("project_id", "is_primary");

ALTER TABLE "deployment_aliases"
    ADD CONSTRAINT "deployment_aliases_deployment_id_fkey"
        FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE;
ALTER TABLE "deployment_aliases"
    ADD CONSTRAINT "deployment_aliases_domain_id_fkey"
        FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL;
ALTER TABLE "deployment_aliases"
    ADD CONSTRAINT "deployment_aliases_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "deployment_aliases"
    ADD CONSTRAINT "deployment_aliases_project_id_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;

-- ─── #2  domains — remodel ───────────────────────────────────────────────────
-- Drop old enum values, rename/add columns, swap enum.

-- Step 1: drop the old unique constraint and status enum usage
ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "domains_name_key";

-- Step 2: rename name → hostname, add new columns
ALTER TABLE "domains" RENAME COLUMN "name" TO "hostname";
ALTER TABLE "domains"
    ADD COLUMN "root_domain"         TEXT,
    ADD COLUMN "verification_token"  TEXT;

-- Backfill root_domain from hostname (strip leading www.)
UPDATE "domains"
SET "root_domain" = REGEXP_REPLACE("hostname", '^www\.', ''),
    "verification_token" = 'glondia-verify-' || substr(gen_random_uuid()::text, 1, 16)
WHERE "root_domain" IS NULL;

-- Step 3: make new columns NOT NULL now that they're backfilled
ALTER TABLE "domains"
    ALTER COLUMN "root_domain" SET NOT NULL,
    ALTER COLUMN "verification_token" SET NOT NULL;

-- Step 4: drop purchase-oriented columns
ALTER TABLE "domains"
    DROP COLUMN IF EXISTS "registrar",
    DROP COLUMN IF EXISTS "auto_renew",
    DROP COLUMN IF EXISTS "whois_privacy",
    DROP COLUMN IF EXISTS "expires_at",
    DROP COLUMN IF EXISTS "ssl_issued_at";

-- Step 5: swap status enum
-- Add new enum type
CREATE TYPE "DomainStatus_new" AS ENUM (
    'pending_verification', 'verified', 'active', 'misconfigured', 'disabled'
);

-- Migrate existing status values to the closest equivalent
ALTER TABLE "domains"
    ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "domains"
    ALTER COLUMN "status" TYPE "DomainStatus_new"
    USING (
        CASE "status"::text
            WHEN 'pending_dns'  THEN 'pending_verification'
            WHEN 'active'       THEN 'active'
            WHEN 'suspended'    THEN 'disabled'
            WHEN 'transferring' THEN 'pending_verification'
            WHEN 'expired'      THEN 'disabled'
            WHEN 'deleted'      THEN 'disabled'
            ELSE 'pending_verification'
        END
    )::"DomainStatus_new";

ALTER TABLE "domains"
    ALTER COLUMN "status" SET DEFAULT 'pending_verification'::"DomainStatus_new";

DROP TYPE "DomainStatus";
ALTER TYPE "DomainStatus_new" RENAME TO "DomainStatus";

-- Step 6: add new unique constraint
ALTER TABLE "domains"
    ADD CONSTRAINT "domains_organization_id_hostname_key"
        UNIQUE ("organization_id", "hostname");

-- ─── #3  dns_records — 2 new fields ─────────────────────────────────────────

ALTER TABLE "dns_records"
    ADD COLUMN "provider_record_id" TEXT,
    ADD COLUMN "status"             "DnsRecordStatus" NOT NULL DEFAULT 'pending';

CREATE INDEX "dns_records_status_idx" ON "dns_records"("status");

-- ─── #4  ssl_certificates ────────────────────────────────────────────────────

CREATE TABLE "ssl_certificates" (
    "id"              UUID                   NOT NULL DEFAULT gen_random_uuid(),
    "domain_id"       UUID                   NOT NULL,
    "organization_id" UUID                   NOT NULL,
    "status"          "SslCertificateStatus" NOT NULL DEFAULT 'pending',
    "provider"        TEXT                   NOT NULL,
    "certificate_ref" TEXT,
    "issued_at"       TIMESTAMPTZ,
    "expires_at"      TIMESTAMPTZ,
    "last_checked_at" TIMESTAMPTZ,
    "error_message"   TEXT,
    "created_at"      TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ssl_certificates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ssl_certificates_domain_id_status_idx"  ON "ssl_certificates"("domain_id", "status");
CREATE INDEX "ssl_certificates_expires_at_idx"        ON "ssl_certificates"("expires_at");
CREATE INDEX "ssl_certificates_organization_id_idx"   ON "ssl_certificates"("organization_id");

ALTER TABLE "ssl_certificates"
    ADD CONSTRAINT "ssl_certificates_domain_id_fkey"
        FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE;
ALTER TABLE "ssl_certificates"
    ADD CONSTRAINT "ssl_certificates_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ─── #5  templates ───────────────────────────────────────────────────────────

CREATE TABLE "templates" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "name"              TEXT        NOT NULL,
    "category"          TEXT        NOT NULL,
    "preview_image_url" TEXT,
    "content_json"      JSONB       NOT NULL DEFAULT '{}',
    "is_public"         BOOLEAN     NOT NULL DEFAULT true,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "templates_category_idx"  ON "templates"("category");
CREATE INDEX "templates_is_public_idx" ON "templates"("is_public");

-- ─── #6  builder_sites ───────────────────────────────────────────────────────

CREATE TABLE "builder_sites" (
    "id"               UUID               NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"  UUID               NOT NULL,
    "project_id"       UUID,
    "name"             TEXT               NOT NULL,
    "slug"             TEXT               NOT NULL,
    "template_id"      UUID,
    "status"           "BuilderSiteStatus" NOT NULL DEFAULT 'draft',
    "created_by_user_id" UUID,
    "created_at"       TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builder_sites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "builder_sites_organization_id_slug_key"
    ON "builder_sites"("organization_id", "slug");
CREATE INDEX "builder_sites_created_by_user_id_idx" ON "builder_sites"("created_by_user_id");
CREATE INDEX "builder_sites_organization_id_status_idx" ON "builder_sites"("organization_id", "status");

ALTER TABLE "builder_sites"
    ADD CONSTRAINT "builder_sites_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "builder_sites"
    ADD CONSTRAINT "builder_sites_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL;
ALTER TABLE "builder_sites"
    ADD CONSTRAINT "builder_sites_created_by_user_id_fkey"
        FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ─── #7  builder_pages ───────────────────────────────────────────────────────

CREATE TABLE "builder_pages" (
    "id"              UUID               NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID               NOT NULL,
    "site_id"         UUID               NOT NULL,
    "path"            TEXT               NOT NULL,
    "title"           TEXT               NOT NULL,
    "seo_title"       TEXT,
    "seo_description" TEXT,
    "status"          "BuilderPageStatus" NOT NULL DEFAULT 'draft',
    "sort_order"      INTEGER            NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builder_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "builder_pages_site_id_path_key" ON "builder_pages"("site_id", "path");
CREATE INDEX "builder_pages_organization_id_idx"        ON "builder_pages"("organization_id");
CREATE INDEX "builder_pages_site_id_status_idx"         ON "builder_pages"("site_id", "status");

ALTER TABLE "builder_pages"
    ADD CONSTRAINT "builder_pages_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "builder_pages"
    ADD CONSTRAINT "builder_pages_site_id_fkey"
        FOREIGN KEY ("site_id") REFERENCES "builder_sites"("id") ON DELETE CASCADE;

-- ─── #8  builder_page_versions ───────────────────────────────────────────────

CREATE TABLE "builder_page_versions" (
    "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"     UUID        NOT NULL,
    "page_id"             UUID        NOT NULL,
    "version_number"      INTEGER     NOT NULL,
    "content_json"        JSONB       NOT NULL DEFAULT '{}',
    "created_by_user_id"  UUID,
    "published_at"        TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builder_page_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "builder_page_versions_page_id_version_number_key"
    ON "builder_page_versions"("page_id", "version_number");
CREATE INDEX "builder_page_versions_organization_id_idx"   ON "builder_page_versions"("organization_id");
CREATE INDEX "builder_page_versions_page_id_published_at_idx"
    ON "builder_page_versions"("page_id", "published_at");

ALTER TABLE "builder_page_versions"
    ADD CONSTRAINT "builder_page_versions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "builder_page_versions"
    ADD CONSTRAINT "builder_page_versions_page_id_fkey"
        FOREIGN KEY ("page_id") REFERENCES "builder_pages"("id") ON DELETE CASCADE;
ALTER TABLE "builder_page_versions"
    ADD CONSTRAINT "builder_page_versions_created_by_user_id_fkey"
        FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ─── #9  assets ──────────────────────────────────────────────────────────────

CREATE TABLE "assets" (
    "id"                  UUID             NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"     UUID             NOT NULL,
    "uploaded_by_user_id" UUID,
    "bucket"              TEXT             NOT NULL,
    "object_key"          TEXT             NOT NULL,
    "public_url"          TEXT,
    "mime_type"           TEXT             NOT NULL,
    "size_bytes"          INTEGER          NOT NULL DEFAULT 0,
    "checksum"            TEXT,
    "visibility"          "AssetVisibility" NOT NULL DEFAULT 'private',
    "metadata"            JSONB            NOT NULL DEFAULT '{}',
    "deleted_at"          TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assets_organization_id_created_at_idx"  ON "assets"("organization_id", "created_at");
CREATE INDEX "assets_organization_id_visibility_idx"  ON "assets"("organization_id", "visibility");
CREATE INDEX "assets_uploaded_by_user_id_idx"         ON "assets"("uploaded_by_user_id");

ALTER TABLE "assets"
    ADD CONSTRAINT "assets_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "assets"
    ADD CONSTRAINT "assets_uploaded_by_user_id_fkey"
        FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ─── #10 billing_plans — redesign ────────────────────────────────────────────

ALTER TABLE "billing_plans"
    ADD COLUMN "price_yearly_cents"   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "limits"               JSONB   NOT NULL DEFAULT '{}',
    ADD COLUMN "features"             JSONB   NOT NULL DEFAULT '{}',
    ADD COLUMN "is_active"            BOOLEAN NOT NULL DEFAULT true;

-- Migrate existing hardcoded limit columns into limits JSON, then drop them
UPDATE "billing_plans"
SET "limits" = jsonb_build_object(
    'projects_limit',              "max_projects",
    'team_members_limit',          "max_team_members",
    'monthly_build_minutes_limit', "included_build_minutes",
    'bandwidth_gb_limit',          "included_bandwidth_gb"
)
WHERE "limits" = '{}';

ALTER TABLE "billing_plans"
    DROP COLUMN IF EXISTS "included_build_minutes",
    DROP COLUMN IF EXISTS "included_bandwidth_gb",
    DROP COLUMN IF EXISTS "max_projects",
    DROP COLUMN IF EXISTS "max_team_members";

CREATE INDEX "billing_plans_is_active_idx" ON "billing_plans"("is_active");

-- ─── #11 billing_subscriptions — fix ─────────────────────────────────────────

-- Add provider field
ALTER TABLE "billing_subscriptions"
    ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'stripe';

-- Drop the seats column (not in plan)
ALTER TABLE "billing_subscriptions"
    DROP COLUMN IF EXISTS "seats";

-- Extend the SubscriptionStatus enum with missing values
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'unpaid';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'paused';

-- Fix enum value: 'canceled' → 'cancelled' (plan spelling)
-- Note: PostgreSQL enums cannot rename values directly; migrate data then recreate
CREATE TYPE "SubscriptionStatus_new" AS ENUM (
    'trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'paused'
);
ALTER TABLE "billing_subscriptions"
    ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "billing_subscriptions"
    ALTER COLUMN "status" TYPE "SubscriptionStatus_new"
    USING ("status"::text::"SubscriptionStatus_new");
ALTER TABLE "billing_subscriptions"
    ALTER COLUMN "status" SET DEFAULT 'active'::"SubscriptionStatus_new";
DROP TYPE "SubscriptionStatus";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";

-- ─── #12 billing_invoices — fix ──────────────────────────────────────────────

-- Rename number → provider_invoice_id (drop unique, rename, re-add unique as nullable)
ALTER TABLE "billing_invoices"
    DROP CONSTRAINT IF EXISTS "billing_invoices_number_key";
ALTER TABLE "billing_invoices"
    RENAME COLUMN "number" TO "provider_invoice_id";
ALTER TABLE "billing_invoices"
    ALTER COLUMN "provider_invoice_id" DROP NOT NULL;
CREATE UNIQUE INDEX "billing_invoices_provider_invoice_id_key"
    ON "billing_invoices"("provider_invoice_id") WHERE "provider_invoice_id" IS NOT NULL;

-- Rename due_at → issued_at
ALTER TABLE "billing_invoices"
    RENAME COLUMN "due_at" TO "issued_at";

-- ─── #13 billing_usage_records — redesign ────────────────────────────────────

-- Drop old unique constraint
ALTER TABLE "billing_usage_records"
    DROP CONSTRAINT IF EXISTS "billing_usage_records_subscription_id_metric_period_start_key";

-- Add new columns
ALTER TABLE "billing_usage_records"
    ADD COLUMN "project_id"  UUID,
    ADD COLUMN "metric_key"  TEXT,
    ADD COLUMN "quantity"    INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "metadata"    JSONB   NOT NULL DEFAULT '{}',
    ADD COLUMN "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Migrate metric enum → metric_key string
UPDATE "billing_usage_records"
SET "metric_key" = "metric"::text,
    "quantity"   = "value";

-- Make metric_key NOT NULL now that it's backfilled
ALTER TABLE "billing_usage_records"
    ALTER COLUMN "metric_key" SET NOT NULL;

-- Drop old columns
ALTER TABLE "billing_usage_records"
    DROP COLUMN "metric",
    DROP COLUMN "value",
    DROP COLUMN "limit",
    DROP COLUMN "updated_at";

-- Drop old enum
DROP TYPE IF EXISTS "UsageMetricKey";

-- Rebuild indexes
DROP INDEX IF EXISTS "billing_usage_records_organization_id_metric_idx";
CREATE INDEX "billing_usage_records_org_metric_period_idx"
    ON "billing_usage_records"("organization_id", "metric_key", "period_start");
CREATE INDEX "billing_usage_records_project_id_idx"
    ON "billing_usage_records"("project_id");
CREATE INDEX "billing_usage_records_subscription_id_idx"
    ON "billing_usage_records"("subscription_id");

ALTER TABLE "billing_usage_records"
    ADD CONSTRAINT "billing_usage_records_project_id_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;

-- ─── #14 webhook_events ──────────────────────────────────────────────────────

CREATE TABLE "webhook_events" (
    "id"               UUID                 NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"  UUID,
    "provider"         TEXT                 NOT NULL,
    "event_type"       TEXT                 NOT NULL,
    "external_event_id" TEXT               NOT NULL,
    "payload"          JSONB                NOT NULL DEFAULT '{}',
    "status"           "WebhookEventStatus" NOT NULL DEFAULT 'received',
    "processed_at"     TIMESTAMPTZ,
    "error_message"    TEXT,
    "created_at"       TIMESTAMPTZ          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_provider_external_event_id_key"
    ON "webhook_events"("provider", "external_event_id");
CREATE INDEX "webhook_events_organization_id_idx" ON "webhook_events"("organization_id");
CREATE INDEX "webhook_events_provider_status_idx" ON "webhook_events"("provider", "status");

ALTER TABLE "webhook_events"
    ADD CONSTRAINT "webhook_events_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;

-- ─── #15 outgoing_webhook_deliveries ─────────────────────────────────────────

CREATE TABLE "outgoing_webhook_deliveries" (
    "id"              UUID                   NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID                   NOT NULL,
    "endpoint_url"    TEXT                   NOT NULL,
    "event_type"      TEXT                   NOT NULL,
    "payload"         JSONB                  NOT NULL DEFAULT '{}',
    "status"          "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempt_count"   INTEGER                NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ,
    "last_error"      TEXT,
    "created_at"      TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outgoing_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outgoing_webhook_deliveries_organization_id_status_idx"
    ON "outgoing_webhook_deliveries"("organization_id", "status");
CREATE INDEX "outgoing_webhook_deliveries_next_attempt_at_idx"
    ON "outgoing_webhook_deliveries"("next_attempt_at");

ALTER TABLE "outgoing_webhook_deliveries"
    ADD CONSTRAINT "outgoing_webhook_deliveries_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ─── #16 notifications ───────────────────────────────────────────────────────

CREATE TABLE "notifications" (
    "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID        NOT NULL,
    "user_id"         UUID        NOT NULL,
    "kind"            TEXT        NOT NULL,
    "subject"         TEXT        NOT NULL,
    "body"            TEXT        NOT NULL,
    "read_at"         TIMESTAMPTZ,
    "metadata"        JSONB       NOT NULL DEFAULT '{}',
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_organization_id_created_at_idx"
    ON "notifications"("organization_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_idx"
    ON "notifications"("user_id", "read_at");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ─── #17 notification_preferences ────────────────────────────────────────────

CREATE TABLE "notification_preferences" (
    "id"              UUID                  NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         UUID                  NOT NULL,
    "organization_id" UUID,
    "channel"         "NotificationChannel" NOT NULL,
    "kind"            TEXT                  NOT NULL,
    "enabled"         BOOLEAN               NOT NULL DEFAULT true,
    "created_at"      TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_org_channel_kind_key"
    ON "notification_preferences"("user_id", "organization_id", "channel", "kind");
CREATE INDEX "notification_preferences_user_id_channel_idx"
    ON "notification_preferences"("user_id", "channel");

ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
