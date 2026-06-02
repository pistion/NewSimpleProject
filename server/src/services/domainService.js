import renderApiService from './renderApiService.js';
import { makeId, mutateHostingStore, nowIso, readHostingStore } from './hostingStore.js';

class DomainService {
  async add(deploymentId, input = {}) {
    const deployment = await findDeployment(deploymentId);
    const name = cleanDomain(input.domain || input.name || input.hostname);
    const renderDomain = await renderApiService.addCustomDomain(deployment.renderServiceId, name);
    return mutateHostingStore((store) => {
      const domain = {
        domainId: renderDomain?.customDomain?.id || renderDomain?.id || makeId('domain'),
        name,
        status: renderDomain?.status || 'pending_verification',
        verificationStatus: renderDomain?.verificationStatus || renderDomain?.status || 'pending',
        sslStatus: renderDomain?.certificateStatus || renderDomain?.sslStatus || 'pending',
        dnsRecords: extractDnsRecords(renderDomain, name, deployment.liveUrl),
        renderDomain,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.domains[deployment.deploymentId] = [domain, ...(store.domains[deployment.deploymentId] || [])];
      updateDeploymentDomains(store, deployment.deploymentId);
      return domain;
    });
  }

  async list(deploymentId) {
    const deployment = await findDeployment(deploymentId, false);
    const store = await readHostingStore();
    return store.domains[deployment.deploymentId] || [];
  }

  async status(deploymentId, domainId) {
    const deployment = await findDeployment(deploymentId);
    const store = await readHostingStore();
    const domain = (store.domains[deployment.deploymentId] || []).find((item) => item.domainId === domainId);
    if (!domain) throw notFound('Domain not found.');
    const renderDomain = await renderApiService.getCustomDomain(deployment.renderServiceId, domainId);
    return mutateHostingStore((nextStore) => {
      const item = (nextStore.domains[deployment.deploymentId] || []).find((row) => row.domainId === domainId);
      if (renderDomain && item) {
        item.renderDomain = renderDomain;
        item.verificationStatus = renderDomain.verificationStatus || renderDomain.status || item.verificationStatus;
        item.sslStatus = renderDomain.certificateStatus || renderDomain.sslStatus || item.sslStatus;
        item.status = normalizeDomainStatus(item.verificationStatus, item.sslStatus);
        item.dnsRecords = extractDnsRecords(renderDomain, item.name, deployment.liveUrl);
        item.updatedAt = nowIso();
        updateDeploymentDomains(nextStore, deployment.deploymentId);
      }
      return item || domain;
    });
  }

  async remove(deploymentId, domainId) {
    const deployment = await findDeployment(deploymentId);
    await renderApiService.deleteCustomDomain(deployment.renderServiceId, domainId);
    return mutateHostingStore((store) => {
      store.domains[deployment.deploymentId] = (store.domains[deployment.deploymentId] || []).filter((item) => item.domainId !== domainId);
      updateDeploymentDomains(store, deployment.deploymentId);
      return { deleted: true, domainId };
    });
  }
}

async function findDeployment(deploymentId, requireRender = true) {
  const store = await readHostingStore();
  const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.renderServiceId === deploymentId);
  if (!deployment) throw notFound('Hosting deployment not found.');
  if (requireRender && !deployment.renderServiceId) {
    const error = new Error('Deployment has not started. A real hosting service ID is required.');
    error.status = 409;
    throw error;
  }
  return deployment;
}

function cleanDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || domain.includes('..')) {
    const error = new Error('Enter a valid domain name, such as example.com.');
    error.status = 400;
    throw error;
  }
  return domain;
}

function extractDnsRecords(renderDomain, domain, liveUrl) {
  const records = renderDomain?.dnsRecords || renderDomain?.verification?.dnsRecords || renderDomain?.customDomain?.dnsRecords;
  if (Array.isArray(records) && records.length) return records;
  return [
    { type: 'CNAME', name: domain.startsWith('www.') ? domain : `www.${domain}`, value: liveUrl ? liveUrl.replace(/^https?:\/\//, '') : 'your-service.onrender.com', ttl: 300 },
    { type: 'A', name: domain.replace(/^www\./, '@'), value: '216.24.57.1', ttl: 300 },
  ];
}

function normalizeDomainStatus(verificationStatus, sslStatus) {
  if (String(verificationStatus).toLowerCase().includes('verified') && String(sslStatus).toLowerCase().includes('issued')) return 'active';
  return 'pending_verification';
}

function updateDeploymentDomains(store, serviceId) {
  const deployment = store.deployments.find((item) => item.deploymentId === serviceId);
  if (!deployment) return;
  deployment.domainMetadata = store.domains[serviceId] || [];
  deployment.updatedAt = nowIso();
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

export default new DomainService();
