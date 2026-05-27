-- CreateTable: pricing_rules — DB-backed pricing for VPS markup, domain markup, TLD prices
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_scope_key_key" ON "pricing_rules"("scope", "key");

-- CreateIndex
CREATE INDEX "pricing_rules_scope_is_active_idx" ON "pricing_rules"("scope", "is_active");

-- AddColumn: stripe_customer_id on organizations (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='organizations' AND column_name='stripe_customer_id'
  ) THEN
    ALTER TABLE "organizations" ADD COLUMN "stripe_customer_id" TEXT;
    CREATE UNIQUE INDEX "organizations_stripe_customer_id_key" ON "organizations"("stripe_customer_id");
  END IF;
END $$;

-- AddColumn: os_name on vps_services (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='vps_services' AND column_name='os_name'
  ) THEN
    ALTER TABLE "vps_services" ADD COLUMN "os_name" TEXT;
  END IF;
END $$;

-- AddColumn: removed_at on organization_members (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='organization_members' AND column_name='removed_at'
  ) THEN
    ALTER TABLE "organization_members" ADD COLUMN "removed_at" TIMESTAMP(3);
  END IF;
END $$;
