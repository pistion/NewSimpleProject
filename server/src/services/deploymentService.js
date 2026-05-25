import renderApiService from './renderApiService.js';
import deploymentStatusService from './deploymentStatusService.js';
import { makeId, mutateHostingStore, nowIso, readHostingStore } from './hostingStore.js';

class DeploymentService {
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

    let renderServiceId = input.renderServiceId || input.serviceId || null;
    let serviceResponse = null;
    if (!renderServiceId) {
      serviceResponse = await renderApiService.createService({ ...input, serviceName, serviceType, sourceReference });
      renderServiceId = serviceResponse?.service?.id || serviceResponse?.id || null;
    }
    const renderConfigurationRequired = serviceResponse?.status === 'configuration_required';
    if (!renderServiceId && renderConfigurationRequired) {
      renderServiceId = makeId('render_pending');
    }

    let deployResponse = null;
    if (renderServiceId && !renderConfigurationRequired) {
      deployResponse = await renderApiService.triggerDeploy(renderServiceId, input);
    } else if (process.env.RENDER_SERVICE_ID && input.useDefaultService) {
      renderServiceId = process.env.RENDER_SERVICE_ID;
      deployResponse = await renderApiService.triggerDeploy(renderServiceId, input);
    }

    const renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || null;
    const liveUrl = input.liveUrl || serviceResponse?.service?.serviceDetails?.url || serviceResponse?.service?.url || serviceResponse?.url || null;
    const deployment = {
      deploymentId,
      id: deploymentId,
      userId: context.userId,
      projectId: input.projectId || input.siteId || null,
      renderServiceId,
      renderDeployId,
      deploymentSessionId,
      serviceName,
      serviceType,
      status: renderDeployId ? 'building' : 'configuration_required',
      buildStatus: renderDeployId ? 'queued' : 'waiting_for_render_credentials',
      liveUrl,
      repoUrl: input.repoUrl || input.repositoryUrl || null,
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
        makeLog(renderServiceId ? `Render service ${renderServiceId} selected.` : 'Render service creation is waiting for credentials.', renderServiceId ? 'ok' : 'warn'),
        makeLog(renderDeployId ? `Render deploy ${renderDeployId} started.` : 'Deploy will start after Render configuration is complete.', renderDeployId ? 'ok' : 'warn'),
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
      updatedAt: refreshed.updatedAt,
    };
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
    return mutateHostingStore((store) => {
      const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
      Object.assign(stored, {
        renderDeployId,
        status: 'building',
        buildStatus: 'queued',
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
}

function makeLog(message, level = 'info') {
  return { id: makeId('log'), level, message, timestamp: nowIso(), createdAt: nowIso() };
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

export default new DeploymentService();
