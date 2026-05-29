import renderApiService from './renderApiService.js';
import { mutateHostingStore, nowIso, readHostingStore } from './hostingStore.js';

class HostingService {
  async listHosting(userId) {
    const store = await this.syncRenderStates(await readHostingStore());
    return store.deployments
      .filter((item) => !userId || item.userId === userId)
      .filter((item) => item.status !== 'deleted')
      .map((item) => this.toHostingSummary(item));
  }

  async getService(deploymentId) {
    const store = await readHostingStore();
    const deployment = store.deployments.find((item) => item.renderServiceId === deploymentId || item.deploymentId === deploymentId);
    if (!deployment) throw notFound('Hosting service not found.');
    let renderService = null;
    // Only call Render API for real service IDs — skip placeholders (render_svc_pending_*)
    const hasRealRenderService = deployment.renderServiceId
      && !String(deployment.renderServiceId).includes('_pending')
      && renderApiService.configured();
    if (hasRealRenderService) {
      try {
        renderService = await renderApiService.getService(deployment.renderServiceId);
      } catch (error) {
        if (isRenderGone(error)) {
          const synced = await this.markDeleted(deployment, error);
          return { ...synced, renderService: null };
        }
        throw error;
      }
    }
    return { ...deployment, renderService };
  }

  async updateSettings(deploymentId, settings = {}) {
    const current = await this.getService(deploymentId);
    if (!current.renderServiceId) throw conflict('Render deployment has not started. A real Render service ID is required.');
    const renderSettings = await renderApiService.updateService(current.renderServiceId, settings.render || settings);
    return mutateHostingStore((store) => {
      const deployment = store.deployments.find((item) => item.deploymentId === current.deploymentId);
      deployment.environmentConfiguration = {
        ...deployment.environmentConfiguration,
        ...settings,
      };
      deployment.renderSettings = renderSettings;
      deployment.updatedAt = nowIso();
      return deployment;
    });
  }

  async suspend(deploymentId) {
    const current = await this.getService(deploymentId);
    if (!current.renderServiceId) throw conflict('Render deployment has not started. A real Render service ID is required.');
    if (current.status === 'deleted') throw conflict('This Render service has already been deleted.');
    if (current.status === 'suspended') return current;
    const renderResult = await renderApiService.suspendService(current.renderServiceId);
    return mutateHostingStore((store) => {
      const deployment = store.deployments.find((item) => item.deploymentId === current.deploymentId);
      deployment.status = 'suspended';
      deployment.currentStep = 'Suspended';
      deployment.suspendedAt = nowIso();
      deployment.updatedAt = nowIso();
      deployment.renderSuspendResponse = renderResult;
      return deployment;
    });
  }

  async delete(deploymentId) {
    const current = await this.getService(deploymentId);
    if (!current.renderServiceId) throw conflict('Render deployment has not started. A real Render service ID is required.');
    if (current.status === 'deleted') return { deleted: true, deploymentId: current.deploymentId, alreadyDeleted: true };
    let renderResult = null;
    try {
      renderResult = await renderApiService.deleteService(current.renderServiceId);
    } catch (error) {
      if (!isRenderGone(error)) throw error;
      renderResult = { status: 'already_deleted', providerStatus: error.status, message: error.message };
    }
    return mutateHostingStore((store) => {
      const deployment = store.deployments.find((item) => item.deploymentId === current.deploymentId);
      deployment.status = 'deleted';
      deployment.currentStep = 'Deleted';
      deployment.deletedAt = nowIso();
      deployment.updatedAt = nowIso();
      deployment.renderDeleteResponse = renderResult;
      return { deleted: true, deploymentId: current.deploymentId };
    });
  }

  async syncRenderStates(store) {
    if (!renderApiService.configured()) return store;
    let changed = false;
    for (const deployment of store.deployments) {
      if (!deployment.renderServiceId || deployment.status === 'deleted' || String(deployment.renderServiceId).includes('_pending')) continue;
      try {
        const renderService = await renderApiService.getService(deployment.renderServiceId);
        const service = renderService?.service || renderService;
        const suspended = service?.suspended && service.suspended !== 'not_suspended';
        if (suspended && deployment.status !== 'suspended') {
          deployment.status = 'suspended';
          deployment.currentStep = 'Suspended';
          deployment.suspendedAt = deployment.suspendedAt || nowIso();
          deployment.updatedAt = nowIso();
          changed = true;
        }
      } catch (error) {
        if (!isRenderGone(error)) continue;
        deployment.status = 'deleted';
        deployment.currentStep = 'Deleted';
        deployment.deletedAt = deployment.deletedAt || nowIso();
        deployment.updatedAt = nowIso();
        deployment.renderDeleteResponse = {
          status: 'deleted_on_render',
          providerStatus: error.status,
          message: error.message,
        };
        changed = true;
      }
    }
    if (changed) await mutateHostingStore((currentStore) => Object.assign(currentStore, store));
    return store;
  }

  async markDeleted(deployment, error) {
    return mutateHostingStore((store) => {
      const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
      if (!stored) return deployment;
      stored.status = 'deleted';
      stored.currentStep = 'Deleted';
      stored.deletedAt = stored.deletedAt || nowIso();
      stored.updatedAt = nowIso();
      stored.renderDeleteResponse = {
        status: 'deleted_on_render',
        providerStatus: error.status,
        message: error.message,
      };
      return stored;
    });
  }

  toHostingSummary(deployment) {
    return {
      serviceId: deployment.renderServiceId || deployment.deploymentId,
      deploymentId: deployment.deploymentId,
      siteId: deployment.siteId,
      projectId: deployment.projectId,
      serviceName: deployment.serviceName,
      serviceType: deployment.serviceType,
      status: deployment.status,
      buildStatus: deployment.buildStatus,
      currentStep: deployment.currentStep,
      liveUrl: deployment.liveUrl,
      verifiedUrl: deployment.verifiedUrl,
      urlReachable: deployment.urlReachable,
      errorMessage: deployment.errorMessage,
      githubRepo: deployment.githubRepo || deployment.repoUrl,
      githubBranch: deployment.githubBranch || deployment.environmentConfiguration?.branch,
      sourceReference: deployment.sourceReference,
      renderServiceId: deployment.renderServiceId,
      renderDeployId: deployment.renderDeployId,
      lastDeployedAt: deployment.lastDeployedAt,
      suspendedAt: deployment.suspendedAt,
      deletedAt: deployment.deletedAt,
      updatedAt: deployment.updatedAt,
      environmentConfiguration: deployment.environmentConfiguration,
      environmentVariablesMetadata: deployment.environmentVariablesMetadata,
      diskMetadata: deployment.diskMetadata,
      domainMetadata: deployment.domainMetadata,
    };
  }
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function isRenderGone(error) {
  return error?.status === 404 || error?.status === 410;
}

export default new HostingService();
