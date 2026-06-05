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
      const result = await apiRequest(`/domains/${domainId}/dns-records/import`, {
        method: 'POST',
        body: JSON.stringify({ content, overwrite }),
      });
      notifyDataChanged();
      return result;
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
        const result = await registrarRequest('/available', {
          method: 'POST',
          body: { domains },
        });
        const items = Array.isArray(result) ? result : result.domains || [];
        return items.map((item) => ({
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
        const hostname = input.hostname || input.domain || input.name;
        const result = await registrarRequest('/domains', {
          method: 'POST',
          body: { ...input, hostname },
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
        const result = await registrarRequest(`/domains/${encodeURIComponent(name)}/autorenew`, {
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
        const result = await registrarRequest(`/domains/${encodeURIComponent(domainId)}/dns/push`, { method: 'POST' });
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { pushed: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
    },

    async pullDnsFromSpaceship(domainId) {
      if (registrarRequest) {
        const result = await registrarRequest(`/domains/${encodeURIComponent(domainId)}/dns/pull`, { method: 'POST' });
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { pulled: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
    },

    async getRegistrarOperation(operationId) {
      if (registrarRequest) {
        return registrarRequest(`/operations/${encodeURIComponent(operationId)}`);
      }
      return { operationId, status: 'completed' };
    },

    async createRegistrarContact(data) {
      if (registrarRequest) {
        return registrarRequest('/contacts', {
          method: 'POST',
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

    async listRegisteredDomains(skip = 0, take = 100) {
      if (registrarRequest) {
        return registrarRequest(`/domains?skip=${encodeURIComponent(skip)}&take=${encodeURIComponent(take)}`);
      }
      return { items: readLocalDb().domains.slice(skip, skip + take), total: readLocalDb().domains.length };
    },

    async updateDomainNameservers(name, provider, hosts) {
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

    async updateDomainAutoRenew(name, autoRenew) {
      if (registrarRequest) {
        const result = await registrarRequest(`/domains/${encodeURIComponent(name)}/autorenew`, {
          method: 'PUT',
          body: { autoRenew },
        });
        notifyDataChanged();
        return result;
      }
      notifyDataChanged();
      return { domain: name, autoRenew };
    },

    async listDnsRecords(domainId) {
      const records = await apiRequest(`/domains/${domainId}/dns-records`);
      return Array.isArray(records) ? records.map(mapApiDnsRecord) : [];
    },

    async saveDnsRecords(domainId, records, overwrite = true) {
      if (overwrite) {
        const existing = await apiRequest(`/domains/${domainId}/dns-records`);
        if (existing.length) {
          await apiRequest(`/domains/${domainId}/dns-records`, {
            method: 'DELETE',
            body: JSON.stringify({ recordIds: existing.map((record) => record.id) }),
          });
        }
      }

      const saved = [];
      for (const record of records) {
        const created = await apiRequest(`/domains/${domainId}/dns-records`, {
          method: 'POST',
          body: JSON.stringify(record),
        });
        saved.push(mapApiDnsRecord(created));
      }
      notifyDataChanged();
      return { saved: saved.length, records: saved };
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
