import { Injectable } from '@nestjs/common';
import { SslCertificateStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SslRepository {
  constructor(private readonly prisma: PrismaService) {}

  listCertificatesForOrg(organizationId: string) {
    return this.prisma.sslCertificate.findMany({
      where: { organizationId },
      include: { domain: { select: { id: true, hostname: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  listCertificatesForDomain(domainId: string, organizationId: string) {
    return this.prisma.sslCertificate.findMany({
      where: { domainId, organizationId },
      orderBy: { createdAt: 'desc' }
    });
  }

  findCertificateById(id: string, organizationId: string) {
    return this.prisma.sslCertificate.findFirst({
      where: { id, organizationId },
      include: { domain: true }
    });
  }

  findActiveCertificateForDomain(domainId: string) {
    return this.prisma.sslCertificate.findFirst({
      where: { domainId, status: 'active' },
      orderBy: { expiresAt: 'desc' }
    });
  }

  createCertificate(data: {
    organizationId: string;
    domainId: string;
    provider: string;
    status?: SslCertificateStatus;
  }) {
    return this.prisma.sslCertificate.create({
      data: {
        organizationId: data.organizationId,
        domainId: data.domainId,
        provider: data.provider,
        status: data.status ?? 'pending'
      }
    });
  }

  updateCertificateStatus(id: string, status: SslCertificateStatus, extra?: {
    issuedAt?: Date;
    expiresAt?: Date;
    certificateRef?: string;
  }) {
    return this.prisma.sslCertificate.update({
      where: { id },
      data: { status, ...extra }
    });
  }

  findDomainById(domainId: string, organizationId: string) {
    return this.prisma.domain.findFirst({
      where: { id: domainId, organizationId, deletedAt: null }
    });
  }
}
