import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DnsRecordStatus, DnsRecordType, DomainStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DomainsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listDomains(organizationId: string) {
    return this.prisma.domain.findMany({
      where: { organizationId, deletedAt: null },
      include: { project: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  findDomainById(domainId: string, organizationId: string) {
    return this.prisma.domain.findFirst({
      where: { id: domainId, organizationId, deletedAt: null },
      include: { project: true }
    });
  }

  findDomainByHostname(hostname: string, organizationId: string) {
    return this.prisma.domain.findFirst({
      where: { hostname, organizationId }
    });
  }

  findDomainByHostnameAny(hostname: string) {
    return this.prisma.domain.findFirst({ where: { hostname } });
  }

  createDomain(data: {
    organizationId: string;
    projectId?: string | null;
    hostname: string;
    rootDomain: string;
    verificationToken: string;
    createdByUserId: string;
  }) {
    return this.prisma.domain.create({
      data: {
        ...data,
        status: 'pending_verification'
      },
      include: { project: true }
    });
  }

  updateDomain(domainId: string, data: Prisma.DomainUncheckedUpdateInput) {
    return this.prisma.domain.update({
      where: { id: domainId },
      data,
      include: { project: true }
    });
  }

  archiveDomain(domainId: string) {
    return this.prisma.domain.update({
      where: { id: domainId },
      data: {
        status: DomainStatus.disabled,
        deletedAt: new Date(),
        projectId: null
      },
      include: { project: true }
    });
  }

  findProjectForOrganization(projectId: string, organizationId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null }
    });
  }

  listRecords(domainId: string, organizationId: string) {
    return this.prisma.dnsRecord.findMany({
      where: { domainId, organizationId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
    });
  }

  findRecordById(recordId: string, domainId: string, organizationId: string) {
    return this.prisma.dnsRecord.findFirst({
      where: { id: recordId, domainId, organizationId }
    });
  }

  createRecord(data: {
    organizationId: string;
    domainId: string;
    type: DnsRecordType;
    name: string;
    value: string;
    ttl: number;
    priority?: number | null;
    proxied: boolean;
    status?: DnsRecordStatus;
  }) {
    return this.prisma.dnsRecord.create({
      data: { ...data, status: data.status ?? DnsRecordStatus.active },
    });
  }

  bulkCreateRecords(records: Array<{
    organizationId: string;
    domainId: string;
    type: DnsRecordType;
    name: string;
    value: string;
    ttl: number;
    priority: number | null;
    proxied: boolean;
    status: DnsRecordStatus;
  }>) {
    return this.prisma.dnsRecord.createMany({ data: records });
  }

  updateRecord(recordId: string, data: Prisma.DnsRecordUncheckedUpdateInput) {
    return this.prisma.dnsRecord.update({ where: { id: recordId }, data });
  }

  deleteRecord(recordId: string) {
    return this.prisma.dnsRecord.delete({ where: { id: recordId } });
  }

  deleteRecordsByIds(ids: string[], organizationId: string) {
    return this.prisma.dnsRecord.deleteMany({
      where: { id: { in: ids }, organizationId },
    });
  }

  deleteAllRecordsForDomain(domainId: string, organizationId: string) {
    return this.prisma.dnsRecord.deleteMany({ where: { domainId, organizationId } });
  }

  updateRecordStatus(id: string, status: DnsRecordStatus) {
    return this.prisma.dnsRecord.update({ where: { id }, data: { status } });
  }
}
