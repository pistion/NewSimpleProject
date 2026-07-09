-- Migration: org_invites, webhook_endpoints, builder fixes, notification fixes, stripe customer id
-- Date: 2026-05-22

-- ────────────────────────────────────────────────────────────────
-- 1. Organization: add stripe_customer_id
-- ────────────────────────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- ────────────────────────────────────────────────────────────────
-- 2. OrganizationMember: add removed_at
-- ────────────────────────────────────────────────────────────────
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────────
-- 3. OrganizationInvite: new table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_invites (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by_user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_by_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  email               TEXT        NOT NULL,
  role_key            TEXT        NOT NULL,
  token               TEXT        NOT NULL UNIQUE,
  expires_at          TIMESTAMPTZ NOT NULL,
  accepted_at         TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organization_invites_email_org_idx ON organization_invites (email, organization_id);
CREATE INDEX IF NOT EXISTS organization_invites_org_idx ON organization_invites (organization_id);
CREATE INDEX IF NOT EXISTS organization_invites_token_idx ON organization_invites (token);

-- ────────────────────────────────────────────────────────────────
-- 4. BuilderSite: add published_at, deleted_at
-- ────────────────────────────────────────────────────────────────
ALTER TABLE builder_sites
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────────
-- 5. BuilderPage: add content, deleted_at
-- ────────────────────────────────────────────────────────────────
ALTER TABLE builder_pages
  ADD COLUMN IF NOT EXISTS content    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────────
-- 6. BuilderPageVersion: add site_id, label
-- ────────────────────────────────────────────────────────────────
ALTER TABLE builder_page_versions
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES builder_sites(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS label   TEXT;

-- ────────────────────────────────────────────────────────────────
-- 7. Template: add is_active, sort_order
-- ────────────────────────────────────────────────────────────────
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INT     NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS templates_is_active_sort_order_idx ON templates (is_active, sort_order);

-- ────────────────────────────────────────────────────────────────
-- 8. BillingSubscription: make provider_subscription_id unique
-- ────────────────────────────────────────────────────────────────
-- Drop old index if exists, create unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_subscriptions_provider_subscription_id_key'
      AND conrelid = 'billing_subscriptions'::regclass
  ) THEN
    CREATE UNIQUE INDEX billing_subscriptions_provider_subscription_id_key
      ON billing_subscriptions (provider_subscription_id)
      WHERE provider_subscription_id IS NOT NULL;
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────
-- 9. OutgoingWebhookEndpoint: new table for outgoing webhook management
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outgoing_webhook_endpoints (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id UUID       REFERENCES users(id) ON DELETE SET NULL,
  url               TEXT        NOT NULL,
  events            TEXT[]      NOT NULL DEFAULT '{}',
  secret            TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS outgoing_webhook_endpoints_org_active_idx
  ON outgoing_webhook_endpoints (organization_id, is_active);

-- ────────────────────────────────────────────────────────────────
-- 10. OutgoingWebhookDelivery: add endpoint_id FK, status_code, response_body, error_message, delivered_at
-- ────────────────────────────────────────────────────────────────
ALTER TABLE outgoing_webhook_deliveries
  ADD COLUMN IF NOT EXISTS endpoint_id    UUID REFERENCES outgoing_webhook_endpoints(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status_code    INT,
  ADD COLUMN IF NOT EXISTS response_body  TEXT,
  ADD COLUMN IF NOT EXISTS error_message  TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ;

-- Rename last_error -> error_message (skip if already done)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='outgoing_webhook_deliveries' AND column_name='last_error'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='outgoing_webhook_deliveries' AND column_name='error_message'
  ) THEN
    ALTER TABLE outgoing_webhook_deliveries RENAME COLUMN last_error TO error_message;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS outgoing_webhook_deliveries_endpoint_idx
  ON outgoing_webhook_deliveries (endpoint_id);

-- ────────────────────────────────────────────────────────────────
-- 11. Notification: rename kind->type, subject->title; add action_url; make body optional
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Rename kind to type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='notifications' AND column_name='kind'
  ) THEN
    ALTER TABLE notifications RENAME COLUMN kind TO type;
  END IF;
  -- Rename subject to title
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='notifications' AND column_name='subject'
  ) THEN
    ALTER TABLE notifications RENAME COLUMN subject TO title;
  END IF;
END$$;

-- Make body nullable
ALTER TABLE notifications ALTER COLUMN body DROP NOT NULL;
-- Add action_url
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

-- ────────────────────────────────────────────────────────────────
-- 12. NotificationPreference: rename kind->event_type, change channel from enum to text
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Rename kind to event_type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='notification_preferences' AND column_name='kind'
  ) THEN
    ALTER TABLE notification_preferences RENAME COLUMN kind TO event_type;
  END IF;
  -- Change channel from NotificationChannel enum to TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='notification_preferences' AND column_name='channel'
      AND data_type='USER-DEFINED'
  ) THEN
    ALTER TABLE notification_preferences
      ALTER COLUMN channel TYPE TEXT USING channel::TEXT;
  END IF;
END$$;

-- Make organization_id NOT NULL (was nullable)
DO $$
BEGIN
  -- Only do this if no existing NULLs
  IF NOT EXISTS (
    SELECT 1 FROM notification_preferences WHERE organization_id IS NULL
  ) THEN
    ALTER TABLE notification_preferences ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END$$;

-- Drop old unique constraint, create new one
DO $$
DECLARE
  old_constraint TEXT;
BEGIN
  SELECT conname INTO old_constraint
  FROM pg_constraint
  WHERE conrelid = 'notification_preferences'::regclass
    AND contype = 'u'
  LIMIT 1;

  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notification_preferences DROP CONSTRAINT %I', old_constraint);
  END IF;
END$$;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_user_org_event_channel_key
  UNIQUE (user_id, organization_id, event_type, channel);

DROP INDEX IF EXISTS notification_preferences_user_id_channel_idx;
CREATE INDEX IF NOT EXISTS notification_preferences_user_org_idx
  ON notification_preferences (user_id, organization_id);
