import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpaceshipAsyncOp,
  SpaceshipAvailabilityResult,
  SpaceshipContact,
  SpaceshipContactList,
  SpaceshipCreateContactOptions,
  SpaceshipDnsRecord,
  SpaceshipDnsRecordList,
  SpaceshipDomain,
  SpaceshipDomainList,
  SpaceshipOperation,
  SpaceshipRegisterOptions,
} from './spaceship.types';

@Injectable()
export class SpaceshipService {
  private readonly BASE = 'https://spaceship.dev/api/v1';
  private readonly logger = new Logger(SpaceshipService.name);

  constructor(private readonly config: ConfigService) {}

  // ─── Auth headers ──────────────────────────────────────────────────────────

  private get headers(): Record<string, string> {
    const key = this.config.get<string>('SPACESHIP_API_KEY');
    const secret = this.config.get<string>('SPACESHIP_API_SECRET');

    if (!key || !secret) {
      throw new ServiceUnavailableException(
        'Spaceship API credentials are not configured (SPACESHIP_API_KEY / SPACESHIP_API_SECRET).'
      );
    }

    return {
      'Content-Type': 'application/json',
      'X-Api-Key': key,
      'X-Api-Secret': secret,
    };
  }

  // ─── Core request helper ───────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number>
  ): Promise<T> {
    const qs = query
      ? '?' + Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      : '';

    const url = `${this.BASE}${path}${qs}`;
    this.logger.debug(`${method} ${url}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `Spaceship API unreachable: ${(err as Error).message}`
      );
    }

    // 202 Accepted — async operation
    if (response.status === 202) {
      const operationId = response.headers.get('spaceship-async-operationid') ?? '';
      return { operationId, status: 'pending' } as T;
    }

    // 204 No Content
    if (response.status === 204) return {} as T;

    const text = await response.text();

    if (!response.ok) {
      this.logger.warn(`Spaceship ${response.status}: ${text}`);
      let detail = text;
      try { detail = JSON.parse(text)?.message ?? text; } catch { /* keep raw */ }
      throw new ServiceUnavailableException(`Spaceship API error ${response.status}: ${detail}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }

  // ─── Domain availability ───────────────────────────────────────────────────

  checkAvailability(domains: string[]): Promise<SpaceshipAvailabilityResult> {
    return this.request('POST', '/domains/available', { domains });
  }

  // ─── Domain registration / renewal ────────────────────────────────────────

  registerDomain(domain: string, opts: SpaceshipRegisterOptions): Promise<SpaceshipAsyncOp> {
    return this.request('POST', `/domains/${domain}`, opts);
  }

  renewDomain(domain: string, years: number, currentExpirationDate: string): Promise<SpaceshipAsyncOp> {
    return this.request('POST', `/domains/${domain}/renew`, { years, currentExpirationDate });
  }

  // ─── Domain management ────────────────────────────────────────────────────

  listDomains(skip = 0, take = 100): Promise<SpaceshipDomainList> {
    return this.request('GET', '/domains', undefined, { skip, take });
  }

  getDomain(domain: string): Promise<SpaceshipDomain> {
    return this.request('GET', `/domains/${domain}`);
  }

  setAutoRenew(domain: string, autoRenew: boolean): Promise<void> {
    return this.request('PUT', `/domains/${domain}/autorenew`, { autoRenew });
  }

  updateNameservers(domain: string, provider: 'basic' | 'custom', hosts?: string[]): Promise<void> {
    return this.request('PUT', `/domains/${domain}/nameservers`, {
      provider,
      ...(hosts ? { hosts } : {}),
    });
  }

  // ─── DNS records ──────────────────────────────────────────────────────────

  listDnsRecords(domain: string, skip = 0, take = 500): Promise<SpaceshipDnsRecordList> {
    return this.request('GET', `/dns/records/${domain}`, undefined, { skip, take });
  }

  saveDnsRecords(domain: string, items: SpaceshipDnsRecord[], force = false): Promise<void> {
    return this.request('PUT', `/dns/records/${domain}`, { force, items });
  }

  deleteDnsRecords(domain: string, items: Partial<SpaceshipDnsRecord>[]): Promise<void> {
    return this.request('DELETE', `/dns/records/${domain}`, { items });
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  createContact(opts: SpaceshipCreateContactOptions): Promise<SpaceshipContact> {
    return this.request('POST', '/contacts', opts);
  }

  listContacts(skip = 0, take = 100): Promise<SpaceshipContactList> {
    return this.request('GET', '/contacts', undefined, { skip, take });
  }

  // ─── Async operations ─────────────────────────────────────────────────────

  getOperation(operationId: string): Promise<SpaceshipOperation> {
    return this.request('GET', `/async-operations/${operationId}`);
  }
}
