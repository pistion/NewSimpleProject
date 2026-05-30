import { makeId, mutateHostingStore, nowIso } from './hostingStore.js';

export async function createDeploymentRecord(input = {}) {
  const now = nowIso();
  const deploymentId = makeId('dep');
  const deploymentSessionId = makeId('session');
  const deployment = {
    deploymentId,
    id: deploymentId,
    deploymentSessionId,
    userId: input.userId,
    siteId: input.siteId || null,
    projectId: input.projectId || input.siteId || null,
    renderServiceId: null,
    renderDeployId: null,
    serviceName: input.serviceName || 'glondia-site',
    serviceType: input.serviceType || 'static_site',
    provider: 'render',
    providerStatus: 'accepted',
    status: input.status || 'preparing',
    buildStatus: input.buildStatus || 'queued',
    currentStep: input.currentStep || 'Preparing',
    liveUrl: null,
    verifiedUrl: null,
    urlReachable: false,
    errorMessage: null,
    repoUrl: input.repoUrl || null,
    githubRepo: input.repoUrl || null,
    githubBranch: input.githubBranch || 'main',
    source: input.source || 'deployment',
    sourceReference: input.sourceReference || null,
    generatedSite: input.generatedSite || null,
    environmentVariablesMetadata: [],
    diskMetadata: [],
    domainMetadata: [],
    deploymentLogsReference: deploymentId,
    render: null,
    createdAt: now,
    updatedAt: now,
    lastDeployedAt: null,
    environmentConfiguration: input.environmentConfiguration || {},
  };
  const session = {
    deploymentSessionId,
    deploymentId,
    userId: input.userId,
    projectId: input.projectId || input.siteId || null,
    status: 'started',
    animationState: 'deploying',
    createdAt: now,
    updatedAt: now,
  };
  return mutateHostingStore((store) => {
    store.sessions.unshift(session);
    store.deployments.unshift(deployment);
    store.logs[deploymentId] = [makeLog('Deployment session created.', 'info')];
    return deployment;
  });
}

export async function updateDeploymentRecord(deploymentId, patch = {}) {
  return mutateHostingStore((store) => {
    const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.id === deploymentId);
    if (!deployment) return null;
    Object.assign(deployment, patch, { updatedAt: nowIso() });
    return deployment;
  });
}

export async function addDeploymentLog(deploymentId, message, level = 'info', details = null) {
  return mutateHostingStore((store) => {
    store.logs[deploymentId] = [makeLog(message, level, details), ...(store.logs[deploymentId] || [])];
    return store.logs[deploymentId][0];
  });
}

export function makeLog(message, level = 'info', details = null) {
  return { id: makeId('log'), level, message, details: details || undefined, timestamp: nowIso(), createdAt: nowIso() };
}

export function renderSafeName(value) {
  return String(value || 'glondia-site').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'glondia-site';
}

export function serviceUrl(serviceResponse) {
  return serviceResponse?.service?.serviceDetails?.url || serviceResponse?.serviceDetails?.url || serviceResponse?.service?.url || serviceResponse?.url || null;
}
