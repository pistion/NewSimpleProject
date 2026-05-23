const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
const TOKEN_STORAGE_KEY = "glondia.accessToken";
const ORGANIZATION_STORAGE_KEY = "glondia.organizationId";
const USER_STORAGE_KEY = "glondia.user";
export const AUTH_CHANGED_EVENT = "glondia:auth-changed";
export const DATA_CHANGED_EVENT = "glondia:data-changed";

export function getStoredAuth() {
  const userJson = window.localStorage.getItem(USER_STORAGE_KEY);
  return {
    accessToken: window.localStorage.getItem(TOKEN_STORAGE_KEY),
    organizationId: window.localStorage.getItem(ORGANIZATION_STORAGE_KEY),
    user: userJson ? safeParseJson(userJson) : null,
  };
}

export function storeAuthSession(session) {
  if (session?.tokens?.accessToken) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, session.tokens.accessToken);
  }
  if (session?.organization?.id) {
    window.localStorage.setItem(ORGANIZATION_STORAGE_KEY, session.organization.id);
  }
  if (session?.user) {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
  }
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export async function apiRequest(path, options = {}) {
  const { accessToken, organizationId } = getStoredAuth();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (organizationId) {
    headers.set("X-Organization-Id", organizationId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || `API request failed with ${response.status}`);
  }

  return payload.data;
}

export async function login(email, password) {
  const session = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  storeAuthSession(session);
  return session;
}

export async function register({ name, email, password, organizationName }) {
  const session = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, organizationName }),
  });
  storeAuthSession(session);
  return session;
}

export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

export async function createProject(input) {
  const project = await apiRequest('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiProject(project);
}

export async function updateProject(projectId, input) {
  const project = await apiRequest(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiProject(project);
}

export async function archiveProject(projectId) {
  const project = await apiRequest(`/projects/${projectId}`, {
    method: 'DELETE',
  });
  notifyDataChanged();
  return mapApiProject(project);
}

export async function createDeployment(projectId, input) {
  const deployment = await apiRequest(`/projects/${projectId}/deployments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiDeployment(deployment);
}

export async function cancelDeployment(deploymentId) {
  const deployment = await apiRequest(`/deployments/${deploymentId}/cancel`, {
    method: 'POST',
  });
  notifyDataChanged();
  return mapApiDeployment(deployment);
}

export async function rollbackDeployment(deploymentId) {
  const deployment = await apiRequest(`/deployments/${deploymentId}/rollback`, {
    method: 'POST',
  });
  notifyDataChanged();
  return mapApiDeployment(deployment);
}

export async function createEnvVar(projectId, input) {
  const envVar = await apiRequest(`/projects/${projectId}/env-vars`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiEnvVar(envVar);
}

export async function updateEnvVar(projectId, envVarId, input) {
  const envVar = await apiRequest(`/projects/${projectId}/env-vars/${envVarId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiEnvVar(envVar);
}

export async function deleteEnvVar(projectId, envVarId) {
  const result = await apiRequest(`/projects/${projectId}/env-vars/${envVarId}`, {
    method: 'DELETE',
  });
  notifyDataChanged();
  return result;
}

export async function exportEnvVars(projectId, environment) {
  const qs = environment ? `?environment=${encodeURIComponent(environment)}` : '';
  return apiRequest(`/projects/${projectId}/env-vars/export${qs}`);
}

// ─── GitHub integration ───────────────────────────────────────────────────────

/**
 * Redirect the browser to GitHub OAuth — call as window.location.href = connectGitHub()
 * Returns the URL to navigate to (not a fetch call).
 */
export function connectGitHubUrl(returnPath = '') {
  const { accessToken } = getStoredAuth();
  if (!accessToken) throw new Error('Must be logged in to connect GitHub.');
  const params = returnPath ? `?return=${encodeURIComponent(returnPath)}` : '';
  return `${API_BASE_URL}/github/auth${params}`;
}

/** Check whether the current user has GitHub connected. */
export async function getGitHubStatus() {
  return apiRequest('/github/status');
}

/** Remove the stored GitHub OAuth token. */
export async function disconnectGitHub() {
  const result = await apiRequest('/github/disconnect', { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

/** List repos accessible to the connected GitHub account. */
export async function listGitHubRepos() {
  return apiRequest('/github/repos');
}

/** List branches for a specific repo. */
export async function listGitHubBranches(owner, repo) {
  return apiRequest(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`);
}

/**
 * Link a GitHub repo to a project (owner, repo, branch, provider).
 * Calls PATCH /projects/:id with the repo fields.
 */
export async function linkProjectRepo(projectId, { owner, repo, branch, repoId }) {
  const project = await apiRequest(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      repositoryProvider: 'github',
      repositoryOwner: owner,
      repositoryName: repo,
      repositoryId: String(repoId ?? ''),
      productionBranch: branch || 'main',
    }),
  });
  notifyDataChanged();
  return mapApiProject(project);
}

// ─── Render integration ───────────────────────────────────────────────────────
export async function listRenderServices() {
  return apiRequest('/render/services');
}

export async function linkRenderService(projectId, renderServiceId) {
  const project = await apiRequest(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ renderServiceId: renderServiceId || null }),
  });
  notifyDataChanged();
  return project;
}

export async function createDomain(input) {
  const domain = await apiRequest('/domains', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiDomain(domain);
}

export async function updateDomain(domainId, input) {
  const domain = await apiRequest(`/domains/${domainId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiDomain(domain);
}

export async function deleteDomain(domainId) {
  const domain = await apiRequest(`/domains/${domainId}`, {
    method: 'DELETE',
  });
  notifyDataChanged();
  return mapApiDomain(domain);
}

export async function createDnsRecord(domainId, input) {
  const record = await apiRequest(`/domains/${domainId}/dns-records`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiDnsRecord(record);
}

export async function updateDnsRecord(domainId, recordId, input) {
  const record = await apiRequest(`/domains/${domainId}/dns-records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return mapApiDnsRecord(record);
}

export async function deleteDnsRecord(domainId, recordId) {
  const result = await apiRequest(`/domains/${domainId}/dns-records/${recordId}`, {
    method: 'DELETE',
  });
  notifyDataChanged();
  return result;
}

export async function verifyDomain(domainId) {
  const result = await apiRequest(`/domains/${domainId}/verify`, { method: 'POST' });
  notifyDataChanged();
  return result;
}

export async function requestSslCertificate(domainId) {
  return apiRequest(`/domains/${domainId}/ssl/request`, { method: 'POST' });
}

export async function listSslCertificates(domainId) {
  return apiRequest(`/domains/${domainId}/ssl`);
}

export async function getDnsRecord(domainId, recordId) {
  return apiRequest(`/domains/${domainId}/dns-records/${recordId}`);
}

export async function importZoneFile(domainId, content, overwrite = false) {
  const result = await apiRequest(`/domains/${domainId}/dns-records/import`, {
    method: 'POST',
    body: JSON.stringify({ content, overwrite }),
  });
  notifyDataChanged();
  return result;
}

export async function exportZoneFile(domainId) {
  return apiRequest(`/domains/${domainId}/dns-records/export`);
}

export async function bulkDeleteDnsRecords(domainId, recordIds) {
  const result = await apiRequest(`/domains/${domainId}/dns-records`, {
    method: 'DELETE',
    body: JSON.stringify({ recordIds }),
  });
  notifyDataChanged();
  return result;
}

export function mapApiProject(project) {
  const framework = project.framework || "Static";
  const repo = [project.repositoryOwner, project.repositoryName].filter(Boolean).join("/") || "No repository";
  const domain = `${project.slug}.glondia.app`;
  const status = project.status === "active" ? "Ready" : project.status === "paused" ? "Paused" : "Archived";

  return {
    id: project.id,
    name: project.name,
    framework,
    status,
    repo,
    renderServiceId: project.renderServiceId || null,
    branch: project.productionBranch || "main",
    domain,
    customDomain: null,
    lastDeploy: project.updatedAt ? formatRelative(project.updatedAt) : "Not deployed yet",
    deployedBy: "Glondia",
    region: "Sydney (syd1)",
    visitors30d: 0,
    bandwidth30d: "0 GB",
    requests30d: "0",
  };
}

export function mapApiDeployment(deployment) {
  const statusMap = {
    queued: "Queued",
    building: "Building",
    uploading: "Building",
    deployed: "Ready",
    failed: "Failed",
    cancelled: "Cancelled",
    rolled_back: "Rolled back",
  };

  return {
    id: deployment.id,
    commit: deployment.commitMessage || "Manual deployment",
    branch: deployment.branch || "main",
    sha: deployment.commitSha ? deployment.commitSha.slice(0, 7) : "manual",
    env: deployment.environment === "production" ? "Production" : "Preview",
    status: statusMap[deployment.status] || deployment.status,
    duration: deployment.durationMs ? `${Math.round(deployment.durationMs / 1000)}s` : "-",
    time: deployment.createdAt ? formatRelative(deployment.createdAt) : "Recently",
    author: "Glondia",
    artifact: deployment.artifacts?.[0] ? mapApiArtifact(deployment.artifacts[0]) : null,
    provider: deployment.provider,
    providerServiceId: deployment.providerServiceId,
    providerDeployId: deployment.providerDeployId,
    providerStatus: deployment.providerStatus,
  };
}

export function mapApiDeploymentLog(log) {
  const levelMap = {
    info: "info",
    warn: "dim",
    error: "error",
    debug: "dim",
  };

  return {
    t: log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour12: false }) : "--:--:--",
    level: levelMap[log.level] || "info",
    msg: log.message,
  };
}

export function mapApiEnvVar(envVar) {
  const label = envVar.environment === "production"
    ? "Production"
    : envVar.environment === "preview"
      ? "Preview"
      : "Development";

  return {
    id: envVar.id,
    key: envVar.key,
    value: envVar.value || "********",
    env: [label],
    updated: envVar.updatedAt ? formatRelative(envVar.updatedAt) : "Recently",
  };
}

export function mapApiDomain(domain) {
  const statusMap = {
    pending_verification: "Pending Verification",
    verified: "Verified",
    active: "Active",
    misconfigured: "Misconfigured",
    disabled: "Disabled",
  };

  return {
    id: domain.id,
    name: domain.hostname,
    hostname: domain.hostname,
    rootDomain: domain.rootDomain,
    status: statusMap[domain.status] || domain.status,
    rawStatus: domain.status,
    verificationToken: domain.verificationToken,
    verifiedAt: domain.verifiedAt || null,
    linkedProject: domain.project?.id || domain.projectId || null,
    linkedProjectName: domain.project?.name || null,
    // Registrar fields — not stored in this platform; show sensible defaults.
    auto: false,
    expires: "—",
    price: 0,
  };
}

export function mapApiDnsRecord(record) {
  return {
    id: record.id,
    type: record.type,
    host: record.name,
    value: record.value,
    ttl: formatTtl(record.ttl),
    ttlSeconds: record.ttl,
    priority: record.priority,
    proxy: !!record.proxied,
    status: record.status || 'active',
  };
}

export function mapApiArtifact(artifact) {
  return {
    id: artifact.id,
    bucket: artifact.bucket,
    objectKey: artifact.objectKey,
    size: formatBytes(artifact.sizeBytes),
    sizeBytes: artifact.sizeBytes,
    checksum: artifact.checksum,
    status: artifact.status,
    createdAt: artifact.createdAt,
  };
}

export function mapApiTemplate(t) {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    contentJson: t.contentJson || null,
    isActive: t.isActive !== false,
    sortOrder: t.sortOrder || 0,
  };
}

// ─── Registrar / Spaceship API ────────────────────────────────────────────────

/** Check availability of 1–20 domain names via Spaceship. */
export async function checkDomainAvailability(domains) {
  return apiRequest('/registrar/available', {
    method: 'POST',
    body: JSON.stringify({ domains }),
  });
}

/**
 * Register a domain via Spaceship.
 * Returns { operationId, status, domain, message }
 */
export async function registerDomain(input) {
  const result = await apiRequest('/registrar/domains', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return result;
}

/** Renew a domain via Spaceship. */
export async function renewDomain(name, years, currentExpirationDate) {
  const result = await apiRequest(`/registrar/domains/${name}/renew`, {
    method: 'POST',
    body: JSON.stringify({ name, years, currentExpirationDate }),
  });
  notifyDataChanged();
  return result;
}

/** List all domains registered in Spaceship account. */
export async function listRegistrarDomains(skip = 0, take = 100) {
  return apiRequest(`/registrar/domains?skip=${skip}&take=${take}`);
}

/** Get a single domain detail from Spaceship. */
export async function getRegistrarDomain(name) {
  return apiRequest(`/registrar/domains/${encodeURIComponent(name)}`);
}

/** Update nameservers for a domain via Spaceship. */
export async function updateNameservers(name, provider, hosts) {
  const result = await apiRequest(`/registrar/domains/${encodeURIComponent(name)}/nameservers`, {
    method: 'PUT',
    body: JSON.stringify({ provider, hosts }),
  });
  notifyDataChanged();
  return result;
}

/** Toggle auto-renew for a domain via Spaceship. */
export async function setRegistrarAutoRenew(name, autoRenew) {
  const result = await apiRequest(`/registrar/domains/${encodeURIComponent(name)}/autorenew`, {
    method: 'PUT',
    body: JSON.stringify({ autoRenew }),
  });
  notifyDataChanged();
  return result;
}

/**
 * Push local DNS records → Spaceship (domainId = Glondia UUID).
 * Returns { pushed, domain }
 */
export async function pushDnsToSpaceship(domainId) {
  const result = await apiRequest(`/registrar/domains/${domainId}/dns/push`, { method: 'POST' });
  notifyDataChanged();
  return result;
}

/**
 * Pull DNS records Spaceship → local DB (overwrites existing).
 * Returns { pulled, domain }
 */
export async function pullDnsFromSpaceship(domainId) {
  const result = await apiRequest(`/registrar/domains/${domainId}/dns/pull`, { method: 'POST' });
  notifyDataChanged();
  return result;
}

/** Poll the status of a Spaceship async operation. */
export async function getRegistrarOperation(operationId) {
  return apiRequest(`/registrar/operations/${encodeURIComponent(operationId)}`);
}

/**
 * Create a registrant contact in Spaceship.
 * Returns the contact object with an `id` field.
 * Fields: { firstName, lastName, company?, email, phone, address1, address2?, city, postalCode, country }
 */
export async function createRegistrarContact(data) {
  return apiRequest('/registrar/contacts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** List registrant contacts stored in Spaceship. */
export async function listRegistrarContacts(skip = 0, take = 100) {
  return apiRequest(`/registrar/contacts?skip=${skip}&take=${take}`);
}

// ─── Builder API ──────────────────────────────────────────────────────────────

export async function listBuilderSites() {
  return apiRequest('/builder/sites');
}

export async function getBuilderSite(siteId) {
  return apiRequest(`/builder/sites/${siteId}`);
}

export async function createBuilderSite(input) {
  const site = await apiRequest('/builder/sites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return site;
}

export async function updateBuilderSite(siteId, input) {
  const site = await apiRequest(`/builder/sites/${siteId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return site;
}

export async function archiveBuilderSite(siteId) {
  const result = await apiRequest(`/builder/sites/${siteId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function saveBuilderPage(siteId, pageId, content) {
  const page = await apiRequest(`/builder/sites/${siteId}/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
  notifyDataChanged();
  return page;
}

export async function createBuilderPage(siteId, input) {
  const page = await apiRequest(`/builder/sites/${siteId}/pages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  notifyDataChanged();
  return page;
}

export async function listBuilderPages(siteId) {
  return apiRequest(`/builder/sites/${siteId}/pages`);
}

export async function deleteBuilderPage(siteId, pageId) {
  const result = await apiRequest(`/builder/sites/${siteId}/pages/${pageId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function listPageVersions(siteId, pageId) {
  return apiRequest(`/builder/sites/${siteId}/pages/${pageId}/versions`);
}

export async function publishBuilderSite(siteId) {
  const site = await apiRequest(`/builder/sites/${siteId}/publish`, {
    method: 'POST',
  });
  notifyDataChanged();
  return site;
}

export async function uploadBuilderSitePackage(file) {
  const { accessToken } = getStoredAuth();
  if (!accessToken) throw new Error('Not authenticated.');

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/builder/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Upload failed (${response.status}).`);
  notifyDataChanged();
  return payload;
}

export function mapApiActivity(item) {
  return {
    id: item.id,
    who: item.actor?.name || item.actor?.email || "Glondia",
    what: item.message || item.action,
    when: item.createdAt ? formatRelative(item.createdAt) : "Recently",
    kind: activityKind(item.entityType || item.resourceType || item.action),
    action: item.action,
    entityType: item.entityType || item.resourceType,
    entityId: item.entityId || item.resourceId,
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

function formatRelative(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatTtl(value) {
  if (!value || value === 3600) return "Auto";
  if (value === 300) return "5 min";
  if (value === 86400) return "1 day";
  return `${value}s`;
}

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function activityKind(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('deployment')) return 'deploy';
  if (text.includes('domain') || text.includes('dns')) return 'domain';
  if (text.includes('ssl')) return 'ssl';
  if (text.includes('builder')) return 'builder';
  return 'activity';
}
