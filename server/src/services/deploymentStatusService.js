import renderApiService from './renderApiService.js';
import { mutateHostingStore, nowIso } from './hostingStore.js';

const BUILDING_STATUSES = new Set(['created', 'queued', 'build_in_progress', 'update_in_progress', 'pre_deploy_in_progress']);
const SUCCESS_STATUSES = new Set(['live', 'deployed', 'succeeded']);
const FAILED_STATUSES = new Set(['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'failed']);

// Placeholder IDs generated when Render handoff was skipped.
// These must NEVER be sent to the Render API.
function isPendingPlaceholder(id) {
  return !id || String(id).includes('_pending');
}

class DeploymentStatusService {
  normalizeStatus(renderStatus) {
    const status = String(renderStatus || '').toLowerCase();
    if (SUCCESS_STATUSES.has(status)) return { status: 'live', buildStatus: 'succeeded', currentStep: 'Verifying URL' };
    if (FAILED_STATUSES.has(status)) return { status: 'failed', buildStatus: 'failed', currentStep: 'Failed' };
    if (BUILDING_STATUSES.has(status)) return { status: 'building', buildStatus: status || 'building', currentStep: 'Building' };
    return { status: status || 'queued', buildStatus: status || 'queued', currentStep: status === 'queued' ? 'Queued' : 'Sending to Render' };
  }

  async refreshDeployment(deployment) {
    if (deployment?.status === 'deleted') return deployment;
    if (deployment?.status === 'suspended') return deployment;
    if (!deployment?.renderServiceId || isPendingPlaceholder(deployment.renderServiceId)) {
      // No real Render service — return current state without marking as "failed".
      // ZIP uploads that skip Render handoff stay in "prepared" status.
      const isZipPrepared = deployment?.source === 'zip-upload' || deployment?.generatedSite;
      return mutateHostingStore((store) => {
        const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
        if (!stored) return deployment;
        // Only overwrite status if it's not already in a meaningful state
        if (!['prepared', 'building', 'live', 'failed', 'deleted', 'suspended', 'deployed_unverified'].includes(stored.status)) {
          Object.assign(stored, {
            status: isZipPrepared ? 'prepared' : 'failed',
            buildStatus: isZipPrepared ? 'uploaded' : 'not_started',
            currentStep: isZipPrepared ? 'Render handoff pending' : 'Render deployment not started',
            errorMessage: stored.errorMessage || (isZipPrepared
              ? stored.render?.skippedReason || 'Render handoff pending — check Hosting logs for configuration status.'
              : 'Render deployment has not started. A real Render service ID is required.'),
            updatedAt: nowIso(),
          });
        }
        return stored;
      });
    }
    let deploy = null;
    try {
      if (deployment.renderDeployId && !isPendingPlaceholder(deployment.renderDeployId)) {
        const renderDeploy = await renderApiService.getDeploy(deployment.renderServiceId, deployment.renderDeployId);
        deploy = renderDeploy.deploy || renderDeploy;
      } else {
        const deploysResponse = await renderApiService.listDeploys(deployment.renderServiceId, 1);
        const deployRows = Array.isArray(deploysResponse) ? deploysResponse : deploysResponse?.deploys || [];
        const row = deployRows[0] || null;
        deploy = row?.deploy || row;
      }
    } catch (error) {
      if (isRenderGone(error)) {
        return this.markDeleted(deployment, error);
      }
      return mutateHostingStore((store) => {
        const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
        if (!stored) return deployment;
        Object.assign(stored, {
          status: 'failed',
          buildStatus: 'failed',
          currentStep: 'Failed',
          errorMessage: error.message || 'Render status check failed.',
          updatedAt: nowIso(),
        });
        store.logs[stored.deploymentId] = [
          makeLog(`Render status check failed: ${stored.errorMessage}`, 'error'),
          ...(store.logs[stored.deploymentId] || []),
        ];
        return stored;
      });
    }
    if (!deploy?.id) return deployment;
    const next = this.normalizeStatus(deploy.status);
    let liveUrl = deployment.liveUrl;
    let verification = null;
    if (next.status === 'live') {
      const renderService = await renderApiService.getService(deployment.renderServiceId).catch(() => null);
      liveUrl = extractServiceUrl(renderService) || liveUrl;
      verification = await this.verifyLiveUrl(liveUrl);
      if (!verification.ok) {
        next.status = 'deployed_unverified';
        next.currentStep = 'Verifying URL';
      }
    }
    return mutateHostingStore((store) => {
      const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
      if (!stored) return deployment;
      Object.assign(stored, next, {
        renderDeployId: stored.renderDeployId || deploy.id,
        providerStatus: deploy.status || stored.providerStatus,
        renderDeployStatus: deploy.status || stored.renderDeployStatus,
        liveUrl: liveUrl || stored.liveUrl,
        verifiedUrl: verification?.ok ? liveUrl : stored.verifiedUrl,
        urlReachable: verification ? Boolean(verification.ok) : stored.urlReachable,
        errorMessage: verification && !verification.ok ? 'The Render URL exists but is still warming up.' : stored.errorMessage,
        updatedAt: nowIso(),
        lastDeployedAt: next.status === 'live' ? nowIso() : stored.lastDeployedAt,
      });
      return stored;
    });
  }

  async markDeleted(deployment, error) {
    return mutateHostingStore((store) => {
      const stored = store.deployments.find((item) => item.deploymentId === deployment.deploymentId);
      if (!stored) return deployment;
      Object.assign(stored, {
        status: 'deleted',
        buildStatus: 'deleted',
        currentStep: 'Deleted',
        deletedAt: stored.deletedAt || nowIso(),
        errorMessage: null,
        updatedAt: nowIso(),
        renderDeleteResponse: {
          status: 'deleted_on_render',
          providerStatus: error.status,
          message: error.message,
        },
      });
      store.logs[stored.deploymentId] = [
        makeLog('Render reports this service has been deleted. The hosting app was removed from the active panel.', 'info'),
        ...(store.logs[stored.deploymentId] || []),
      ];
      return stored;
    });
  }

  async verifyLiveUrl(url) {
    if (!url) return { ok: false, status: 'missing_url' };
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      return { ok: response.ok, statusCode: response.status, checkedAt: nowIso() };
    } catch (error) {
      return { ok: false, error: error.message, checkedAt: nowIso() };
    }
  }

  statusLabel(status) {
    return {
      preparing: 'Preparing',
      configuration_required: 'Preparing',
      queued: 'Queued',
      building: 'Building',
      deploying: 'Deploying',
      deployed: 'Verifying URL',
      deployed_unverified: 'Deployed - Warming Up',
      live: 'Live',
      failed: 'Failed',
      suspended: 'Suspended',
      deleted: 'Deleted',
    }[status] || 'Preparing';
  }
}

function makeLog(message, level = 'info') {
  return { id: `log_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`, level, message, timestamp: nowIso(), createdAt: nowIso() };
}

function extractServiceUrl(response) {
  const service = response?.service || response;
  return service?.serviceDetails?.url || service?.url || null;
}

function isRenderGone(error) {
  return error?.status === 404 || error?.status === 410;
}

export default new DeploymentStatusService();
