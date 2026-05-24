import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DnsRecord, Prisma } from '@prisma/client';
import { jsonToDb } from '../../common/json-field';
import { DnsRecordStatus, DnsRecordType, DomainStatus } from '../../common/prisma-enums';
import * as crypto from 'crypto';
import { promises as dnsPromises } from 'dns';
import { PrismaService } from '../../database/prisma.service';
import { CreateDnsRecordDto } from './dto/create-dns-record.dto';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpdateDnsRecordDto } from './dto/update-dns-record.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';
import { DomainsRepository } from './domains.repository';

interface ActorContext {
  userId: string;
  organizationId: string;
}

interface ParsedRecord {
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
}

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private readonly domainsRepository: DomainsRepository,
    private readonly prisma: PrismaService
  ) {}

  list(context: ActorContext) {
    return this.domainsRepository.listDomains(context.organizationId);
  }

  async get(domainId: string, context: ActorContext) {
    const domain = await this.domainsRepository.findDomainById(domainId, context.organizationId);
    if (!domain) {
      throw new NotFoundException('Domain not found.');
    }
    return domain;
  }

  async create(dto: CreateDomainDto, context: ActorContext) {
    const hostname = this.normalizeHostname(dto.hostname);
    const rootDomain = this.extractRootDomain(hostname);

    const existing = await this.domainsRepository.findDomainByHostnameAny(hostname);
    if (existing && existing.deletedAt === null) {
      throw new ConflictException('This domain is already being managed.');
    }

    if (dto.projectId) {
      await this.getProjectOrThrow(dto.projectId, context.organizationId);
    }

    const verificationToken = `glondia-verify=${crypto.randomBytes(16).toString('hex')}`;

    const domain = await this.domainsRepository.createDomain({
      organizationId: context.organizationId,
      projectId: dto.projectId ?? null,
      hostname,
      rootDomain,
      verificationToken,
      createdByUserId: context.userId
    });

    await Promise.all([
      this.recordActivity(context, domain.id, 'domain.created', `Added domain ${domain.hostname}.`),
      this.recordAudit(context, 'domain.created', 'domain', domain.id, { hostname: domain.hostname })
    ]);

    return domain;
  }

  async update(domainId: string, dto: UpdateDomainDto, context: ActorContext) {
    const domain = await this.get(domainId, context);

    if (dto.projectId !== undefined) {
      if (dto.projectId) {
        await this.getProjectOrThrow(dto.projectId, context.organizationId);
      }
    }

    const updated = await this.domainsRepository.updateDomain(domain.id, {
      projectId: dto.projectId === undefined ? undefined : dto.projectId,
      status: dto.status as DomainStatus | undefined
    });

    await this.recordActivity(context, updated.id, 'domain.updated', `Updated domain ${updated.hostname}.`);
    return updated;
  }

  async verify(domainId: string, context: ActorContext) {
    const domain = await this.get(domainId, context);

    // Check for the verificationToken in DNS TXT records at the root domain.
    const ok = await this.checkTxtVerification(domain.rootDomain, domain.verificationToken);

    const newStatus: DomainStatus = ok ? DomainStatus.verified : DomainStatus.misconfigured;
    const extraUpdate: Prisma.DomainUncheckedUpdateInput = ok ? { verifiedAt: new Date() } : {};

    const updated = await this.domainsRepository.updateDomain(domain.id, {
      status: newStatus,
      ...extraUpdate,
    });

    if (ok) {
      await Promise.all([
        this.recordActivity(context, domain.id, 'domain.verified', `Domain ${domain.hostname} ownership verified.`),
        this.recordAudit(context, 'domain.verified', 'domain', domain.id, { hostname: domain.hostname }),
      ]);

      // Auto-provision a pending SSL certificate — the ACME worker handles the actual issuance.
      // Only create if there is no cert already in pending or active state for this domain.
      const existingCert = await this.prisma.sslCertificate.findFirst({
        where: { domainId: domain.id, status: { in: ['pending', 'active'] } },
      });
      if (!existingCert) {
        await this.prisma.sslCertificate.create({
          data: {
            organizationId: context.organizationId,
            domainId: domain.id,
            provider: 'letsencrypt',
            status: 'pending',
          },
        }).catch((err) => {
          this.logger.warn(`SSL cert auto-provision failed: ${(err as Error).message}`);
        });
      }
    } else {
      await this.recordActivity(
        context,
        domain.id,
        'domain.verification_failed',
        `Domain ${domain.hostname} verification failed — TXT record not found.`,
      );
    }

    return {
      ...updated,
      verified: ok,
      ...(ok
        ? {}
        : {
            hint: `Add a TXT record with value "${domain.verificationToken}" to ${domain.rootDomain} and try again in a few minutes.`,
          }),
    };
  }

  async archive(domainId: string, context: ActorContext) {
    const domain = await this.get(domainId, context);
    const archived = await this.domainsRepository.archiveDomain(domain.id);

    await Promise.all([
      this.recordActivity(context, domain.id, 'domain.deleted', `Archived domain ${domain.hostname}.`),
      this.recordAudit(context, 'domain.deleted', 'domain', domain.id, { hostname: domain.hostname })
    ]);

    return archived;
  }

  async listRecords(domainId: string, context: ActorContext) {
    await this.get(domainId, context);
    return this.domainsRepository.listRecords(domainId, context.organizationId);
  }

  async createRecord(domainId: string, dto: CreateDnsRecordDto, context: ActorContext) {
    const domain = await this.get(domainId, context);
    const record = await this.domainsRepository.createRecord({
      organizationId: context.organizationId,
      domainId: domain.id,
      type: dto.type as DnsRecordType,
      name: this.normalizeRecordName(dto.name),
      value: dto.value.trim(),
      ttl: dto.ttl ?? 3600,
      priority: dto.priority ?? null,
      proxied: dto.proxied ?? false
    });

    await Promise.all([
      this.recordActivity(context, domain.id, 'dns_record.created', `Created ${record.type} record for ${domain.hostname}.`),
      this.recordAudit(context, 'dns_record.created', 'dns_record', record.id, {
        domainId: domain.id,
        type: record.type,
        name: record.name
      })
    ]);

    return record;
  }

  async updateRecord(domainId: string, recordId: string, dto: UpdateDnsRecordDto, context: ActorContext) {
    const domain = await this.get(domainId, context);
    const record = await this.getRecordOrThrow(domain.id, recordId, context.organizationId);

    const updated = await this.domainsRepository.updateRecord(record.id, {
      type: dto.type as DnsRecordType | undefined,
      name: dto.name === undefined ? undefined : this.normalizeRecordName(dto.name),
      value: dto.value?.trim(),
      ttl: dto.ttl,
      priority: dto.priority,
      proxied: dto.proxied
    });

    await this.recordAudit(context, 'dns_record.updated', 'dns_record', updated.id, {
      domainId: domain.id,
      type: updated.type,
      name: updated.name
    });

    return updated;
  }

  async deleteRecord(domainId: string, recordId: string, context: ActorContext) {
    const domain = await this.get(domainId, context);
    const record = await this.getRecordOrThrow(domain.id, recordId, context.organizationId);
    await this.domainsRepository.deleteRecord(record.id);

    await this.recordAudit(context, 'dns_record.deleted', 'dns_record', record.id, {
      domainId: domain.id,
      type: record.type,
      name: record.name
    });

    return { deleted: true };
  }

  async getRecord(domainId: string, recordId: string, context: ActorContext) {
    const domain = await this.get(domainId, context);
    return this.getRecordOrThrow(domain.id, recordId, context.organizationId);
  }

  // ─── Bulk delete ──────────────────────────────────────────────────────────────

  async bulkDelete(domainId: string, recordIds: string[], context: ActorContext) {
    const domain = await this.get(domainId, context);

    // Verify every requested id actually belongs to this domain + org.
    const verified = (
      await Promise.all(
        recordIds.map((id) =>
          this.domainsRepository.findRecordById(id, domain.id, context.organizationId)
        )
      )
    ).filter((r): r is DnsRecord => r !== null);

    if (verified.length === 0) {
      throw new NotFoundException('No matching DNS records found.');
    }

    await this.domainsRepository.deleteRecordsByIds(
      verified.map((r) => r.id),
      context.organizationId
    );

    await this.recordAudit(context, 'dns_records.bulk_deleted', 'domain', domain.id, {
      count: verified.length,
      recordIds: verified.map((r) => r.id),
    });

    return { deleted: verified.length };
  }

  // ─── Zone file import ──────────────────────────────────────────────────────────

  async importZoneFile(
    domainId: string,
    content: string,
    overwrite: boolean,
    context: ActorContext
  ) {
    const domain = await this.get(domainId, context);

    const { records: parsed, warnings } = this.parseZoneFile(content, domain.rootDomain);

    if (parsed.length === 0) {
      return { imported: 0, skipped: 0, warnings: warnings.length ? warnings : ['No valid records found in zone file.'] };
    }

    const records = parsed.map((r) => ({
      organizationId: context.organizationId,
      domainId: domain.id,
      type: r.type,
      name: this.normalizeRecordName(r.name),
      value: r.value.trim(),
      ttl: Math.min(Math.max(r.ttl, 60), 86400),
      priority: r.priority,
      proxied: false,
      status: DnsRecordStatus.active,
    }));

    if (overwrite) {
      await this.domainsRepository.deleteAllRecordsForDomain(domain.id, context.organizationId);
    }

    const result = await this.domainsRepository.bulkCreateRecords(records);

    await Promise.all([
      this.recordActivity(
        context,
        domain.id,
        'dns_records.imported',
        `Imported ${result.count} DNS record${result.count === 1 ? '' : 's'} for ${domain.hostname}.`
      ),
      this.recordAudit(context, 'dns_records.imported', 'domain', domain.id, {
        count: result.count,
        overwrite,
      }),
    ]);

    return { imported: result.count, skipped: parsed.length - result.count, warnings };
  }

  // ─── Zone file export ──────────────────────────────────────────────────────────

  async exportZoneFile(domainId: string, context: ActorContext) {
    const domain = await this.get(domainId, context);
    const records = await this.domainsRepository.listRecords(domain.id, context.organizationId);

    const lines: string[] = [
      `; Zone file for ${domain.hostname}`,
      `; Generated by Glondia — ${new Date().toISOString()}`,
      `; Records: ${records.length}`,
      '',
      `$ORIGIN ${domain.rootDomain}.`,
      `$TTL 3600`,
      '',
    ];

    // Group by type for readability
    const ORDER: DnsRecordType[] = [
      DnsRecordType.A,
      DnsRecordType.AAAA,
      DnsRecordType.CNAME,
      DnsRecordType.MX,
      DnsRecordType.TXT,
      DnsRecordType.NS,
      DnsRecordType.SRV,
      DnsRecordType.CAA,
    ];

    const grouped = new Map<DnsRecordType, typeof records>();
    for (const type of ORDER) grouped.set(type, []);
    for (const r of records) {
      const type = r.type as DnsRecordType;
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type)!.push(r);
    }

    for (const [type, recs] of grouped) {
      if (recs.length === 0) continue;
      lines.push(`; ${type} Records`);
      for (const r of recs) {
        const prio = r.priority != null ? `${r.priority} ` : '';
        const value = type === DnsRecordType.TXT ? `"${r.value}"` : r.value;
        lines.push(`${r.name} ${r.ttl} IN ${type} ${prio}${value}`);
      }
      lines.push('');
    }

    return { hostname: domain.hostname, content: lines.join('\n') };
  }

  // ─── DNS TXT verification ─────────────────────────────────────────────────────

  /**
   * Looks up TXT records for `rootDomain` and checks whether any chunk
   * contains the `verificationToken`.  Returns false on any DNS error
   * (ENOTFOUND, ENODATA, timeout) so the caller can mark it as misconfigured.
   */
  private async checkTxtVerification(rootDomain: string, token: string): Promise<boolean> {
    try {
      const records = await dnsPromises.resolveTxt(rootDomain);
      // resolveTxt returns string[][] — each record may be chunked, so join chunks per record.
      return records.some((chunks) => chunks.join('').includes(token));
    } catch (err) {
      this.logger.debug(`DNS TXT lookup for ${rootDomain} failed: ${(err as Error).message}`);
      return false;
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async getProjectOrThrow(projectId: string, organizationId: string) {
    const project = await this.domainsRepository.findProjectForOrganization(projectId, organizationId);
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  private async getRecordOrThrow(domainId: string, recordId: string, organizationId: string) {
    const record = await this.domainsRepository.findRecordById(recordId, domainId, organizationId);
    if (!record) {
      throw new NotFoundException('DNS record not found.');
    }
    return record;
  }

  private normalizeHostname(value: string) {
    return value.trim().toLowerCase().replace(/\.$/, '');
  }

  private extractRootDomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }

  private normalizeRecordName(value: string) {
    return value.trim().toLowerCase() || '@';
  }

  // ─── Zone file parser ─────────────────────────────────────────────────────────

  /**
   * Parses a BIND-format zone file into structured records.
   * Handles: $TTL, $ORIGIN, comments, blank-owner continuation lines,
   * optional IN class, quoted TXT values, MX/SRV priority, trailing dots.
   */
  private parseZoneFile(
    content: string,
    rootDomain: string
  ): { records: ParsedRecord[]; warnings: string[] } {
    const SUPPORTED = new Set<string>(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA']);
    const records: ParsedRecord[] = [];
    const warnings: string[] = [];

    let defaultTtl = 3600;
    let lastOwner = '@';
    let lineNum = 0;

    for (const rawLine of content.split('\n')) {
      lineNum++;

      // Strip inline comments, trim
      const line = rawLine.replace(/;.*$/, '').trim();
      if (!line) continue;

      // $TTL directive
      if (/^\$TTL\s+/i.test(line)) {
        defaultTtl = this.parseTtlString(line.split(/\s+/)[1] ?? '3600');
        continue;
      }

      // $ORIGIN / $GENERATE / other directives — skip
      if (/^\$/.test(line)) continue;

      const tokens = this.tokenizeZoneLine(line);
      if (tokens.length < 2) continue;

      let i = 0;
      let owner: string;

      // Blank-leading whitespace means same owner as last record
      if (/^\s/.test(rawLine)) {
        owner = lastOwner;
      } else {
        owner = tokens[i++];
        lastOwner = owner;
      }

      // Optional numeric TTL
      let ttl = defaultTtl;
      if (i < tokens.length && /^\d+$/.test(tokens[i])) {
        ttl = parseInt(tokens[i++], 10);
      }

      // Optional class (IN / CH / HS)
      if (i < tokens.length && /^(IN|CH|HS)$/i.test(tokens[i])) i++;

      const type = (tokens[i++] ?? '').toUpperCase();
      if (!SUPPORTED.has(type)) {
        if (type) warnings.push(`Line ${lineNum}: unsupported type "${type}" — skipped.`);
        continue;
      }

      const vals = tokens.slice(i);
      if (vals.length === 0) {
        warnings.push(`Line ${lineNum}: missing value for ${type} record — skipped.`);
        continue;
      }

      const name = this.normalizeZoneOwner(owner, rootDomain);
      let value = '';
      let priority: number | null = null;

      try {
        switch (type) {
          case 'MX':
            if (vals.length < 2) {
              warnings.push(`Line ${lineNum}: MX needs "priority target" — skipped.`);
              continue;
            }
            priority = parseInt(vals[0], 10) || 10;
            value = this.stripDot(vals[1]);
            break;

          case 'SRV':
            if (vals.length < 4) {
              warnings.push(`Line ${lineNum}: SRV needs "priority weight port target" — skipped.`);
              continue;
            }
            priority = parseInt(vals[0], 10) || 0;
            // store remaining as "weight port target"
            value = [vals[1], vals[2], this.stripDot(vals[3])].join(' ');
            break;

          case 'TXT':
            // Tokens are already unquoted by the tokenizer; rejoin multi-part values
            value = vals.join(' ');
            break;

          case 'CAA':
            // "flag tag value"
            value = vals.join(' ');
            break;

          default:
            value = this.stripDot(vals.join(' '));
        }

        if (!value.trim()) {
          warnings.push(`Line ${lineNum}: empty value — skipped.`);
          continue;
        }

        records.push({ type: type as DnsRecordType, name, value, ttl, priority });
      } catch {
        warnings.push(`Line ${lineNum}: parse error — skipped.`);
      }
    }

    return { records, warnings };
  }

  /**
   * Tokenizes a zone file line, respecting double-quoted strings
   * (TXT record values may be quoted and contain spaces).
   */
  private tokenizeZoneLine(line: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (/\s/.test(line[i])) { i++; continue; }
      if (line[i] === '"') {
        i++; // skip opening quote
        let str = '';
        while (i < line.length && line[i] !== '"') str += line[i++];
        if (i < line.length) i++; // skip closing quote
        tokens.push(str);
      } else {
        let tok = '';
        while (i < line.length && !/\s/.test(line[i])) tok += line[i++];
        tokens.push(tok);
      }
    }
    return tokens;
  }

  /**
   * Converts a zone owner (@, hostname, or FQDN) to the normalised
   * record name stored in the DB (@ for apex, bare subdomain for the rest).
   */
  private normalizeZoneOwner(owner: string, rootDomain: string): string {
    if (owner === '@') return '@';
    const stripped = owner.replace(/\.$/, '');
    if (stripped === rootDomain) return '@';
    if (stripped.endsWith('.' + rootDomain)) {
      return stripped.slice(0, -(rootDomain.length + 1)).toLowerCase();
    }
    return stripped.toLowerCase();
  }

  private stripDot(s: string): string {
    return s.endsWith('.') ? s.slice(0, -1) : s;
  }

  private parseTtlString(s: string): number {
    const m = (s ?? '').match(/^(\d+)([smhd]?)$/i);
    if (!m) return parseInt(s, 10) || 3600;
    const n = parseInt(m[1], 10);
    switch ((m[2] ?? '').toLowerCase()) {
      case 'm': return n * 60;
      case 'h': return n * 3600;
      case 'd': return n * 86400;
      default:  return n;
    }
  }

  private recordActivity(context: ActorContext, entityId: string, action: string, message: string) {
    return this.prisma.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: 'domain',
        entityId,
        action,
        message,
        metadata: jsonToDb({})
      }
    });
  }

  private recordAudit(
    context: ActorContext,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Prisma.InputJsonObject
  ) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action,
        resourceType,
        resourceId,
        metadata: jsonToDb(metadata)
      }
    });
  }
}
