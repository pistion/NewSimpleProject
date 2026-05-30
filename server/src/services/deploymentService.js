import renderApiService from './renderApiService.js';
import deploymentStatusService from './deploymentStatusService.js';
import { makeId, mutateHostingStore, nowIso, readHostingStore } from './hostingStore.js';

class DeploymentService {
  async createRenderDeployment(input = {}, context = {}) {
    return this.createDeployment(input, { ...context, requireRender: true });
  }

  async createDeployment(input = {}, context = {}) {
    const now = nowIso();
    const deploymentId = makeId('dep');
    const deploymentSessionId = makeId('session');
    const serviceType = input.serviceType || (input.startCommand ? 'web_service' : 'static_site');
    const serviceName = input.serviceName || input.name || input.slug || 'Glondia site';
    const sourceReference = input.repoUrl || input.repositoryUrl || input.sourceReference || input.siteId || 'builder';

    const session = {
      deploymentSessionId,
      deploymentId,
      userId: context.userId,
      projectId: input.projectId || input.siteId || null,
      status: 'started',
      animationState: 'deploying',
      createdAt: now,
      updatedAt: now,
    };

    if (context.requireRender && !(input.repoUrl || input.repositoryUrl || input.sourceReference || input.renderServiceId || input.serviceId)) {
      const error = new Error('A GitHub repo URL or existing Render service ID is required to deploy to Render.');
      error.status = 400;
      error.expose = true;
      throw error;
    }

    let renderServiceId = input.renderServiceId || input.serviceId || null;
    let serviceResponse = null;
    if (!renderServiceId) {
      serviceResponse = await renderApiService.createService({ ...input, serviceName, serviceType, sourceReference });
      renderServiceId = serviceResponse?.service?.id || serviceResponse?.id || null;
    }
    if (!renderServiceId) throw providerError('Render did not return a service ID.', serviceResponse, 'render_service_create');

    let deployResponse = null;
    if (renderServiceId) {
      deployResponse = await renderApiService.triggerDeploy(renderServiceId, input);
    } else if (process.env.RENDER_SERVICE_ID && input.useDefaultService) {
      renderServiceId = process.env.RENDER_SERVICE_ID;
      deployResponse = await renderApiService.triggerDeploy(renderServiceId, input);
    }

    const renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || serviceResponse?.deployId || serviceResponse?.deploy?.id || null;
    if (!renderDeployId && !renderServiceId) throw providerError('Render did not return a service or deploy ID.', { serviceResponse, deployResponse }, 'render_deploy_trigger');
    const liveUrl = input.liveUrl || serviceResponse?.service?.serviceDetails?.url || serviceResponse?.service?.url || serviceResponse?.url || null;
    const deployment = {
      deploymentId,
      id: deploymentId,
      userId: context.userId,
      siteId: input.siteId || null,
      projectId: input.projectId || input.siteId || null,
      renderServiceId,
      renderDeployId,
      deploymentSessionId,
      serviceName,
      serviceType,
      provider: 'render',
      providerStatus: deployResponse?.deploy?.status || deployResponse?.status || serviceResponse?.service?.suspended || serviceResponse?.status || 'accepted',
      status: renderDeployId ? 'building' : 'preparing',
      buildStatus: renderDeployId ? 'queued' : 'accepted',
      currentStep: renderDeployId ? 'Queued' : 'Sending to Render',
      liveUrl,
      verifiedUrl: null,
      urlReachable: false,
      errorMessage: null,
      repoUrl: input.repoUrl || input.repositoryUrl || null,
      githubRepo: input.githubRepo || input.repo || input.repository || input.repoUrl || input.repositoryUrl || null,
      githubBranch: input.branch || input.productionBranch || 'main',
      sourceReference,
      environmentVariablesMetadata: [],
      diskMetadata: [],
      domainMetadata: [],
      deploymentLogsReference: deploymentId,
      render: { serviceResponse, deployResponse },
      createdAt: now,
      updatedAt: now,
      lastDeployedAt: null,
      environmentConfiguration: {
        branch: input.branch || input.productionBranch || 'main',
        rootDirectory: input.rootDirectory || '',
        buildCommand: input.buildCommand || null,
        startCommand: input.startCommand || null,
        outputDirectory: input.outputDirectory || null,
      },
    };

    await mutateHostingStore((store) => {
      store.sessions.unshift(session);
      store.deployments.unshift(deployment);
      store.logs[deploymentId] = [
        makeLog('Deployment session created.', 'info'),
        makeLog(`Render service ${renderServiceId} selected.`, 'ok'),
        makeLog(renderDeployId ? `Render deploy ${renderDeployId} started.` : 'Render service created; waiting for Render to report the first deploy.', renderDeployId ? 'ok' : 'info'),
      ];
      return deployment;
    });

    return deployment;
  }

  async getDeployment(deploymentId) {
    const store = await readHostingStore();
    const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.id === deploymentId);
    if (!deployment) throw notFound('Deployment not found.');
    return deployment;
  }

  async getStatus(deploymentId) {
    const deployment = await this.getDeployment(deploymentId);
    const refreshed = await deploymentStatusService.refreshDeployment(deployment);
    return {
      deploymentId: refreshed.deploymentId,
      deploymentSessionId: refreshed.deploymentSessionId,
      status: refreshed.status,
      buildStatus: refreshed.buildStatus,
      liveUrl: refreshed.liveUrl,
      renderServiceId: refreshed.renderServiceId,
      renderDeployId: refreshed.renderDeployId,
      currentStep: refreshed.currentStep,
      verifiedUrl: refreshed.verifiedUrl,
      urlReachable: refreshed.urlReachable,
      errorMessage: refreshed.errorMessage,
      updatedAt: refreshed.updatedAt,
    };
  }

  async verifyUrl(deploymentId) {
    const deployment = await this.getDeployment(deploymentId);
    const liveUrl = deployment.liveUrl || await this.resolveLiveUrl(deployment);
    const verification = await deploymentStatusService.verifyLiveUrl(liveUrl);
    return mutateHostingStore((store) => {
      const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
      if (!stored) return deployment;
      stored.liveUrl = liveUrl || stored.liveUrl;
      stored.verifiedUrl = verification.ok ? liveUrl : stored.verifiedUrl;
      stored.urlReachable = Boolean(verification.ok);
      stored.status = verification.ok ? 'live' : (stored.status === 'live' ? 'deployed' : stored.status);
      stored.currentStep = verification.ok ? 'Live' : 'Verifying URL';
      stored.errorMessage = verification.ok ? null : (verification.error || 'The hosted URL is not reachable yet. It may still be warming up.');
      stored.updatedAt = nowIso();
      store.logs[stored.deploymentId] = [
        makeLog(verification.ok ? `Verified live URL ${liveUrl}.` : `URL verification is still warming up for ${liveUrl || 'the hosted app'}.`, verification.ok ? 'ok' : 'warn'),
        ...(store.logs[stored.deploymentId] || []),
      ];
      return stored;
    });
  }

  async redeploy(deploymentId, input = {}) {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment.renderServiceId) {
      const error = new Error('This deployment does not have a Render service ID yet.');
      error.status = 409;
      throw error;
    }
    const deployResponse = await renderApiService.triggerDeploy(deployment.renderServiceId, input);
    const renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || deployment.renderDeployId;
    if (!renderDeployId) throw providerError('Render did not return a deploy ID for the redeploy request.', deployResponse);
    return mutateHostingStore((store) => {
      const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
      Object.assign(stored, {
        renderDeployId,
        providerStatus: deployResponse?.deploy?.status || deployResponse?.status || 'created',
        status: 'building',
        buildStatus: 'queued',
        currentStep: 'Queued',
        errorMessage: null,
        updatedAt: nowIso(),
      });
      store.logs[deployment.deploymentId] = [
        makeLog(`Redeploy requested for ${deployment.serviceName}.`, 'info'),
        ...(store.logs[deployment.deploymentId] || []),
      ];
      return stored;
    });
  }

  async getLogs(deploymentId) {
    const store = await readHostingStore();
    return store.logs[deploymentId] || [];
  }

  async resolveLiveUrl(deployment) {
    if (deployment.liveUrl) return deployment.liveUrl;
    if (!deployment.renderServiceId || !renderApiService.configured()) return null;
    const service = await renderApiService.getService(deployment.renderServiceId);
    return service?.service?.serviceDetails?.url || service?.serviceDetails?.url || service?.url || null;
  }
}

function makeLog(message, level = 'info') {
  return { id: makeId('log'), level, message, timestamp: nowIso(), createdAt: nowIso() };
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function providerError(message, details, stage = 'render_service_create') {
  const error = new Error(message);
  error.status = 502;
  error.expose = true;
  error.details = details;
  error.stage = stage;
  return error;
}

export default new DeploymentService();
