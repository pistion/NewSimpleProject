/**
 * githubLinkToRender.pipeline.js
 *
 * GitHub repo URL -> Render pipeline.
 */

import renderApiService from '../../../services/renderApiService.js';
import { makeId, mutateHostingStore, nowIso } from '../../../services/hostingStore.js';
import { buildRenderPayload } from '../04-RENDER-PAYLOAD-MOUNTAIN/renderPayloadBuilder.stage.js';
import { createAndTriggerRenderDeploy } from '../05-RENDER-DEPLOY-MOUNTAIN/renderDeploy.stage.js';

export async function run(input = {}, context = {}) {
  const repoUrl = input.repoUrl || input.repositoryUrl || input.sourceRepository || input.sourceReference;
  if (!repoUrl) throw requestError('repoUrl is required.', 400, 'github_repo_validate');

  const payload = buildRenderPayload({
    ...input,
    serviceName: input.serviceName || input.name || repoName(repoUrl),
    repoUrl,
    repositoryUrl: repoUrl,
    sourceReference: repoUrl,
  });

  const deployment = await createDeploymentRecord({
    userId: context.userId,
    siteId: input.siteId,
    projectId: input.projectId || input.siteId,
    serviceName: payload.serviceName,
    serviceType: payload.serviceType,
    repoUrl,
    githubBranch: payload.branch,
    environmentConfiguration: {
      sourceRepository: repoUrl,
      branch: payload.branch,
      rootDirectory: payload.rootDirectory || '',
      buildCommand: payload.buildCommand || null,
      startCommand: payload.startCommand || null,
      outputDirectory: payload.outputDirectory || payload.publishDirectory || null,
      runtime: payload.runtime || null,
      plan: payload.plan || 'starter',
      region: payload.region || 'oregon',
    },
  });

  await addLog(deployment.deploymentId, `Creating Render service from GitHub source: ${repoUrl}.`, 'info');

  try {
    if (!renderApiService.configured()) {
      const settings = renderApiService.settings();
      return updateDeployment(deployment.deploymentId, {
        status: 'ready',
        buildStatus: 'configuration_required',
        currentStep: 'Ready - missing Render credentials',
        errorMessage: `Configure ${settings.required.join(', ')} to deploy this GitHub repo to Render.`,
        errorDetails: settings,
      });
    }

    const renderResult = await createAndTriggerRenderDeploy(payload);
    await addLog(deployment.deploymentId, `Render deploy ${renderResult.deployId} started.`, 'ok', {
      renderServiceId: renderResult.serviceId,
    });
    return updateDeployment(deployment.deploymentId, {
      renderServiceId: renderResult.serviceId,
      renderDeployId: renderResult.deployId,
      render: {
        serviceResponse: renderResult.serviceResponse,
        deployResponse: renderResult.deployResponse,
      },
      providerStatus: renderResult.providerStatus,
      status: 'building',
      buildStatus: 'queued',
      currentStep: 'Queued in Render',
      liveUrl: renderResult.liveUrl,
      errorMessage: null,
    });
  } catch (error) {
    await addLog(deployment.deploymentId, error.message || 'GitHub deployment failed.', 'error', error.details || null);
    return updateDeployment(deployment.deploymentId, {
      status: 'failed',
      buildStatus: 'failed',
      currentStep: stageToStep(error.stage || 'render_service_create'),
      errorMessage: error.message || 'GitHub deployment failed.',
      errorDetails: error.details || null,
    });
  }
}

class GithubDeploymentPipelineService {
  async create(input = {}, context = {}) {
    return run(input, context);
  }
}

async function createDeploymentRecord(input = {}) {
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
    status: 'preparing',
    buildStatus: 'queued',
    currentStep: 'Creating Render service',
    liveUrl: null,
    verifiedUrl: null,
    urlReachable: false,
    errorMessage: null,
    repoUrl: input.repoUrl || null,
    githubRepo: input.repoUrl || null,
    githubBranch: input.githubBranch || 'main',
    source: 'github',
    sourceReference: input.repoUrl || null,
    platformDeployed: true,
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

async function updateDeployment(deploymentId, patch = {}) {
  return mutateHostingStore((store) => {
    const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.id === deploymentId);
    if (!deployment) return null;
    Object.assign(deployment, patch, { updatedAt: nowIso() });
    return deployment;
  });
}

async function addLog(deploymentId, message, level = 'info', details = null) {
  return mutateHostingStore((store) => {
    store.logs[deploymentId] = [makeLog(message, level, details), ...(store.logs[deploymentId] || [])];
    return store.logs[deploymentId][0];
  });
}

function makeLog(message, level = 'info', details = null) {
  return { id: makeId('log'), level, message, details: details || undefined, timestamp: nowIso(), createdAt: nowIso() };
}

function repoName(url) {
  return (String(url || '').match(/github\.com[:/]([^/]+)\/([^/.#?]+)/i)?.[2] || 'glondia-github-site').replace(/\.git$/i, '');
}

function requestError(message, status, stage) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.expose = true;
  return error;
}

function stageToStep(stage) {
  return {
    github_repo_validate: 'GitHub repo validation failed',
    render_service_create: 'Render service creation failed',
    render_deploy_trigger: 'Render deploy trigger failed',
  }[stage] || 'Failed';
}

export default new GithubDeploymentPipelineService();
