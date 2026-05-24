const TOKEN_STORAGE_KEY = "glondia.accessToken";
const ORGANIZATION_STORAGE_KEY = "glondia.organizationId";
const USER_STORAGE_KEY = "glondia.user";
const LOCAL_DB_KEY = "glondia.localDb.v1";

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
  if (session?.tokens?.accessToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, session.tokens.accessToken);
  if (session?.organization?.id) window.localStorage.setItem(ORGANIZATION_STORAGE_KEY, session.organization.id);
  if (session?.user) window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export async function apiRequest(path, options = {}) {
  return handleLocalApi(path, options);
}

export async function login(email, password) {
  const session = makeSession({ email });
  storeAuthSession(session);
  return session;
}

export async function register({ name, email, password, organizationName }) {
  const session = makeSession({ name, email, organizationName });
  storeAuthSession(session);
  return session;
}

export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

export async function createProject(input) {
  const project = await apiRequest('/projects', { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiProject(project);
}

export async function updateProject(projectId, input) {
  const project = await apiRequest(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiProject(project);
}

export async function archiveProject(projectId) {
  const project = await apiRequest(`/projects/${projectId}`, { method: 'DELETE' });
  notifyDataChanged();
  return mapApiProject(project);
}

export async function createDeployment(projectId, input) {
  const deployment = await apiRequest(`/projects/${projectId}/deployments`, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiDeployment(deployment);
}

export async function cancelDeployment(deploymentId) {
  const deployment = await apiRequest(`/deployments/${deploymentId}/cancel`, { method: 'POST' });
  notifyDataChanged();
  return mapApiDeployment(deployment);
}

export async function rollbackDeployment(deploymentId) {
  const deployment = await apiRequest(`/deployments/${deploymentId}/rollback`, { method: 'POST' });
  notifyDataChanged();
  return mapApiDeployment(deployment);
}

export async function createEnvVar(projectId, input) {
  const envVar = await apiRequest(`/projects/${projectId}/env-vars`, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiEnvVar(envVar);
}

export async function updateEnvVar(projectId, envVarId, input) {
  const envVar = await apiRequest(`/projects/${projectId}/env-vars/${envVarId}`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiEnvVar(envVar);
}

export async function deleteEnvVar(projectId, envVarId) {
  const result = await apiRequest(`/projects/${projectId}/env-vars/${envVarId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function exportEnvVars(projectId, environment) {
  const qs = environment ? `?environment=${encodeURIComponent(environment)}` : '';
  return apiRequest(`/projects/${projectId}/env-vars/export${qs}`);
}

export function connectGitHubUrl(returnPath = '') {
  return returnPath || '/';
}

export async function getGitHubStatus() {
  return { connected: false, login: null };
}

export async function disconnectGitHub() {
  notifyDataChanged();
  return { disconnected: true };
}

export async function listGitHubRepos() {
  return [];
}

export async function listGitHubBranches(owner, repo) {
  return [{ name: 'main' }];
}

export async function linkProjectRepo(projectId, input) {
  if (!input) {
    const project = await updateProject(projectId, {
      repositoryProvider: null,
      repositoryOwner: null,
      repositoryName: null,
      repositoryId: null,
      repositoryUrl: null,
    });
    notifyDataChanged();
    return project;
  }

  const { owner, repo, branch, repoId, url } = input;
  const project = await updateProject(projectId, {
    repositoryProvider: 'github',
    repositoryOwner: owner,
    repositoryName: repo,
    repositoryId: String(repoId ?? ''),
    repositoryUrl: url || `https://github.com/${owner}/${repo}`,
    productionBranch: branch || 'main',
  });
  notifyDataChanged();
  return project;
}

export function parseGitHubRepository(value) {
  return parseGithubRepo(value);
}

export async function listRenderServices() {
  return readLocalDb().renderServices;
}

export async function linkRenderService(projectId, renderServiceId) {
  const project = await apiRequest(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ renderServiceId: renderServiceId || null }) });
  notifyDataChanged();
  return project;
}

export async function createDomain(input) {
  const domain = await apiRequest('/domains', { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiDomain(domain);
}

export async function updateDomain(domainId, input) {
  const domain = await apiRequest(`/domains/${domainId}`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiDomain(domain);
}

export async function deleteDomain(domainId) {
  const domain = await apiRequest(`/domains/${domainId}`, { method: 'DELETE' });
  notifyDataChanged();
  return mapApiDomain(domain);
}

export async function createDnsRecord(domainId, input) {
  const record = await apiRequest(`/domains/${domainId}/dns-records`, { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiDnsRecord(record);
}

export async function updateDnsRecord(domainId, recordId, input) {
  const record = await apiRequest(`/domains/${domainId}/dns-records/${recordId}`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return mapApiDnsRecord(record);
}

export async function deleteDnsRecord(domainId, recordId) {
  const result = await apiRequest(`/domains/${domainId}/dns-records/${recordId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function verifyDomain(domainId) {
  const result = await apiRequest(`/domains/${domainId}/verify`, { method: 'POST' });
  notifyDataChanged();
  return result;
}

export async function requestSslCertificate(domainId) {
  return { id: createId('cert'), domainId, status: 'active', provider: 'local' };
}

export async function listSslCertificates(domainId) {
  return [{ id: createId('cert'), domainId, status: 'active', provider: 'local', expiresAt: '2027-05-24T00:00:00.000Z' }];
}

export async function getDnsRecord(domainId, recordId) {
  return apiRequest(`/domains/${domainId}/dns-records/${recordId}`);
}

export async function importZoneFile(domainId, content, overwrite = false) {
  return { imported: 0, skipped: 0, warnings: ['Zone import is disabled in the Vite-only local build.'] };
}

export async function exportZoneFile(domainId) {
  return apiRequest(`/domains/${domainId}/dns-records/export`);
}

export async function bulkDeleteDnsRecords(domainId, recordIds) {
  const result = await apiRequest(`/domains/${domainId}/dns-records`, { method: 'DELETE', body: JSON.stringify({ recordIds }) });
  notifyDataChanged();
  return result;
}

export function mapApiProject(project) {
  const framework = project.framework || "Vite + React";
  const repo = [project.repositoryOwner, project.repositoryName].filter(Boolean).join("/") || "Local workspace";
  const status = project.status === "active" ? "Ready" : project.status === "paused" ? "Paused" : "Archived";
  return {
    id: project.id,
    name: project.name,
    framework,
    status,
    repo,
    renderServiceId: project.renderServiceId || null,
    branch: project.productionBranch || "main",
    domain: project.domain || `${project.slug}.glondia.app`,
    customDomain: project.customDomain || null,
    lastDeploy: project.updatedAt ? formatRelative(project.updatedAt) : "Not deployed yet",
    deployedBy: "Glondia",
    region: "Oregon",
    visitors30d: project.visitors30d || 0,
    bandwidth30d: project.bandwidth30d || "0 GB",
    requests30d: project.requests30d || "0",
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
    commit: deployment.commitMessage || "Vite static deployment",
    branch: deployment.branch || "main",
    sha: deployment.commitSha ? deployment.commitSha.slice(0, 7) : "local",
    env: deployment.environment === "production" ? "Production" : "Preview",
    status: statusMap[deployment.status] || deployment.status,
    duration: deployment.durationMs ? `${Math.round(deployment.durationMs / 1000)}s` : "18s",
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
  return {
    t: log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour12: false }) : "--:--:--",
    level: log.level === 'error' ? 'error' : log.level === 'warn' ? 'dim' : 'info',
    msg: log.message,
  };
}

export function mapApiEnvVar(envVar) {
  const label = envVar.environment === "production" ? "Production" : envVar.environment === "preview" ? "Preview" : "Development";
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
    linkedProject: domain.projectId || null,
    linkedProjectName: null,
    auto: false,
    expires: "2027-05-24",
    price: 14.99,
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

export async function checkDomainAvailability(domains) {
  return domains.map((domain) => ({ domain, available: true, status: 'available', pricing: null }));
}

export async function registerDomain(input) {
  const domain = await createDomain(input);
  return { operationId: createId('op'), status: 'completed', domain: domain.hostname || domain.name, message: 'Registration recorded locally.' };
}

export async function renewDomain(name, years, currentExpirationDate) {
  notifyDataChanged();
  return { operationId: createId('op'), status: 'completed', domain: name };
}

export async function listRegistrarDomains(skip = 0, take = 100) {
  return { items: readLocalDb().domains.slice(skip, skip + take), total: readLocalDb().domains.length };
}

export async function getRegistrarDomain(name) {
  return readLocalDb().domains.find((domain) => domain.hostname === name) || null;
}

export async function updateNameservers(name, provider, hosts) {
  notifyDataChanged();
  return { domain: name, provider, hosts: hosts || [] };
}

export async function setRegistrarAutoRenew(name, autoRenew) {
  notifyDataChanged();
  return { domain: name, autoRenew };
}

export async function pushDnsToSpaceship(domainId) {
  notifyDataChanged();
  return { pushed: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
}

export async function pullDnsFromSpaceship(domainId) {
  notifyDataChanged();
  return { pulled: (readLocalDb().dnsRecords[domainId] || []).length, domain: domainId };
}

export async function getRegistrarOperation(operationId) {
  return { operationId, status: 'completed' };
}

export async function createRegistrarContact(data) {
  return { id: createId('contact'), ...data };
}

export async function listRegistrarContacts(skip = 0, take = 100) {
  return [];
}

export async function listBuilderSites() {
  return readLocalDb().sites;
}

export async function getBuilderSite(siteId) {
  return readLocalDb().sites.find((site) => site.id === siteId) || null;
}

export async function createBuilderSite(input) {
  const site = await apiRequest('/builder/sites', { method: 'POST', body: JSON.stringify(input) });
  notifyDataChanged();
  return site;
}

export async function updateBuilderSite(siteId, input) {
  const site = await apiRequest(`/builder/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify(input) });
  notifyDataChanged();
  return site;
}

export async function archiveBuilderSite(siteId) {
  const result = await apiRequest(`/builder/sites/${siteId}`, { method: 'DELETE' });
  notifyDataChanged();
  return result;
}

export async function saveBuilderPage(siteId, pageId, content) {
  const page = await apiRequest(`/builder/sites/${siteId}/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ content }) });
  notifyDataChanged();
  return page;
}

export async function createBuilderPage(siteId, input) {
  const page = await apiRequest(`/builder/sites/${siteId}/pages`, { method: 'POST', body: JSON.stringify(input) });
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
  return [];
}

export async function publishBuilderSite(siteId) {
  const site = await apiRequest(`/builder/sites/${siteId}/publish`, { method: 'POST' });
  const renderDeploy = await triggerRenderDeploy({ siteId, renderServiceId: site.renderServiceId });
  notifyDataChanged();
  return { ...site, renderDeploy };
}

export async function triggerRenderDeploy(input = {}) {
  try {
    const response = await fetch('/api/render/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || `Render deploy failed with ${response.status}.`);
    return result;
  } catch (error) {
    return {
      status: 'unavailable',
      provider: 'render',
      message: error.message || 'Render deploy endpoint is unavailable.',
    };
  }
}

export async function getRenderSettings() {
  try {
    const response = await fetch('/api/render/settings');
    if (!response.ok) throw new Error(`Render settings returned ${response.status}.`);
    return response.json();
  } catch (error) {
    return {
      provider: 'render',
      configured: false,
      apiKeyPresent: false,
      deployHookPresent: false,
      serviceId: null,
      required: ['RENDER_API_KEY', 'RENDER_SERVICE_ID'],
      error: error.message,
    };
  }
}

export async function listRenderDeploys() {
  try {
    const response = await fetch('/api/render/deploys');
    if (!response.ok) throw new Error(`Render deploy list returned ${response.status}.`);
    return response.json();
  } catch (error) {
    return { status: 'unavailable', deploys: [], error: error.message };
  }
}

export async function listLiveRenderServices() {
  try {
    const response = await fetch('/api/render/services');
    if (!response.ok) throw new Error(`Render services returned ${response.status}.`);
    return response.json();
  } catch {
    return [];
  }
}

export async function uploadBuilderSitePackage(file) {
  const db = readLocalDb();
  const site = makeBuilderSite({
    name: (file?.name || 'Uploaded Site').replace(/\.zip$/i, ''),
    source: 'upload',
    filename: file?.name || 'upload.zip',
  });
  db.sites.unshift(site);
  writeLocalDb(db);
  notifyDataChanged();
  return site;
}

export async function importBuilderSiteFromGithub(input) {
  const repo = parseGithubRepo(input.repoUrl);
  if (!repo) {
    throw new Error('Enter a valid GitHub repository URL, for example https://github.com/owner/repo.');
  }

  const siteName = input.name || repo.repo;
  const branch = input.branch || 'main';
  const sandboxId = createId('sandbox');
  const snapshot = await fetchGithubSnapshot(repo, branch);
  const sandbox = await buildGithubSandbox(input, repo, branch, sandboxId);
  const site = await createBuilderSite({
    name: siteName,
    templateId: null,
    source: 'github',
    repositoryProvider: 'github',
    repositoryOwner: repo.owner,
    repositoryName: repo.repo,
    repositoryUrl: repo.url,
    branch,
    rootDirectory: input.rootDirectory || '',
    framework: input.framework || 'Vite + React',
    installCommand: input.installCommand || 'npm ci',
    buildCommand: input.buildCommand || 'npm run build',
    outputDirectory: input.outputDirectory || 'dist',
    content: {
      _source: 'github',
      _repository: repo.fullName,
      _branch: branch,
      _importedAt: new Date().toISOString(),
      _githubImportStatus: snapshot.status,
      _githubSummary: snapshot.summary,
      _githubFiles: snapshot.files,
      _githubFileContents: snapshot.contents,
      _githubEntryHtml: snapshot.entryHtml,
      _sandboxId: sandboxId,
      _sandboxStatus: sandbox.status,
      _sandboxPreviewUrl: sandbox.previewUrl,
      _sandboxOutputDirectory: sandbox.outputDirectory,
      _sandboxMode: sandbox.mode || 'static',
      _sandboxFiles: sandbox.files || [],
      _sandboxLogs: sandbox.logs,
      _sandboxError: sandbox.error,
    },
  });

  const db = readLocalDb();
  const project = makeProject({
    name: siteName,
    slug: slugify(siteName),
    framework: input.framework || 'Vite + React',
    repositoryProvider: 'github',
    repositoryOwner: repo.owner,
    repositoryName: repo.repo,
    repositoryUrl: repo.url,
    productionBranch: branch,
  });
  db.projects.unshift(project);
  const storedSite = db.sites.find((item) => item.id === site.id);
  if (storedSite) {
    storedSite.projectId = project.id;
    storedSite.repositoryProvider = 'github';
    storedSite.repositoryOwner = repo.owner;
    storedSite.repositoryName = repo.repo;
    storedSite.repositoryUrl = repo.url;
    storedSite.branch = branch;
    storedSite.rootDirectory = input.rootDirectory || '';
    storedSite.framework = input.framework || 'Vite + React';
    storedSite.installCommand = input.installCommand || 'npm ci';
    storedSite.buildCommand = input.buildCommand || 'npm run build';
    storedSite.outputDirectory = input.outputDirectory || 'dist';
    storedSite.sandboxId = sandboxId;
    storedSite.previewUrl = sandbox.previewUrl || null;
  }
  db.activity.unshift(makeActivity('builder.github_imported', `Imported ${repo.fullName} from GitHub.`, 'builder_site', site.id));
  writeLocalDb(db);
  notifyDataChanged();

  return storedSite || { ...site, projectId: project.id };
}

async function buildGithubSandbox(input, repo, branch, sandboxId) {
  try {
    const response = await fetch('/api/builder/import-github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: sandboxId,
        repoUrl: input.repoUrl || repo.url,
        branch,
        outputDirectory: input.outputDirectory || 'dist',
      }),
    });
    if (!response.ok) throw new Error(`Sandbox build endpoint returned ${response.status}.`);
    return await response.json();
  } catch (error) {
    return {
      siteId: sandboxId,
      status: 'unavailable',
      previewUrl: null,
      outputDirectory: input.outputDirectory || 'dist',
      logs: [{ ok: false, command: 'sandbox', output: error.message || 'Sandbox build is unavailable.' }],
      error: error.message || 'Sandbox build is unavailable.',
    };
  }
}

async function fetchGithubSnapshot(repo, branch) {
  if (typeof fetch !== 'function') {
    return emptyGithubSnapshot('GitHub file reading is not available in this runtime.');
  }

  const treeUrl = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const treeResponse = await fetch(treeUrl, { headers: { Accept: 'application/vnd.github+json' } });
  if (!treeResponse.ok) {
    throw new Error(treeResponse.status === 404
      ? `Could not read ${repo.fullName} on branch ${branch}. Check that the repo is public and the branch exists.`
      : `GitHub returned ${treeResponse.status} while reading ${repo.fullName}. Try again or upload a ZIP.`);
  }

  const treeData = await treeResponse.json();
  const files = (treeData.tree || [])
    .filter((item) => item.type === 'blob')
    .map((item) => ({ path: item.path, size: item.size || 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const preferred = pickGithubFiles(files);
  const contents = {};
  await Promise.all(preferred.map(async (file) => {
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${encodeURIComponent(branch)}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(rawUrl);
    if (response.ok) contents[file.path] = await response.text();
  }));

  const entryHtml = contents['index.html'] || contents['public/index.html'] || '';
  return {
    status: 'loaded',
    files,
    contents,
    entryHtml,
    summary: {
      fileCount: files.length,
      loadedFileCount: Object.keys(contents).length,
      hasPackageJson: files.some((file) => file.path === 'package.json'),
      hasIndexHtml: !!entryHtml,
    },
  };
}

function emptyGithubSnapshot(message) {
  return {
    status: 'metadata-only',
    files: [],
    contents: {},
    entryHtml: '',
    summary: { fileCount: 0, loadedFileCount: 0, hasPackageJson: false, hasIndexHtml: false, message },
  };
}

function pickGithubFiles(files) {
  const important = ['package.json', 'index.html', 'public/index.html', 'src/main.jsx', 'src/main.tsx', 'src/App.jsx', 'src/App.tsx', 'vite.config.js', 'vite.config.ts'];
  const textExtensions = /\.(html|css|js|jsx|ts|tsx|json|md|txt|yml|yaml)$/i;
  const selected = [];

  important.forEach((path) => {
    const file = files.find((item) => item.path === path);
    if (file && file.size <= 200000) selected.push(file);
  });

  files.forEach((file) => {
    if (selected.length >= 24) return;
    if (selected.some((item) => item.path === file.path)) return;
    if (!textExtensions.test(file.path)) return;
    if (file.size > 120000) return;
    if (/(^|\/)(node_modules|dist|build|\.git|coverage)\//.test(file.path)) return;
    selected.push(file);
  });

  return selected;
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

function handleLocalApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = parseBody(options.body);
  const db = readLocalDb();
  const cleanPath = path.split('?')[0];

  if (cleanPath === '/auth/login' || cleanPath === '/auth/register') return makeSession(body);
  if (cleanPath === '/projects') {
    if (method === 'POST') {
      const project = makeProject(body);
      db.projects.unshift(project);
      db.activity.unshift(makeActivity('project.created', `Created project ${project.name}.`, 'project', project.id));
      writeLocalDb(db);
      return project;
    }
    return db.projects;
  }

  const projectMatch = cleanPath.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    const project = db.projects.find((item) => item.id === projectMatch[1]);
    if (!project) throw new Error('Project not found.');
    if (method === 'PATCH') Object.assign(project, body, { updatedAt: new Date().toISOString() });
    if (method === 'DELETE') Object.assign(project, { status: 'archived', updatedAt: new Date().toISOString() });
    writeLocalDb(db);
    return project;
  }

  const deploymentsMatch = cleanPath.match(/^\/projects\/([^/]+)\/deployments$/);
  if (deploymentsMatch) {
    if (method === 'POST') {
      const deployment = makeDeployment(deploymentsMatch[1], body);
      db.deployments.unshift(deployment);
      db.logs[deployment.id] = [makeLog('Deployment queued.'), makeLog('npm run build completed.'), makeLog('Static artifact ready.')];
      writeLocalDb(db);
      return deployment;
    }
    return db.deployments.filter((item) => item.projectId === deploymentsMatch[1]);
  }

  const deploymentActionMatch = cleanPath.match(/^\/deployments\/([^/]+)\/(cancel|rollback)$/);
  if (deploymentActionMatch) {
    const deployment = db.deployments.find((item) => item.id === deploymentActionMatch[1]);
    if (!deployment) throw new Error('Deployment not found.');
    deployment.status = deploymentActionMatch[2] === 'cancel' ? 'cancelled' : 'rolled_back';
    writeLocalDb(db);
    return deployment;
  }

  const deploymentLogsMatch = cleanPath.match(/^\/deployments\/([^/]+)\/logs$/);
  if (deploymentLogsMatch) return db.logs[deploymentLogsMatch[1]] || [];

  const artifactsMatch = cleanPath.match(/^\/projects\/([^/]+)\/artifacts$/);
  if (artifactsMatch) return db.artifacts.filter((item) => item.projectId === artifactsMatch[1]);

  const envVarsMatch = cleanPath.match(/^\/projects\/([^/]+)\/env-vars$/);
  if (envVarsMatch) {
    if (method === 'POST') {
      const envVar = makeEnvVar(envVarsMatch[1], body);
      db.envVars.unshift(envVar);
      writeLocalDb(db);
      return envVar;
    }
    return db.envVars.filter((item) => item.projectId === envVarsMatch[1]);
  }

  const envVarMatch = cleanPath.match(/^\/projects\/([^/]+)\/env-vars\/([^/]+)$/);
  if (envVarMatch) {
    const envVar = db.envVars.find((item) => item.id === envVarMatch[2]);
    if (!envVar) throw new Error('Environment variable not found.');
    if (method === 'PATCH') Object.assign(envVar, body, { updatedAt: new Date().toISOString() });
    if (method === 'DELETE') db.envVars = db.envVars.filter((item) => item.id !== envVar.id);
    writeLocalDb(db);
    return method === 'DELETE' ? { deleted: true } : envVar;
  }

  if (cleanPath.includes('/env-vars/export')) {
    const projectId = cleanPath.split('/')[2];
    return db.envVars.filter((item) => item.projectId === projectId);
  }

  if (cleanPath === '/domains') {
    if (method === 'POST') {
      const domain = makeDomain(body);
      db.domains.unshift(domain);
      db.dnsRecords[domain.id] = defaultDnsRecords(domain.hostname);
      writeLocalDb(db);
      return domain;
    }
    return db.domains;
  }

  const domainMatch = cleanPath.match(/^\/domains\/([^/]+)$/);
  if (domainMatch) {
    const domain = db.domains.find((item) => item.id === domainMatch[1]);
    if (!domain) throw new Error('Domain not found.');
    if (method === 'PATCH') Object.assign(domain, body, { updatedAt: new Date().toISOString() });
    if (method === 'DELETE') domain.status = 'disabled';
    writeLocalDb(db);
    return domain;
  }

  const verifyDomainMatch = cleanPath.match(/^\/domains\/([^/]+)\/verify$/);
  if (verifyDomainMatch) {
    const domain = db.domains.find((item) => item.id === verifyDomainMatch[1]);
    if (!domain) throw new Error('Domain not found.');
    Object.assign(domain, { status: 'verified', verifiedAt: new Date().toISOString() });
    writeLocalDb(db);
    return { verified: true, ...domain };
  }

  const dnsRecordsMatch = cleanPath.match(/^\/domains\/([^/]+)\/dns-records$/);
  if (dnsRecordsMatch) {
    const domainId = dnsRecordsMatch[1];
    if (method === 'POST') {
      const record = makeDnsRecord(body);
      db.dnsRecords[domainId] = [record, ...(db.dnsRecords[domainId] || [])];
      writeLocalDb(db);
      return record;
    }
    if (method === 'DELETE') {
      const ids = body.recordIds || [];
      db.dnsRecords[domainId] = (db.dnsRecords[domainId] || []).filter((item) => !ids.includes(item.id));
      writeLocalDb(db);
      return { deleted: ids.length };
    }
    return db.dnsRecords[domainId] || [];
  }

  const dnsRecordMatch = cleanPath.match(/^\/domains\/([^/]+)\/dns-records\/([^/]+)$/);
  if (dnsRecordMatch) {
    const records = db.dnsRecords[dnsRecordMatch[1]] || [];
    const record = records.find((item) => item.id === dnsRecordMatch[2]);
    if (!record) throw new Error('DNS record not found.');
    if (method === 'PATCH') Object.assign(record, body);
    if (method === 'DELETE') db.dnsRecords[dnsRecordMatch[1]] = records.filter((item) => item.id !== record.id);
    writeLocalDb(db);
    return method === 'DELETE' ? { deleted: true } : record;
  }

  if (cleanPath.includes('/dns-records/export')) {
    const domainId = cleanPath.split('/')[2];
    const domain = db.domains.find((item) => item.id === domainId);
    const records = db.dnsRecords[domainId] || [];
    return { hostname: domain?.hostname || 'example.com', content: records.map((r) => `${r.name} ${r.ttl} IN ${r.type} ${r.value}`).join('\n') };
  }

  if (cleanPath === '/billing/summary') return db.billing;
  if (cleanPath.startsWith('/activity')) return db.activity;
  if (cleanPath.startsWith('/audit')) return db.audit;
  if (cleanPath === '/render/services') return db.renderServices;

  if (cleanPath === '/builder/sites') {
    if (method === 'POST') {
      const site = makeBuilderSite(body);
      db.sites.unshift(site);
      writeLocalDb(db);
      return site;
    }
    return db.sites;
  }

  const builderSiteMatch = cleanPath.match(/^\/builder\/sites\/([^/]+)$/);
  if (builderSiteMatch) {
    const site = db.sites.find((item) => item.id === builderSiteMatch[1]);
    if (!site) throw new Error('Builder site not found.');
    if (method === 'PATCH') Object.assign(site, body, { updatedAt: new Date().toISOString() });
    if (method === 'DELETE') site.status = 'archived';
    writeLocalDb(db);
    return site;
  }

  const builderPagesMatch = cleanPath.match(/^\/builder\/sites\/([^/]+)\/pages$/);
  if (builderPagesMatch) {
    const site = db.sites.find((item) => item.id === builderPagesMatch[1]);
    if (!site) throw new Error('Builder site not found.');
    if (method === 'POST') {
      const page = makeBuilderPage(body);
      site.pages.push(page);
      writeLocalDb(db);
      return page;
    }
    return site.pages;
  }

  const builderPageMatch = cleanPath.match(/^\/builder\/sites\/([^/]+)\/pages\/([^/]+)$/);
  if (builderPageMatch) {
    const site = db.sites.find((item) => item.id === builderPageMatch[1]);
    const page = site?.pages.find((item) => item.id === builderPageMatch[2]);
    if (!site || !page) throw new Error('Builder page not found.');
    if (method === 'PATCH') Object.assign(page, body, { updatedAt: new Date().toISOString() });
    if (method === 'DELETE') page.status = 'archived';
    writeLocalDb(db);
    return page;
  }

  if (cleanPath.includes('/versions')) return [];
  if (cleanPath.includes('/publish')) {
    const siteId = cleanPath.split('/')[3];
    const site = db.sites.find((item) => item.id === siteId);
    if (!site) throw new Error('Builder site not found.');
    site.status = 'published';
    site.publishedAt = new Date().toISOString();
    writeLocalDb(db);
    return site;
  }

  return null;
}

function readLocalDb() {
  const stored = safeParseJson(window.localStorage.getItem(LOCAL_DB_KEY));
  if (stored) return stored;
  const seeded = seedLocalDb();
  writeLocalDb(seeded);
  return seeded;
}

function writeLocalDb(db) {
  window.localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
}

function seedLocalDb() {
  const project = makeProject({
    name: 'Glondia Sites',
    slug: 'glondia-sites',
    framework: 'Vite + React',
    productionBranch: 'main',
  });
  const deployment = makeDeployment(project.id, { environment: 'production', source: 'manual', commitMessage: 'Clean Vite React deployment' });
  const domain = makeDomain({ hostname: 'glondiasites.com', projectId: project.id });
  return {
    projects: [project],
    deployments: [deployment],
    logs: {
      [deployment.id]: [makeLog('npm ci'), makeLog('npm run build'), makeLog('Static app served from dist.')],
    },
    envVars: [makeEnvVar(project.id, { key: 'VITE_APP_MODE', value: 'local', environment: 'production' })],
    artifacts: [makeArtifact(project.id, deployment.id)],
    domains: [domain],
    dnsRecords: { [domain.id]: defaultDnsRecords(domain.hostname) },
    sites: [makeBuilderSite({ name: 'Scalatone', templateId: 'scalatone-html', source: 'template' })],
    activity: [makeActivity('app.ready', 'Clean Vite React workspace is ready.', 'workspace', 'local-org')],
    audit: [],
    renderServices: [{ id: 'local-static', name: 'Glondia Static App', type: 'web_service', region: 'oregon' }],
    billing: {
      subscription: {
        status: 'active',
        seats: 1,
        currentPeriodEnd: '2026-06-24T00:00:00.000Z',
        plan: { name: 'Local SSD', priceMonthlyCents: 0, currency: 'USD' },
      },
      invoices: [],
      usage: [
        { metric: 'build_minutes', value: 0, limit: 1000 },
        { metric: 'bandwidth_gb', value: 0, limit: 1024 },
        { metric: 'projects', value: 1, limit: 10 },
        { metric: 'team_members', value: 1, limit: 5 },
      ],
      paymentMethod: null,
    },
  };
}

function makeSession(input = {}) {
  const user = {
    id: 'local-user',
    name: input.name || input.email?.split('@')[0] || 'Glondia User',
    email: input.email || 'local@glondia.app',
  };
  return {
    user,
    organization: { id: 'local-org', name: input.organizationName || 'Local Workspace', slug: 'local-workspace' },
    membership: { id: 'local-member', roleId: 'owner' },
    session: { id: 'local-session', expiresAt: new Date(Date.now() + 86400000).toISOString() },
    tokens: { accessToken: 'local-demo-token', refreshToken: 'local-refresh-token', tokenType: 'Bearer' },
  };
}

function makeProject(input = {}) {
  const now = new Date().toISOString();
  const slug = input.slug || slugify(input.name || 'local-site');
  return {
    id: input.id || createId('project'),
    organizationId: 'local-org',
    name: input.name || 'Local Site',
    slug,
    framework: input.framework || 'Vite + React',
    status: input.status || 'active',
    repositoryProvider: input.repositoryProvider || null,
    repositoryOwner: input.repositoryOwner || null,
    repositoryName: input.repositoryName || null,
    repositoryId: input.repositoryId || null,
    repositoryUrl: input.repositoryUrl || null,
    rootDirectory: input.rootDirectory || './',
    installCommand: input.installCommand || 'npm ci',
    buildCommand: input.buildCommand || 'npm run build',
    outputDirectory: input.outputDirectory || 'dist',
    productionBranch: input.productionBranch || 'main',
    renderServiceId: input.renderServiceId || null,
    domain: `${slug}.glondia.app`,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDeployment(projectId, input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || createId('dep'),
    projectId,
    organizationId: 'local-org',
    environment: input.environment || 'production',
    source: input.source || 'manual',
    status: input.status || 'deployed',
    commitMessage: input.commitMessage || 'Local Vite build',
    commitSha: input.commitSha || 'localbuild',
    branch: input.branch || 'main',
    durationMs: 18000,
    provider: 'render',
    providerServiceId: 'local-static',
    providerDeployId: null,
    providerStatus: 'live',
    createdAt: now,
    finishedAt: now,
    artifacts: [makeArtifact(projectId)],
  };
}

function makeArtifact(projectId, deploymentId = createId('dep')) {
  return {
    id: createId('artifact'),
    projectId,
    deploymentId,
    bucket: 'local-dist',
    objectKey: 'dist/index.html',
    sizeBytes: 512000,
    checksum: 'local',
    status: 'ready',
    createdAt: new Date().toISOString(),
  };
}

function makeEnvVar(projectId, input = {}) {
  return {
    id: input.id || createId('env'),
    projectId,
    key: String(input.key || 'VITE_APP_MODE').toUpperCase(),
    value: input.value || 'local',
    environment: input.environment || 'production',
    updatedAt: new Date().toISOString(),
  };
}

function makeDomain(input = {}) {
  const hostname = String(input.hostname || input.name || 'example.com').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return {
    id: input.id || createId('domain'),
    organizationId: 'local-org',
    projectId: input.projectId || null,
    hostname,
    rootDomain: hostname.split('.').slice(-2).join('.'),
    status: input.status || 'active',
    verificationToken: `glondia-verify=${createId('token')}`,
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function makeDnsRecord(input = {}) {
  return {
    id: input.id || createId('dns'),
    type: input.type || 'A',
    name: input.name || input.host || '@',
    value: input.value || '216.24.57.1',
    ttl: ttlToSeconds(input.ttl || input.ttlSeconds || 3600),
    priority: input.priority ?? null,
    proxied: !!input.proxied || !!input.proxy,
    status: input.status || 'active',
  };
}

function defaultDnsRecords(hostname) {
  return [
    makeDnsRecord({ type: 'A', name: '@', value: '216.24.57.1' }),
    makeDnsRecord({ type: 'CNAME', name: 'www', value: hostname }),
  ];
}

function makeBuilderSite(input = {}) {
  const now = new Date().toISOString();
  const siteId = input.id || createId('site');
  return {
    id: siteId,
    organizationId: 'local-org',
    name: input.name || 'Local Site',
    slug: slugify(input.name || 'local-site'),
    projectId: input.projectId || null,
    templateId: input.templateId || null,
    status: input.status || 'draft',
    source: input.source || 'local',
    filename: input.filename || null,
    repositoryProvider: input.repositoryProvider || null,
    repositoryOwner: input.repositoryOwner || null,
    repositoryName: input.repositoryName || null,
    repositoryUrl: input.repositoryUrl || null,
    branch: input.branch || null,
    rootDirectory: input.rootDirectory || '',
    framework: input.framework || null,
    installCommand: input.installCommand || null,
    buildCommand: input.buildCommand || null,
    outputDirectory: input.outputDirectory || null,
    createdAt: now,
    updatedAt: now,
    pages: [makeBuilderPage({ siteId, title: 'Home', path: '/', content: input.content || {} })],
  };
}

function makeBuilderPage(input = {}) {
  return {
    id: input.id || createId('page'),
    siteId: input.siteId || null,
    title: input.title || 'Untitled',
    path: input.path || '/',
    status: input.status || 'draft',
    sortOrder: input.sortOrder || 0,
    content: input.content || {},
    updatedAt: new Date().toISOString(),
  };
}

function makeActivity(action, message, entityType, entityId) {
  return {
    id: createId('activity'),
    action,
    message,
    entityType,
    entityId,
    actor: { name: 'Glondia' },
    createdAt: new Date().toISOString(),
  };
}

function makeLog(message, level = 'info') {
  return { id: createId('log'), message, level, createdAt: new Date().toISOString() };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body !== 'string') return body;
  return safeParseJson(body) || {};
}

function parseGithubRepo(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const ssh = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return normalizeGithubRepo(ssh[1], ssh[2]);

  const shorthand = raw.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand && !raw.includes('://')) return normalizeGithubRepo(shorthand[1], shorthand[2]);

  try {
    const url = new URL(raw);
    if (!/github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return null;
    return normalizeGithubRepo(parts[0], parts[1]);
  } catch {
    return null;
  }
}

function normalizeGithubRepo(owner, repo) {
  const cleanOwner = String(owner || '').trim();
  const cleanRepo = String(repo || '').trim().replace(/\.git$/i, '');
  if (!cleanOwner || !cleanRepo) return null;
  return {
    owner: cleanOwner,
    repo: cleanRepo,
    fullName: `${cleanOwner}/${cleanRepo}`,
    url: `https://github.com/${cleanOwner}/${cleanRepo}`,
  };
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value) {
  return String(value || 'item').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
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
