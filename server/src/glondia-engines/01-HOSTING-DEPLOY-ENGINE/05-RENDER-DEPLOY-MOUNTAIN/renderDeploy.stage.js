/**
 * renderDeploy.stage.js - 05-RENDER-DEPLOY-MOUNTAIN
 *
 * Creates a Render service and triggers its first deploy.
 */

import renderApiService from '../../../services/renderApiService.js';
import { extractRenderUrl } from '../../00-SHARED/renderCommon.js';
import { upstreamError } from '../../00-SHARED/stageErrors.js';

export async function createAndTriggerRenderDeploy(payload = {}) {
  const serviceResponse = await renderApiService.createService(payload);
  const serviceId = serviceResponse?.service?.id || serviceResponse?.id || null;
  if (!serviceId) throw upstreamError('Render did not return a service ID.', 'render_service_create', 'RENDER_SERVICE_ID_MISSING', serviceResponse);

  const deployResponse = await renderApiService.triggerDeploy(serviceId, payload);
  const deployId = deployResponse?.deploy?.id || deployResponse?.id || null;
  if (!deployId) throw upstreamError('Render did not return a deploy ID.', 'render_deploy_trigger', 'RENDER_DEPLOY_ID_MISSING', deployResponse);

  return {
    serviceId,
    deployId,
    liveUrl: extractRenderUrl(serviceResponse),
    providerStatus: deployResponse?.deploy?.status || deployResponse?.status || 'created',
    serviceResponse,
    deployResponse,
  };
}

export async function runStage(context) {
  const result = await createAndTriggerRenderDeploy(context.render.payload || {});
  context.render = { ...context.render, ...result };
  return context;
}
