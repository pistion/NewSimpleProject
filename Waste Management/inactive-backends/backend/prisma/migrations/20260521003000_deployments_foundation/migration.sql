-- CreateEnum
CREATE TYPE "DeploymentEnvironment" AS ENUM ('production', 'preview');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('queued', 'building', 'uploading', 'deployed', 'failed', 'cancelled', 'rolled_back');

-- CreateEnum
CREATE TYPE "DeploymentSource" AS ENUM ('git', 'builder', 'manual');

-- CreateEnum
CREATE TYPE "DeploymentLogLevel" AS ENUM ('info', 'warn', 'error', 'debug');

-- CreateTable
CREATE TABLE "deployments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "environment" "DeploymentEnvironment" NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'queued',
    "source" "DeploymentSource" NOT NULL,
    "commit_sha" TEXT,
    "commit_message" TEXT,
    "branch" TEXT,
    "triggered_by_user_id" UUID,
    "artifact_id" UUID,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_logs" (
    "id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "level" "DeploymentLogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deployments_organization_id_status_idx" ON "deployments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "deployments_organization_id_created_at_idx" ON "deployments"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "deployments_project_id_created_at_idx" ON "deployments"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "deployments_triggered_by_user_id_idx" ON "deployments"("triggered_by_user_id");

-- CreateIndex
CREATE INDEX "deployment_logs_organization_id_created_at_idx" ON "deployment_logs"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_logs_deployment_id_sequence_key" ON "deployment_logs"("deployment_id", "sequence");

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
