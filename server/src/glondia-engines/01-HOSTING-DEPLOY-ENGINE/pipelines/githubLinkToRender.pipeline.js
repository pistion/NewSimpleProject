/**
 * githubLinkToRender.pipeline.js
 *
 * GitHub repo URL -> Render pipeline.
 */

import renderApiService from '../../../services/renderApiService.js';
import { normalizeGithubLinkInput } from '../01-GITHUB-LINK-INTAKE-MOUNTAIN/githubLink.intake.js';
import { buildGithubRenderSource } from '../02-GITHUB-RENDER-SOURCE-MOUNTAIN/githubRenderSource.stage.js';
import {
  addGithubLinkDeploymentLog,
  createGithubLinkDeploymentRecord,
  updateGithubLinkDeployment,
} from '../03-GITHUB-LINK-RECORD-MOUNTAIN/githubLinkDeploymentRecord.stage.js';
import { buildRenderPayload } from '../04-RENDER-PAYLOAD-MOUNTAIN/renderPayloadBuilder.stage.js';
import { createAndTriggerRenderDeploy } from '../05-RENDER-DEPLOY-MOUNTAIN/renderDeploy.stage.js';

export async function run(input = {}, context = {}) {
  const normalized = normalizeGithubLinkInput(input, context);
  const source = buildGithubRenderSource(normalized);

  const payload = buildRenderPayload({
    ...input,
    serviceName: input.serviceName || input.name || normalized.siteName,
    repoUrl: source.repoUrl,
    repositoryUrl: source.repositoryUrl,
    sourceReference: source.sourceReference,
    branch: source.branch,
  });

  const deployment = await createGithubLinkDeploymentRecord({ normalized, source, payload });

  await addGithubLinkDeploymentLog(deployment.deploymentId, `Creating Render service from GitHub source: ${source.fullName}.`, 'info', {
    repoUrl: source.repoUrl,
    branch: source.branch,
  });

  try {
    if (!renderApiService.configured()) {
      const settings = renderApiService.settings();
      return updateGithubLinkDeployment(deployment.deploymentId, {
        status: 'ready',
        buildStatus: 'configuration_required',
        currentStep: 'Ready - missing Render credentials',
        errorMessage: `Configure ${settings.required.join(', ')} to deploy this GitHub repo to Render.`,
        errorDetails: settings,
      });
    }

    const renderResult = await createAndTriggerRenderDeploy(payload);
    await addGithubLinkDeploymentLog(deployment.deploymentId, `Render deploy ${renderResult.deployId} started.`, 'ok', {
      renderServiceId: renderResult.serviceId,
    });
    return updateGithubLinkDeployment(deployment.deploymentId, {
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
    await addGithubLinkDeploymentLog(deployment.deploymentId, error.message || 'GitHub deployment failed.', 'error', error.details || null);
    return updateGithubLinkDeployment(deployment.deploymentId, {
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

function stageToStep(stage) {
  return {
    github_repo_validate: 'GitHub repo validation failed',
    render_service_create: 'Render service creation failed',
    render_deploy_trigger: 'Render deploy trigger failed',
  }[stage] || 'Failed';
}

export default new GithubDeploymentPipelineService();
