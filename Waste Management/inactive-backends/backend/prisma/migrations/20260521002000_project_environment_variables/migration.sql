-- CreateEnum
CREATE TYPE "ProjectEnvironment" AS ENUM ('production', 'preview', 'development');

-- CreateTable
CREATE TABLE "project_environment_variables" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value_encrypted" TEXT NOT NULL,
    "environment" "ProjectEnvironment" NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_environment_variables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_environment_variables_created_by_user_id_idx" ON "project_environment_variables"("created_by_user_id");

-- CreateIndex
CREATE INDEX "project_environment_variables_organization_id_environment_idx" ON "project_environment_variables"("organization_id", "environment");

-- CreateIndex
CREATE INDEX "project_environment_variables_project_id_idx" ON "project_environment_variables"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_environment_variables_project_id_key_environment_key" ON "project_environment_variables"("project_id", "key", "environment");

-- AddForeignKey
ALTER TABLE "project_environment_variables" ADD CONSTRAINT "project_environment_variables_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_environment_variables" ADD CONSTRAINT "project_environment_variables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_environment_variables" ADD CONSTRAINT "project_environment_variables_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
