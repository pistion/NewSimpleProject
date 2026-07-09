-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('pending_dns', 'active', 'suspended', 'transferring', 'expired', 'deleted');

-- CreateEnum
CREATE TYPE "DnsRecordType" AS ENUM ('A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA');

-- CreateTable
CREATE TABLE "domains" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'pending_dns',
    "registrar" TEXT,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "whois_privacy" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "ssl_issued_at" TIMESTAMP(3),
    "created_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dns_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "type" "DnsRecordType" NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "ttl" INTEGER NOT NULL DEFAULT 3600,
    "priority" INTEGER,
    "proxied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dns_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_name_key" ON "domains"("name");

-- CreateIndex
CREATE INDEX "domains_created_by_user_id_idx" ON "domains"("created_by_user_id");

-- CreateIndex
CREATE INDEX "domains_organization_id_status_idx" ON "domains"("organization_id", "status");

-- CreateIndex
CREATE INDEX "domains_project_id_idx" ON "domains"("project_id");

-- CreateIndex
CREATE INDEX "dns_records_domain_id_idx" ON "dns_records"("domain_id");

-- CreateIndex
CREATE INDEX "dns_records_organization_id_idx" ON "dns_records"("organization_id");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
