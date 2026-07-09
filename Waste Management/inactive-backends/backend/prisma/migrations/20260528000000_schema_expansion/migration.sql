-- ─── Schema Expansion: billing links, WebHostingService, BusinessService ──────
-- All ALTER TABLE statements use IF NOT EXISTS guards for idempotency.

-- Add checkout_order_id to vps_services
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='vps_services' AND column_name='checkout_order_id'
  ) THEN
    ALTER TABLE "vps_services" ADD COLUMN "checkout_order_id" TEXT;
    ALTER TABLE "vps_services" ADD CONSTRAINT "vps_services_checkout_order_id_fkey"
      FOREIGN KEY ("checkout_order_id") REFERENCES "checkout_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    CREATE INDEX "vps_services_checkout_order_id_idx" ON "vps_services"("checkout_order_id");
  END IF;
END $$;

-- Add vps_service_id to billing_usage_records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='billing_usage_records' AND column_name='vps_service_id'
  ) THEN
    ALTER TABLE "billing_usage_records" ADD COLUMN "vps_service_id" TEXT;
    ALTER TABLE "billing_usage_records" ADD CONSTRAINT "billing_usage_records_vps_service_id_fkey"
      FOREIGN KEY ("vps_service_id") REFERENCES "vps_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    CREATE INDEX "billing_usage_records_vps_service_id_idx" ON "billing_usage_records"("vps_service_id");
  END IF;
END $$;

-- Add web_hosting_id to billing_usage_records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='billing_usage_records' AND column_name='web_hosting_id'
  ) THEN
    ALTER TABLE "billing_usage_records" ADD COLUMN "web_hosting_id" TEXT;
  END IF;
END $$;

-- CreateTable: web_hosting_services
CREATE TABLE IF NOT EXISTS "web_hosting_services" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT,
    "created_by_user_id" TEXT,
    "checkout_order_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'render',
    "provider_service_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "service_type" TEXT NOT NULL DEFAULT 'web_service',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "region" TEXT,
    "plan" TEXT,
    "url" TEXT,
    "custom_domain" TEXT,
    "monthly_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "markup_percent" INTEGER NOT NULL DEFAULT 30,
    "markup_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billing_model" TEXT NOT NULL DEFAULT 'monthly',
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "web_hosting_services_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'web_hosting_services_organization_id_slug_key'
  ) THEN
    CREATE UNIQUE INDEX "web_hosting_services_organization_id_slug_key"
      ON "web_hosting_services"("organization_id", "slug");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'web_hosting_services_organization_id_idx') THEN
    CREATE INDEX "web_hosting_services_organization_id_idx" ON "web_hosting_services"("organization_id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'web_hosting_services_project_id_idx') THEN
    CREATE INDEX "web_hosting_services_project_id_idx" ON "web_hosting_services"("project_id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'web_hosting_services_provider_service_id_idx') THEN
    CREATE INDEX "web_hosting_services_provider_service_id_idx" ON "web_hosting_services"("provider_service_id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'web_hosting_services_checkout_order_id_idx') THEN
    CREATE INDEX "web_hosting_services_checkout_order_id_idx" ON "web_hosting_services"("checkout_order_id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_hosting_services_organization_id_fkey') THEN
    ALTER TABLE "web_hosting_services" ADD CONSTRAINT "web_hosting_services_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_hosting_services_project_id_fkey') THEN
    ALTER TABLE "web_hosting_services" ADD CONSTRAINT "web_hosting_services_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_hosting_services_created_by_user_id_fkey') THEN
    ALTER TABLE "web_hosting_services" ADD CONSTRAINT "web_hosting_services_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_hosting_services_checkout_order_id_fkey') THEN
    ALTER TABLE "web_hosting_services" ADD CONSTRAINT "web_hosting_services_checkout_order_id_fkey"
      FOREIGN KEY ("checkout_order_id") REFERENCES "checkout_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add web_hosting_id FK to billing_usage_records (after web_hosting_services exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_usage_records_web_hosting_id_fkey') THEN
    ALTER TABLE "billing_usage_records" ADD CONSTRAINT "billing_usage_records_web_hosting_id_fkey"
      FOREIGN KEY ("web_hosting_id") REFERENCES "web_hosting_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    CREATE INDEX "billing_usage_records_web_hosting_id_idx" ON "billing_usage_records"("web_hosting_id");
  END IF;
END $$;

-- CreateTable: business_services
CREATE TABLE IF NOT EXISTS "business_services" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "checkout_order_id" TEXT,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_service_id" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billing_cycle" TEXT NOT NULL DEFAULT 'annual',
    "billing_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "markup_percent" INTEGER NOT NULL DEFAULT 30,
    "markup_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "renews_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_services_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'business_services_organization_id_idx') THEN
    CREATE INDEX "business_services_organization_id_idx" ON "business_services"("organization_id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'business_services_type_status_idx') THEN
    CREATE INDEX "business_services_type_status_idx" ON "business_services"("type", "status");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'business_services_checkout_order_id_idx') THEN
    CREATE INDEX "business_services_checkout_order_id_idx" ON "business_services"("checkout_order_id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_services_organization_id_fkey') THEN
    ALTER TABLE "business_services" ADD CONSTRAINT "business_services_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_services_created_by_user_id_fkey') THEN
    ALTER TABLE "business_services" ADD CONSTRAINT "business_services_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_services_checkout_order_id_fkey') THEN
    ALTER TABLE "business_services" ADD CONSTRAINT "business_services_checkout_order_id_fkey"
      FOREIGN KEY ("checkout_order_id") REFERENCES "checkout_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
