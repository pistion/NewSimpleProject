-- AlterTable
ALTER TABLE "projects" ADD COLUMN "render_service_id" TEXT;

-- AlterTable
ALTER TABLE "deployments" ADD COLUMN "provider" TEXT,
ADD COLUMN "provider_service_id" TEXT,
ADD COLUMN "provider_deploy_id" TEXT,
ADD COLUMN "provider_status" TEXT;

-- CreateIndex
CREATE INDEX "deployments_provider_provider_deploy_id_idx" ON "deployments"("provider", "provider_deploy_id");
