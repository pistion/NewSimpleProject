-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('uploading', 'ready', 'deleted');

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "deployment_id" UUID,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'uploading',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artifacts_deployment_id_idx" ON "artifacts"("deployment_id");

-- CreateIndex
CREATE INDEX "artifacts_organization_id_created_at_idx" ON "artifacts"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "artifacts_project_id_created_at_idx" ON "artifacts"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
