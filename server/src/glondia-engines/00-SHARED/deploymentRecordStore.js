/**
 * deploymentRecordStore.js — 00-SHARED
 *
 * Create, update, and query deployment records in the hosting store.
 * Both engines write records here — single source of truth for all
 * deployment state that flows to the client dashboard.
 *
 * Moved from: server/src/services/deploymentRecordStore.js
 * Original kept as a thin re-export for backward compatibility.
 */

import { makeId, mutateHostingStore, nowIso } from '../../services/hostingStore.js';

// ── Record creation ──────────────────────────────────────────────────────────

export async function createDeploymentRecord(input = {}) {
  const now = nowIso();
  const deploymentId       = makeId('dep');
  const deploymentSessionId = makeId('session');

  const deployment = {
    deploymentId,
    id: deploymentId,
    deploymentSessionId,
    userId:         input.userId      || null,
    siteId:         input.siteId      || null,
    projectId:      input.projectId   || input.siteId || null,
    renderServiceId: null,
    renderDeployId:  null,
    serviceName:    input.serviceName || 'glondia-site',
    serviceType:    input.serviceType || 'static_site',
    provider:       'render',
    providerStatus: 'accepted',
    status:         input.status      || 'preparing',
    buildStatus:    input.buildStatus || 'queued',
    currentStep:    input.currentStep || 'Preparing',
    liveUrl:        null,
    verifiedUrl:    null,
    urlReachable:   false,
    errorMessage:   null,
    repoUrl:        input.repoUrl     || null,
    githubRepo:     input.repoUrl     || null,
    githubBranch:   input.githubBranch || 'main',
    source:         input.source      || 'deployment',
    sourceReference: input.sourceReference || null,
    // Marks this record as platform-deployed — required for payment enforcement
    platformDeployed: true,
    generatedSite:  input.generatedSite || null,
    environmentVariablesMetadata: [],
    diskMetadata:   [],
    domainMetadata: [],
    deploymentLogsReference: deploymentId,
    render:         null,
    createdAt:      now,
    updatedAt:      now,
    lastDeployedAt: null,
    environmentConfiguration: input.environmentConfiguration || {},
  };

  const session = {
    deploymentSessionId,
    deploymentId,
    userId:    input.userId   || null,
    projectId: input.projectId || input.siteId || null,
    status:    'started',
    animationState: 'deploying',
    createdAt: now,
    updatedAt: now,
  };

  return mutateHostingStore((store) => {
    normalizeDeploymentStore(store);
    store.sessions.unshift(session);
    store.deployments.unshift(deployment);
    store.logs[deploymentId] = [makeLog('Deployment session created.', 'info')];
    return deployment;
  });
}

// ── Record updates ────────────────────────────────────────────────────────────

export async function updateDeploymentRecord(deploymentId, patch = {}) {
  return mutateHostingStore((store) => {
    normalizeDeploymentStore(store);
    const deployment = store.deployments.find(
      (d) => d.deploymentId === deploymentId || d.id === deploymentId,
    );
    if (!deployment) return null;
    Object.assign(deployment, patch, { updatedAt: nowIso() });
    return deployment;
  });
}

// ── Log helpers ───────────────────────────────────────────────────────────────

export async function addDeploymentLog(deploymentId, message, level = 'info', details = null) {
  return mutateHostingStore((store) => {
    normalizeDeploymentStore(store);
    store.logs[deploymentId] = [
      makeLog(message, level, details),
      ...(store.logs[deploymentId] || []),
    ];
    return store.logs[deploymentId][0];
  });
}

export function makeLog(message, level = 'info', details = null) {
  return {
    id:        makeId('log'),
    level,
    message,
    details:   details || undefined,
    timestamp: nowIso(),
    createdAt: nowIso(),
  };
}

// ── Name/URL helpers ──────────────────────────────────────────────────────────

export function renderSafeName(value) {
  return String(value || 'glondia-site')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'glondia-site';
}

export function serviceUrl(serviceResponse) {
  return (
    serviceResponse?.service?.serviceDetails?.url ||
    serviceResponse?.serviceDetails?.url ||
    serviceResponse?.service?.url ||
    serviceResponse?.url ||
    null
  );
}

function normalizeDeploymentStore(store) {
  if (!Array.isArray(store.deployments)) store.deployments = [];
  if (!Array.isArray(store.sessions)) store.sessions = [];
  if (!store.logs || typeof store.logs !== 'object' || Array.isArray(store.logs)) store.logs = {};
  if (!store.env || typeof store.env !== 'object' || Array.isArray(store.env)) store.env = {};
  if (!store.disks || typeof store.disks !== 'object' || Array.isArray(store.disks)) store.disks = {};
  if (!store.domains || typeof store.domains !== 'object' || Array.isArray(store.domains)) store.domains = {};
  if (!Array.isArray(store.checkoutOrders)) store.checkoutOrders = [];
  if (!Array.isArray(store.payments)) store.payments = [];
  return store;
}
