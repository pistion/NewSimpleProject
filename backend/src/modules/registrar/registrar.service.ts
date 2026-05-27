import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DnsRecord } from '@prisma/client';
import { DnsRecordStatus, DnsRecordType } from '../../common/prisma-enums';
import { DomainsRepository } from '../domains/domains.repository';
import { RegistrarQueueService } from '../../workers/queues/registrar-queue.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { RegisterDomainDto } from './dto/register-domain.dto';
import { RenewDomainDto } from './dto/renew-domain.dto';
import { UpdateNameserversDto } from './dto/update-nameservers.dto';
import {
  SpaceshipDnsRecord,
  SpaceshipDnsA,
  SpaceshipDnsAAAA,
  SpaceshipDnsCNAME,
  SpaceshipDnsALIAS,
  SpaceshipDnsMX,
  SpaceshipDnsNS,
  SpaceshipDnsTXT,
  SpaceshipDnsSRV,
  SpaceshipDnsCAA,
} from './spaceship/spaceship.types';
import { SpaceshipService } from './spaceship/spaceship.service';

interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class RegistrarService {
  private readonly logger = new Logger(RegistrarService.name);

  constructor(
    private readonly spaceship: SpaceshipService,
    private readonly domainsRepo: DomainsRepository,
    private readonly registrarQueue: RegistrarQueueService,
    private readonly config: ConfigService
  ) {}

  // ─── Availability check ───────────────────────────────────────────────────

  async checkAvailability(dto: CheckAvailabilityDto) {
    const result = await this.spaceship.checkAvailability(dto.domains);
    return result.domains.map(d => ({
      domain: d.domain,
      available: d.result === 'available',
      status: d.result,
      pricing: d.premiumPricing ?? null,
    }));
  }

  // ─── Domain registration ──────────────────────────────────────────────────

  async registerDomain(dto: RegisterDomainDto, context: ActorContext) {
    const hostname = dto.hostname.toLowerCase().trim();
    const contactId =
      dto.contactId ?? this.config.get<string>('SPACESHIP_DEFAULT_CONTACT_ID') ?? '';

    if (!contactId) {
      throw new BadRequestException(
        'No registrant contact ID supplied and SPACESHIP_DEFAULT_CONTACT_ID is not configured.'
      );
    }

    // Create the domain record immediately so the user sees it right away
    const existing = await this.domainsRepo.findDomainByHostnameAny(hostname);
    let domainRecord = existing && !existing.deletedAt ? existing : null;

    if (!domainRecord) {
      domainRecord = await this.domainsRepo.createDomain({
        organizationId: context.organizationId,
        projectId: dto.projectId ?? null,
        hostname,
        rootDomain: hostname,
        verificationToken: `glondia-registrar=${Date.now()}`,
        createdByUserId: context.userId,
      });
    }

    // Enqueue the Spaceship API call — does not block the HTTP response
    await this.registrarQueue.enqueueRegistration({
      version: 1,
      domainId: domainRecord.id,
      organizationId: context.organizationId,
      userId: context.userId,
      hostname,
      contactId,
      years: dto.years ?? 1,
      autoRenew: dto.autoRenew ?? true,
      privacyProtection: dto.privacyProtection !== false,
      projectId: dto.projectId ?? null,
    });

    return {
      domainId: domainRecord.id,
      status: 'queued',
      domain: hostname,
      message: 'Registration queued — you will receive a status update when complete.',
    };
  }

  // ─── Domain renewal ───────────────────────────────────────────────────────

  async renewDomain(dto: RenewDomainDto, context: ActorContext) {
    const op = await this.spaceship.renewDomain(dto.name, dto.years, dto.currentExpirationDate);
    return { operationId: op.operationId, status: op.status, domain: dto.name };
  }

  // ─── Registrar domain list / detail ───────────────────────────────────────

  async listRegistrarDomains(skip = 0, take = 100) {
    const result = await this.spaceship.listDomains(skip, take);
    return result;
  }

  async getRegistrarDomain(name: string) {
    const domain = await this.spaceship.getDomain(name);
    return domain;
  }

  // ─── Nameserver management ────────────────────────────────────────────────

  async updateNameservers(domainName: string, dto: UpdateNameserversDto, _context: ActorContext) {
    if (dto.provider === 'custom' && (!dto.hosts || dto.hosts.length < 2)) {
      throw new BadRequestException('Custom provider requires at least 2 nameserver hosts.');
    }
    await this.spaceship.updateNameservers(domainName, dto.provider, dto.hosts);
    return { domain: domainName, provider: dto.provider, hosts: dto.hosts ?? [] };
  }

  // ─── DNS sync: local → Spaceship ─────────────────────────────────────────

  async syncDnsToSpaceship(domainId: string, context: ActorContext) {
    const domain = await this.domainsRepo.findDomainById(domainId, context.organizationId);
    if (!domain) throw new NotFoundException('Domain not found.');

    const localRecords = await this.domainsRepo.listRecords(domainId, context.organizationId);
    if (localRecords.length === 0) {
      return { pushed: 0, domain: domain.hostname };
    }

    const spaceshipRecords = localRecords
      .map(r => this.toSpaceshipRecord(r, domain.hostname))
      .filter((r): r is SpaceshipDnsRecord => r !== null);

    await this.spaceship.saveDnsRecords(domain.hostname, spaceshipRecords, true);
    this.logger.log(`Pushed ${spaceshipRecords.length} DNS records to Spaceship for ${domain.hostname}`);

    return { pushed: spaceshipRecords.length, domain: domain.hostname };
  }

  // ─── DNS sync: Spaceship → local ─────────────────────────────────────────

  async pullDnsFromSpaceship(domainId: string, context: ActorContext) {
    const domain = await this.domainsRepo.findDomainById(domainId, context.organizationId);
    if (!domain) throw new NotFoundException('Domain not found.');

    const list = await this.spaceship.listDnsRecords(domain.hostname, 0, 500);
    const spaceshipRecords = list.items;

    // Wipe existing and replace
    await this.domainsRepo.deleteAllRecordsForDomain(domainId, context.organizationId);

    const toCreate = spaceshipRecords
      .map(r => this.fromSpaceshipRecord(r, domainId, context.organizationId, domain.hostname))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (toCreate.length > 0) {
      await this.domainsRepo.bulkCreateRecords(toCreate);
    }

    this.logger.log(`Pulled ${toCreate.length} DNS records from Spaceship for ${domain.hostname}`);
    return { pulled: toCreate.length, domain: domain.hostname };
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async createContact(dto: CreateContactDto) {
    const contact = await this.spaceship.createContact({
      firstName: dto.firstName,
      lastName: dto.lastName,
      company: dto.company,
      email: dto.email,
      phone: dto.phone,
      address1: dto.address1,
      address2: dto.address2,
      city: dto.city,
      postalCode: dto.postalCode,
      country: dto.country,
    });
    return contact;
  }

  async listContacts(skip = 0, take = 100) {
    return this.spaceship.listContacts(skip, take);
  }

  // ─── Operation status ─────────────────────────────────────────────────────

  getOperation(operationId: string) {
    return this.spaceship.getOperation(operationId);
  }

  // ─── Auto-renew toggle ────────────────────────────────────────────────────

  async setAutoRenew(domainName: string, autoRenew: boolean, _context: ActorContext) {
    await this.spaceship.setAutoRenew(domainName, autoRenew);
    return { domain: domainName, autoRenew };
  }

  // ─── DNS format mappers ───────────────────────────────────────────────────

  /**
   * Convert an internal DnsRecord row → Spaceship DNS record shape.
   * Returns null if the record type is not supported by Spaceship.
   */
  private toSpaceshipRecord(r: DnsRecord, hostname: string): SpaceshipDnsRecord | null {
    // Spaceship uses owner-relative names (@ for apex, or subdomain without trailing domain)
    const name = this.toRelativeName(r.name, hostname);

    const base = { name, ttl: r.ttl };

    switch (r.type) {
      case DnsRecordType.A:
        return { ...base, type: 'A', address: r.value } as SpaceshipDnsA;

      case DnsRecordType.AAAA:
        return { ...base, type: 'AAAA', address: r.value } as SpaceshipDnsAAAA;

      case DnsRecordType.CNAME:
        return { ...base, type: 'CNAME', target: r.value } as SpaceshipDnsCNAME;

      case DnsRecordType.MX: {
        // value stored as "priority exchange" or just exchange if priority is separate
        const prio = r.priority ?? 10;
        return { ...base, type: 'MX', exchange: r.value, preference: prio } as SpaceshipDnsMX;
      }

      case DnsRecordType.TXT:
        return { ...base, type: 'TXT', data: r.value } as SpaceshipDnsTXT;

      case DnsRecordType.NS:
        return { ...base, type: 'NS', nameserver: r.value } as SpaceshipDnsNS;

      case DnsRecordType.SRV: {
        // value stored as "weight port target"
        const parts = r.value.split(' ');
        const weight = parseInt(parts[0] ?? '0', 10);
        const port = parseInt(parts[1] ?? '80', 10);
        const target = parts[2] ?? r.value;
        return {
          ...base,
          type: 'SRV',
          priority: r.priority ?? 10,
          weight,
          port,
          target,
        } as SpaceshipDnsSRV;
      }

      case DnsRecordType.CAA: {
        // value stored as "flag tag value"
        const parts = r.value.split(' ');
        const flag = parseInt(parts[0] ?? '0', 10);
        const tag = parts[1] ?? 'issue';
        const caaValue = parts.slice(2).join(' ') || r.value;
        return { ...base, type: 'CAA', flag, tag, value: caaValue } as SpaceshipDnsCAA;
      }

      default:
        this.logger.warn(`Unsupported DNS type for Spaceship push: ${r.type}`);
        return null;
    }
  }

  /**
   * Convert a Spaceship DNS record → shape suitable for DomainsRepository.bulkCreateRecords.
   * Returns null if the record type is unrecognised or unmappable.
   */
  private fromSpaceshipRecord(
    r: SpaceshipDnsRecord,
    domainId: string,
    organizationId: string,
    hostname: string
  ) {
    const name = this.toAbsoluteName((r as any).name ?? '@', hostname);
    const ttl = (r as any).ttl ?? 3600;

    const base = { domainId, organizationId, name, ttl, proxied: false, status: DnsRecordStatus.active };

    switch (r.type) {
      case 'A':
        return { ...base, type: DnsRecordType.A, value: (r as SpaceshipDnsA).address, priority: null };

      case 'AAAA':
        return { ...base, type: DnsRecordType.AAAA, value: (r as SpaceshipDnsAAAA).address, priority: null };

      case 'CNAME':
        return { ...base, type: DnsRecordType.CNAME, value: (r as SpaceshipDnsCNAME).target, priority: null };

      case 'ALIAS':
        return { ...base, type: DnsRecordType.CNAME, value: (r as SpaceshipDnsALIAS).target, priority: null };

      case 'MX': {
        const mx = r as SpaceshipDnsMX;
        return { ...base, type: DnsRecordType.MX, value: mx.exchange, priority: mx.preference };
      }

      case 'NS':
        return { ...base, type: DnsRecordType.NS, value: (r as SpaceshipDnsNS).nameserver, priority: null };

      case 'TXT':
        return { ...base, type: DnsRecordType.TXT, value: (r as SpaceshipDnsTXT).data, priority: null };

      case 'SRV': {
        const srv = r as SpaceshipDnsSRV;
        return {
          ...base,
          type: DnsRecordType.SRV,
          value: `${srv.weight} ${srv.port} ${srv.target}`,
          priority: srv.priority,
        };
      }

      case 'CAA': {
        const caa = r as SpaceshipDnsCAA;
        return {
          ...base,
          type: DnsRecordType.CAA,
          value: `${caa.flag} ${caa.tag} ${caa.value}`,
          priority: null,
        };
      }

      default:
        this.logger.warn(`Unrecognised Spaceship DNS type during pull: ${r.type}`);
        return null;
    }
  }

  // ─── Name helpers ─────────────────────────────────────────────────────────

  /** Convert an absolute FQDN to a Spaceship-relative name (@ for apex). */
  private toRelativeName(name: string, hostname: string): string {
    const n = name.replace(/\.$/, '').toLowerCase();
    const h = hostname.replace(/\.$/, '').toLowerCase();
    if (n === h || n === '@') return '@';
    if (n.endsWith('.' + h)) return n.slice(0, -(h.length + 1));
    return n; // already relative
  }

  /** Convert a Spaceship-relative name to a fully-qualified or subdomain name. */
  private toAbsoluteName(name: string, hostname: string): string {
    if (name === '@' || name === '') return hostname;
    if (name.endsWith('.')) return name.replace(/\.$/, ''); // already FQDN
    return `${name}.${hostname}`;
  }
}
