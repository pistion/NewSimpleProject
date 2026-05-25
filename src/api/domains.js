export function createDomainActions({
  apiRequest,
  createId,
  mapApiDnsRecord,
  mapApiDomain,
  notifyDataChanged,
  readLocalDb,
  registrarRequest,
}) {
  async function createDomain(input) {
    const domain = await apiRequest('/domains', { method: 'POST', body: JSON.stringify(input) });
    notifyDataChanged();
    return mapApiDomain(domain);
  }

  return {
    async createDomain(input) {
      return createDomain(input);
    },

    async updateDomain(domainId, input) {
      const domain = await apiRequest(`/domains/${domainId}`, { method: 'PATCH', body: JSON.stringify(input) });
      notifyDataChanged();
      return mapApiDomain(domain);
    },

    async deleteDomain(domainId) {
      const domain = await apiRequest(`/domains/${domainId}`, { method: 'DELETE' });
      notifyDataChanged();
      return mapApiDomain(domain);
    },

    async createDnsRecord(domainId, input) {
      const record = await apiRequest(`/domains/${domainId}/dns-records`, { method: 'POST', body: JSON.stringify(input) });
      notifyDataChanged();
      return mapApiDnsRecord(record);
    },

    async updateDnsRecord(domainId, recordId, input) {
      const record = await apiRequest(`/domains/${domainId}/dns-records/${recordId}`, { method: 'PATCH', body: JSON.stringify(input) });
      notifyDataChanged();
      return mapApiDnsRecord(record);
    },

    async deleteDnsRecord(domainId, recordId) {
      const result = await apiRequest(`/domains/${domainId}/dns-records/${recordId}`, { method: 'DELETE' });
      notifyDataChanged();
      return result;
    },

    async verifyDomain(domainId) {
      const result = await apiRequest(`/domains/${domainId}/verify`, { method: 'POST' });
      notifyDataChanged();
      return result;
    },

    async requestSslCertificate(domainId) {
      return { id: createId('cert'), domainId, status: 'active', provider: 'local' };
    },

    async listSslCertificates(domainId) {
      return [{ id: createId('cert'), domainId, status: 'active', provider: 'local', expiresAt: '2027-05-24T00:00:00.000Z' }];
    },

    async getDnsRecord(domainId, recordId) {
      return apiRequest(`/domains/${domainId}/dns-records/${recordId}`);
    },

    async importZoneFile(domainId, content, overwrite = false) {
      return { imported: 0, skipped: 0, warnings: ['Zone import is disabled in the Vite-only local build.'] };
    },

    async exportZoneFile(domainId) {
      return apiRequest(`/domains/${domainId}/dns-records/export`);
    },

    async bulkDeleteDnsRecords(domainId, recordIds) {
      const result = await apiRequest(`/domains/${domainId}/dns-records`, { method: 'DELETE', body: JSON.stringify({ recordIds }) });
      notifyDataChanged();
      return result;
    },

    async checkDomainAvailability(domains) {
      if (registrarRequest) {
        const result = await registrarRequest('/availability', {
          method: 'POST',
          body: { domains },
        });
        return (result.domains || []).map((item) => ({
          domain: item.domain,
          available: item.available,
          status: item.status,
          pricing: item.pricing || null,
        }));
      }
      return domains.map((domain) => ({ domain, available: true, status: 'available', pricing: null }));
    },

    async registerDomain(input) {
      if (registrarRequest) {
        const result = await registrarRequest(`/domains/${encodeURIComponent(input.hostname || input.domain || input.name)}/register`, {
          method: 'POST',
          body: input,
        });
        notifyDataChanged();
        return result;
      }
      const domain = await createDomain(input);
      return { operationId: createId('op'), status: 'completed', domain: domain.hostname || domain.name, message: 'Registration recorded locally.' };
    },

    async renewDomain(name, years, currentExpirationDate) {
      if (registrarRequest) {
        const result = await registrarRequest(`/domains/${encodeURIComponent(name)}/renew`, {
          method: 'POST',
          body: { years, currentExpirationDate },
        });
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { operationId: createId('op'), status: 'completed', domain: name };
    },

    async listRegistrarDomains(skip = 0, take = 100) {
      if (registrarRequest) {
        return registrarRequest(`/domains?skip=${encodeURIComponent(skip)}&take=${encodeURIComponent(take)}`);
      }
      return { items: readLocalDb().domains.slice(skip, skip + take), total: readLocalDb().domains.length };
    },

    async getRegistrarDomain(name) {
      if (registrarRequest) {
        return registrarRequest(`/domains/${encodeURIComponent(name)}`);
      }
      return readLocalDb().domains.find((domain) => domain.hostname === name) || null;
    },

    async updateNameservers(name, provider, hosts) {
      if (registrarRequest) {
        const result = await registrarRequest(`/domains/${encodeURIComponent(name)}/nameservers`, {
          method: 'PUT',
          body: { provider, hosts: hosts || [] },
        });
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { domain: name, provider, hosts: hosts || [] };
    },

    async setRegistrarAutoRenew(name, autoRenew) {
      if (registrarRequest) {
        const result = await registrarRequest(`/domains/${encodeURIComponent(name)}/auto-renew`, {
          method: 'PUT',
          body: { autoRenew },
        });
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { domain: name, autoRenew };
    },

    async pushDnsToSpaceship(domainId) {
      if (registrarRequest) {
        const db = readLocalDb();
        const domain = db.domains.find((item) => item.id === domainId || item.hostname === domainId || item.name === domainId);
        const hostname = domain?.hostname || domain?.name || domainId;
        const records = db.dnsRecords[domain?.id || domainId] || [];
        const result = await registrarRequest(`/dns/${encodeURIComponent(hostname)}/records`, {
          method: 'PUT',
          body: { force: true, records },
        });
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { pushed: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
    },

    async pullDnsFromSpaceship(domainId) {
      if (registrarRequest) {
        const db = readLocalDb();
        const domain = db.domains.find((item) => item.id === domainId || item.hostname === domainId || item.name === domainId);
        const hostname = domain?.hostname || domain?.name || domainId;
        const result = await registrarRequest(`/dns/${encodeURIComponent(hostname)}/records`);
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { pulled: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
    },

    async getRegistrarOperation(operationId) {
      if (registrarRequest) {
        return registrarRequest(`/async-operations/${encodeURIComponent(operationId)}`);
      }
      return { operationId, status: 'completed' };
    },

    async createRegistrarContact(data) {
      if (registrarRequest) {
        return registrarRequest('/contacts', {
          method: 'PUT',
          body: data,
        });
      }
      return { id: createId('contact'), ...data };
    },

    async listRegistrarContacts(skip = 0, take = 100) {
      if (registrarRequest) {
        return registrarRequest(`/contacts?skip=${encodeURIComponent(skip)}&take=${encodeURIComponent(take)}`);
      }
      return [];
    },
  };
}

export function ttlToSeconds(value) {
  if (typeof value === 'number') return value;
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'auto') return 3600;
  if (normalized.includes('5')) return 300;
  if (normalized.includes('hour')) return 3600;
  if (normalized.includes('day')) return 86400;
  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : 3600;
}
