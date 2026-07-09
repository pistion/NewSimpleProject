CREATE TABLE "checkout_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paypal',
    "provider_order_id" TEXT,
    "provider_capture_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "actual_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "markup_percent" DECIMAL(65,30) NOT NULL DEFAULT 30,
    "markup_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checkout_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "checkout_order_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paypal',
    "provider_order_id" TEXT,
    "provider_capture_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "actual_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "markup_percent" DECIMAL(65,30) NOT NULL DEFAULT 30,
    "markup_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_line_items" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actual_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "markup_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_line_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkout_orders_provider_order_id_key" ON "checkout_orders"("provider_order_id");
CREATE INDEX "checkout_orders_organization_id_status_idx" ON "checkout_orders"("organization_id", "status");
CREATE INDEX "checkout_orders_type_created_at_idx" ON "checkout_orders"("type", "created_at");
CREATE INDEX "payments_organization_id_status_idx" ON "payments"("organization_id", "status");
CREATE INDEX "payments_checkout_order_id_idx" ON "payments"("checkout_order_id");
CREATE INDEX "payment_line_items_payment_id_idx" ON "payment_line_items"("payment_id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_order_id_fkey" FOREIGN KEY ("checkout_order_id") REFERENCES "checkout_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
