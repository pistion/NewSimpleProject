export function createDomainActions({
  apiRequest,
  createId,
  mapApiDnsRecord,
  mapApiDomain,
  notifyDataChanged,
  readLocalDb,
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
      return domains.map((domain) => ({ domain, available: true, status: 'available', pricing: null }));
    },

    async registerDomain(input) {
      const domain = await createDomain(input);
      return { operationId: createId('op'), status: 'completed', domain: domain.hostname || domain.name, message: 'Registration recorded locally.' };
    },

    async renewDomain(name, years, currentExpirationDate) {
      notifyDataChanged();
      return { operationId: createId('op'), status: 'completed', domain: name };
    },

    async listRegistrarDomains(skip = 0, take = 100) {
      return { items: readLocalDb().domains.slice(skip, skip + take), total: readLocalDb().domains.length };
    },

    async getRegistrarDomain(name) {
      return readLocalDb().domains.find((domain) => domain.hostname === name) || null;
    },

    async updateNameservers(name, provider, hosts) {
      notifyDataChanged();
      return { domain: name, provider, hosts: hosts || [] };
    },

    async setRegistrarAutoRenew(name, autoRenew) {
      notifyDataChanged();
      return { domain: name, autoRenew };
    },

    async pushDnsToSpaceship(domainId) {
      notifyDataChanged();
      return { pushed: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
    },

    async pullDnsFromSpaceship(domainId) {
      notifyDataChanged();
      return { pulled: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
    },

    async getRegistrarOperation(operationId) {
      return { operationId, status: 'completed' };
    },

    async createRegistrarContact(data) {
      return { id: createId('contact'), ...data };
    },

    async listRegistrarContacts(skip = 0, take = 100) {
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
