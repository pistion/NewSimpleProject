import { Injectable, NotFoundException } from '@nestjs/common';
import { SslRepository } from './ssl.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class SslService {
  constructor(private readonly repo: SslRepository) {}

  listForDomain(domainId: string, context: ActorContext) {
    return this.repo.listCertificatesForDomain(domainId, context.organizationId);
  }

  listAll(context: ActorContext) {
    return this.repo.listCertificatesForOrg(context.organizationId);
  }

  async get(certId: string, context: ActorContext) {
    const cert = await this.repo.findCertificateById(certId, context.organizationId);
    if (!cert) throw new NotFoundException('SSL certificate not found.');
    return cert;
  }

  /**
   * Triggers certificate issuance for the domain.
   * Creates the record in `pending` status; a background worker would
   * handle the actual ACME challenge and certificate issuance.
   */
  async requestCertificate(domainId: string, context: ActorContext) {
    const domain = await this.repo.findDomainById(domainId, context.organizationId);
    if (!domain) throw new NotFoundException('Domain not found.');

    // Return existing valid cert if present
    const existing = await this.repo.findActiveCertificateForDomain(domainId);
    if (existing && existing.expiresAt && existing.expiresAt > new Date()) {
      return existing;
    }

    const cert = await this.repo.createCertificate({
      organizationId: context.organizationId,
      domainId,
      provider: 'letsencrypt',
      status: 'pending'
    });

    // TODO: enqueue BullMQ job → ACME HTTP-01 challenge → certificate issuance
    // await this.sslQueue.add('issue-certificate', { certId: cert.id, hostname: domain.hostname });

    return cert;
  }

  async revoke(certId: string, context: ActorContext) {
    await this.get(certId, context);
    // Mark as expired — the nearest valid terminal state for a manually revoked cert.
    // A proper ACME revocation would call the CA's revoke endpoint first.
    return this.repo.updateCertificateStatus(certId, 'expired');
  }
}
