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

export const DATA_CHANGED_EVENT = "glondia:data-changed";

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
  return builderApi.archiveBuilderSite(siteId);
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
