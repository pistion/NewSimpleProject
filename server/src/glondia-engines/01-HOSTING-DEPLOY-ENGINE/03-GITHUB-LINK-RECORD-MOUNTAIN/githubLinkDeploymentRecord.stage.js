/**
 * githubLinkDeploymentRecord.stage.js
 *
 * Hosting store record helpers for direct GitHub link deployments.
 */

import { makeId, mutateHostingStore, nowIso } from '../../../services/hostingStore.js';

export async function createGithubLinkDeploymentRecord({ normalized, source, payload }) {
  const now = nowIso();
  const deploymentId = makeId('dep');
  const deploymentSessionId = makeId('session');
  const deployment = {
    deploymentId,
    id: deploymentId,
    deploymentSessionId,
    userId: normalized.userId,
    siteId: normalized.siteId,
    projectId: normalized.projectId,
    renderServiceId: null,
    renderDeployId: null,
    serviceName: payload.serviceName,
    serviceType: payload.serviceType || 'static_site',
    provider: 'render',
    providerStatus: 'accepted',
    status: 'preparing',
    buildStatus: 'queued',
    currentStep: 'Creating Render service from GitHub link',
    liveUrl: null,
    verifiedUrl: null,
    urlReachable: false,
    errorMessage: null,
    repoUrl: source.repoUrl,
    githubRepo: source.repoUrl,
    githubBranch: source.branch,
    source: 'github-link',
    sourceReference: source.sourceReference,
    platformDeployed: true,
    environmentVariablesMetadata: [],
    diskMetadata: [],
    domainMetadata: [],
    deploymentLogsReference: deploymentId,
    render: null,
    createdAt: now,
    updatedAt: now,
    lastDeployedAt: null,
    githubSource: {
      owner: source.owner,
      repo: source.repo,
      fullName: source.fullName,
      branch: source.branch,
    },
    environmentConfiguration: {
      sourceRepository: source.repoUrl,
      branch: source.branch,
      rootDirectory: payload.rootDirectory || '',
      buildCommand: payload.buildCommand || null,
      startCommand: payload.startCommand || null,
      outputDirectory: payload.outputDirectory || payload.publishDirectory || null,
      runtime: payload.runtime || null,
      plan: payload.plan || 'starter',
      region: payload.region || 'oregon',
    },
  };
  const session = {
    deploymentSessionId,
    deploymentId,
    userId: normalized.userId,
    projectId: normalized.projectId,
    status: 'started',
    animationState: 'deploying',
    createdAt: now,
    updatedAt: now,
  };
  return mutateHostingStore((store) => {
    store.sessions.unshift(session);
    store.deployments.unshift(deployment);
    store.logs[deploymentId] = [makeLog('GitHub link deployment session created.', 'info')];
    return deployment;
  });
}

export async function updateGithubLinkDeployment(deploymentId, patch = {}) {
  return mutateHostingStore((store) => {
    const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.id === deploymentId);
    if (!deployment) return null;
    Object.assign(deployment, patch, { updatedAt: nowIso() });
    return deployment;
  });
}

export async function addGithubLinkDeploymentLog(deploymentId, message, level = 'info', details = null) {
  return mutateHostingStore((store) => {
    store.logs[deploymentId] = [makeLog(message, level, details), ...(store.logs[deploymentId] || [])];
    return store.logs[deploymentId][0];
  });
}

function makeLog(message, level = 'info', details = null) {
  return { id: makeId('log'), level, message, details: details || undefined, timestamp: nowIso(), createdAt: nowIso() };
}
