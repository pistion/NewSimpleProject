export {
  AUTH_CHANGED_EVENT,
  clearAuthSession,
  getStoredAuth,
  login,
  register,
  storeAuthSession,
} from './api/auth.js';
import { makeSession } from './api/auth.js';
import { createBuilderActions } from './api/builder.js';
import { createDomainActions, ttlToSeconds } from './api/domains.js';
export { ttlToSeconds } from './api/domains.js';
import { isLiveMode } from './app/config.js';
import { authHeaders } from './api/auth.js';
import {
  buildGithubSandbox,
  disconnectGitHub as disconnectGitHubBase,
  fetchGithubSnapshot,
  parseGithubRepo,
} from './api/github.js';
export {
  connectGitHubUrl,
  getGitHubStatus,
  listGitHubBranches,
  listGitHubRepos,
  parseGithubRepo,
} from './api/github.js';
import {
  mapApiActivity,
  mapApiDeployment,
  mapApiDnsRecord,
  mapApiDomain,
  mapApiEnvVar,
  mapApiProject,
} from './api/mappers.js';
export {
  mapApiActivity,
  mapApiArtifact,
  mapApiDeployment,
  mapApiDeploymentLog,
  mapApiDnsRecord,
  mapApiDomain,
  mapApiEnvVar,
  mapApiProject,
  mapApiTemplate,
} from './api/mappers.js';
import { createLocalDbRuntime } from './api/localDb.js';
import { createProjectActions } from './api/projects.js';
import { triggerRenderDeploy } from './api/render.js';
export {
  activateRenderRepo,
  getRenderSettings,
  listLiveRenderServices,
  listRenderDeploys,
  testRenderDeploy,
  triggerRenderDeploy,
} from './api/render.js';

const localDb = createLocalDbRuntime({ makeSession, ttlToSeconds });
const {
  createId,
  handleLocalApi,
  makeActivity,
  makeBuilderSite,
  makeProject,
  readLocalDb,
  slugify,
  writeLocalDb,
} = localDb;

const domainApi = createDomainActions({
  apiRequest,
  createId,
  mapApiDnsRecord,
  mapApiDomain,
  notifyDataChanged,
  readLocalDb,
  registrarRequest: isLiveMode() ? registrarRequest : null,
});

const builderApi = createBuilderActions({
  apiRequest,
  buildGithubSandbox,
  createId,
  fetchGithubSnapshot,
  makeActivity,
  makeBuilderSite,
  makeProject,
  notifyDataChanged,
  parseGithubRepo,
  readLocalDb,
  slugify,
  triggerRenderDeploy,
  writeLocalDb,
});

const projectApi = createProjectActions({
  apiRequest,
  mapApiDeployment,
  mapApiEnvVar,
  mapApiProject,
  notifyDataChanged,
  readLocalDb,
});

export async function apiRequest(path, options = {}) {
  return handleLocalApi(path, options);
}

async function registrarRequest(path, options = {}) {
  const response = await fetch(`/api/spaceship${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || result?.error || `Spaceship request failed with ${response.status}.`);
  }
  return result;
}

async function hostingRequest(path, options = {}) {
  if (!isLiveMode()) return apiRequest(path, options);
  const response = await fetch(liveApiUrl(path), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(),
    },
    body: options.body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || `Hosting request failed with ${response.status}.`);
  }
  return result?.data ?? result;
}

export async function liveApiRequest(path, options = {}) {
  const response = await fetch(liveApiUrl(path), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || `API request failed with ${response.status}.`);
  }
  return result?.data ?? result;
}

function liveApiUrl(path) {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  if (!configured) return `/api${path}`;
  return `${configured}${path}`;
}

export const DATA_CHANGED_EVENT = "glondia:data-changed";
export const HOSTING_CHECKOUT_KEY = 'glondia:pending-hosting-checkout';

export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

export async function createProject(input) {
  return projectApi.createProject(input);
}

export async function updateProject(projectId, input) {
  return projectApi.updateProject(projectId, input);
}

export async function archiveProject(projectId) {
  return projectApi.archiveProject(projectId);
}

export async function createDeployment(projectId, input) {
  return projectApi.createDeployment(projectId, input);
}

export async function createRenderDeployment(input) {
  const path = isLiveMode() ? '/deployments/render' : '/deployments';
  const deployment = await hostingRequest(path, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return deployment;
}

export async function getRenderDeploymentStatus(deploymentId) {
  return hostingRequest(`/deployments/${deploymentId}/status`);
}

export const getDeploymentStatus = getRenderDeploymentStatus;

export async function verifyRenderDeploymentUrl(deploymentId) {
  const deployment = await hostingRequest(`/deployments/${deploymentId}/verify-url`, { method: 'POST' });
  notifyDataChanged();
  return deployment;
}

export const verifyDeploymentUrl = verifyRenderDeploymentUrl;

export async function redeployRenderDeployment(deploymentId, input = {}) {
  const deployment = await hostingRequest(`/deployments/${deploymentId}/redeploy`, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return deployment;
}

export const redeployDeployment = redeployRenderDeployment;

export async function getRenderDeploymentLogs(deploymentId) {
  return hostingRequest(`/deployments/${deploymentId}/logs`);
}

// Returns an EventSource URL for the live log stream (SSE).
// Use with: new EventSource(getDeploymentLogStreamUrl(deploymentId))
export function getDeploymentLogStreamUrl(deploymentId) {
  return liveApiUrl(`/deployments/${encodeURIComponent(deploymentId)}/logs/stream`);
}

export async function listHostingDeployments() {
  return hostingRequest('/hosting');
}

export const listHostingApps = listHostingDeployments;

export async function getHostingService(deploymentId) {
  return hostingRequest(`/hosting/${deploymentId}`);
}

export const getHostingApp = getHostingService;

export async function updateHostingSettings(deploymentId, input) {
  const service = await hostingRequest(`/hosting/${deploymentId}/settings`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return service;
}

export async function suspendHostingDeployment(deploymentId) {
  const service = await hostingRequest(`/hosting/${deploymentId}/suspend`, { method: 'POST' });
  notifyDataChanged();
  return service;
}

export const suspendHostingApp = suspendHostingDeployment;

export async function deleteHostingDeployment(deploymentId) {
  const result = await hostingRequest(`/hosting/${deploymentId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export const deleteHostingApp = deleteHostingDeployment;

export const redeployHostingApp = redeployRenderDeployment;

export async function getPayPalClientSettings() {
  return hostingRequest('/payments/paypal-client');
}

export async function createDomainPayPalOrder(input) {
  return hostingRequest('/payments/domain/create-order', { method: 'POST', body: JSON.stringify(input) });
}

export async function captureDomainPayPalOrder(input) {
  const result = await hostingRequest('/payments/domain/capture', { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return result;
}

export async function createHostingPayPalOrder(input) {
  return hostingRequest('/payments/hosting/create-order', { method: 'POST', body: JSON.stringify(input) });
}

export async function captureHostingPayPalOrder(input) {
  const result = await hostingRequest('/payments/hosting/capture', { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return result;
}

export async function getHostingPaymentStatus(deploymentId) {
  return hostingRequest(`/payments/hosting/status/${encodeURIComponent(deploymentId)}`);
}

export async function listHostingEnvVars(deploymentId) {
  return hostingRequest(`/hosting/${deploymentId}/env`);
}

export async function upsertHostingEnvVar(deploymentId, input) {
  const envVar = await hostingRequest(`/hosting/${deploymentId}/env`, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return envVar;
}

export const createHostingEnvVar = upsertHostingEnvVar;

export async function updateHostingEnvVar(deploymentId, key, input) {
  const envVar = await hostingRequest(`/hosting/${deploymentId}/env/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return envVar;
}

export async function deleteHostingEnvVar(deploymentId, key) {
  const result = await hostingRequest(`/hosting/${deploymentId}/env/${encodeURIComponent(key)}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function syncHostingEnvVars(deploymentId) {
  const result = await hostingRequest(`/hosting/${deploymentId}/env/sync`, { method: 'POST' });
  notifyDataChanged();
  return result;
}

export async function listHostingDisks(deploymentId) {
  return hostingRequest(`/hosting/${deploymentId}/disk`);
}

export const getHostingDisk = listHostingDisks;

export async function attachHostingDisk(deploymentId, input) {
  const disk = await hostingRequest(`/hosting/${deploymentId}/disk`, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return disk;
}

export const createHostingDisk = attachHostingDisk;

export async function updateHostingDisk(deploymentId, diskId, input) {
  const disk = await hostingRequest(`/hosting/${deploymentId}/disk/${diskId}`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return disk;
}

export async function deleteHostingDisk(deploymentId, diskId) {
  const result = await hostingRequest(`/hosting/${deploymentId}/disk/${diskId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function addHostingDomain(deploymentId, input) {
  const domain = await hostingRequest(`/hosting/${deploymentId}/domains`, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return domain;
}

export const createHostingDomain = addHostingDomain;

export async function listHostingDomains(deploymentId) {
  return hostingRequest(`/hosting/${deploymentId}/domains`);
}

export async function getHostingDomainStatus(deploymentId, domainId) {
  return hostingRequest(`/hosting/${deploymentId}/domains/${domainId}/status`);
}

export async function verifyHostingDomain(deploymentId, domainId) {
  const domain = await hostingRequest(`/hosting/${deploymentId}/domains/${domainId}/verify`, { method: 'POST' });
  notifyDataChanged();
  return domain;
}

export async function deleteHostingDomain(deploymentId, domainId) {
  const result = await hostingRequest(`/hosting/${deploymentId}/domains/${domainId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function cancelDeployment(deploymentId) {
  return projectApi.cancelDeployment(deploymentId);
}

export async function rollbackDeployment(deploymentId) {
  return projectApi.rollbackDeployment(deploymentId);
}

export async function createEnvVar(projectId, input) {
  return projectApi.createEnvVar(projectId, input);
}

export async function updateEnvVar(projectId, envVarId, input) {
  return projectApi.updateEnvVar(projectId, envVarId, input);
}

export async function deleteEnvVar(projectId, envVarId) {
  return projectApi.deleteEnvVar(projectId, envVarId);
}

export async function exportEnvVars(projectId, environment) {
  return projectApi.exportEnvVars(projectId, environment);
}

export async function disconnectGitHub() {
  const result = await disconnectGitHubBase();
  notifyDataChanged();
  return result;
}

export async function linkProjectRepo(projectId, input) {
  return projectApi.linkProjectRepo(projectId, input, updateProject);
}

export function parseGitHubRepository(value) {
  return parseGithubRepo(value);
}

export async function listRenderServices() {
  return projectApi.listRenderServices();
}

export async function linkRenderService(projectId, renderServiceId) {
  return projectApi.linkRenderService(projectId, renderServiceId);
}

export async function createDomain(input) {
  return domainApi.createDomain(input);
}

export async function updateDomain(domainId, input) {
  return domainApi.updateDomain(domainId, input);
}

export async function deleteDomain(domainId) {
  return domainApi.deleteDomain(domainId);
}

export async function createDnsRecord(domainId, input) {
  return domainApi.createDnsRecord(domainId, input);
}

export async function updateDnsRecord(domainId, recordId, input) {
  return domainApi.updateDnsRecord(domainId, recordId, input);
}

export async function deleteDnsRecord(domainId, recordId) {
  return domainApi.deleteDnsRecord(domainId, recordId);
}

export async function verifyDomain(domainId) {
  return domainApi.verifyDomain(domainId);
}

export async function requestSslCertificate(domainId) {
  return domainApi.requestSslCertificate(domainId);
}

export async function listSslCertificates(domainId) {
  return domainApi.listSslCertificates(domainId);
}

export async function getDnsRecord(domainId, recordId) {
  return domainApi.getDnsRecord(domainId, recordId);
}

export async function importZoneFile(domainId, content, overwrite = false) {
  return domainApi.importZoneFile(domainId, content, overwrite);
}

export async function exportZoneFile(domainId) {
  return domainApi.exportZoneFile(domainId);
}

export async function bulkDeleteDnsRecords(domainId, recordIds) {
  return domainApi.bulkDeleteDnsRecords(domainId, recordIds);
}

export async function checkDomainAvailability(domains) {
  return domainApi.checkDomainAvailability(domains);
}

export async function registerDomain(input) {
  return domainApi.registerDomain(input);
}

export async function renewDomain(name, years, currentExpirationDate) {
  return domainApi.renewDomain(name, years, currentExpirationDate);
}

export async function listRegistrarDomains(skip = 0, take = 100) {
  return domainApi.listRegistrarDomains(skip, take);
}

export async function getRegistrarDomain(name) {
  return domainApi.getRegistrarDomain(name);
}

export async function updateNameservers(name, provider, hosts) {
  return domainApi.updateNameservers(name, provider, hosts);
}

export async function setRegistrarAutoRenew(name, autoRenew) {
  return domainApi.setRegistrarAutoRenew(name, autoRenew);
}

export async function pushDnsToSpaceship(domainId) {
  return domainApi.pushDnsToSpaceship(domainId);
}

export async function pullDnsFromSpaceship(domainId) {
  return domainApi.pullDnsFromSpaceship(domainId);
}

export async function getRegistrarOperation(operationId) {
  return domainApi.getRegistrarOperation(operationId);
}

export async function createRegistrarContact(data) {
  return domainApi.createRegistrarContact(data);
}

export async function listRegistrarContacts(skip = 0, take = 100) {
  return domainApi.listRegistrarContacts(skip, take);
}

export async function listBuilderSites() {
  return builderApi.listBuilderSites();
}

export async function getBuilderSite(siteId) {
  return builderApi.getBuilderSite(siteId);
}

export async function createBuilderSite(input) {
  return builderApi.createBuilderSite(input);
}

export async function updateBuilderSite(siteId, input) {
  return builderApi.updateBuilderSite(siteId, input);
}

export async function archiveBuilderSite(siteId) {
  if (isLiveMode()) await deleteRenderHostingForBuilderSite(siteId);
  return builderApi.archiveBuilderSite(siteId);
}

async function deleteRenderHostingForBuilderSite(siteId) {
  const db = readLocalDb();
  const site = db.sites.find((item) => item.id === siteId);
  if (!site) return;
  const hostingApps = await listHostingDeployments().catch(() => []);
  const matches = hostingApps.filter((app) => {
    const appRepo = String(app.githubRepo || app.repoUrl || app.sourceReference || '').toLowerCase();
    const siteRepo = String(site.repositoryUrl || site.content?._repository || '').toLowerCase();
    return app.deploymentId
      && app.status !== 'deleted'
      && (
        app.projectId === site.projectId
        || app.projectId === site.id
        || app.siteId === site.id
        || app.sourceReference === site.id
        || (siteRepo && appRepo && appRepo.includes(siteRepo.replace(/^https?:\/\/github\.com\//, '')))
        || (site.repositoryUrl && appRepo === String(site.repositoryUrl).toLowerCase())
      );
  });
  for (const app of matches) {
    await deleteHostingDeployment(app.deploymentId);
  }
}

export async function saveBuilderPage(siteId, pageId, content) {
  return builderApi.saveBuilderPage(siteId, pageId, content);
}

export async function createBuilderPage(siteId, input) {
  return builderApi.createBuilderPage(siteId, input);
}

export async function listBuilderPages(siteId) {
  return builderApi.listBuilderPages(siteId);
}

export async function deleteBuilderPage(siteId, pageId) {
  return builderApi.deleteBuilderPage(siteId, pageId);
}

export async function listPageVersions(siteId, pageId) {
  return builderApi.listPageVersions(siteId, pageId);
}

export async function publishBuilderSite(siteId) {
  return builderApi.publishBuilderSite(siteId);
}

export async function uploadBuilderSitePackage(file) {
  return builderApi.uploadBuilderSitePackage(file);
}

export async function importBuilderSiteFromGithub(input) {
  return builderApi.importBuilderSiteFromGithub(input);
}
