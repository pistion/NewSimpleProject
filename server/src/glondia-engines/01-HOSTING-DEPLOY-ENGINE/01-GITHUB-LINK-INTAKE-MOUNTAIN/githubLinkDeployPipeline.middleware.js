/**
 * githubLinkDeployPipeline.middleware.js - GitHub link pipeline handoff.
 */
import { run as runGithubLinkDeploy } from '../pipelines/githubLinkDeploy.pipeline.js';
import { appendDeployStep, deployContext } from '../00-SHARED/deployFlowState.middleware.js';

export async function runGithubLinkDeployPipeline(req, res, next) {
  try {
    const deployment = await runGithubLinkDeploy(req.body || {}, deployContext(req));
    req.deployFlow.deployment = deployment;
    recordOutcomeStep(req, deployment);
    next();
  } catch (error) {
    if (!error.stage) error.stage = 'github_repo_validate';
    next(error);
  }
}

function recordOutcomeStep(req, deployment) {
  const status = deployment?.status;
  if (status === 'building' || status === 'queued') {
    appendDeployStep(req, { name: 'render_queued', status: 'ok', message: `Deploy queued in Render (${deployment.renderServiceId}).` });
  } else if (status === 'ready' || deployment?.buildStatus === 'configuration_required') {
    appendDeployStep(req, { name: 'configuration_required', status: 'warn', message: deployment?.errorMessage || 'Prepared but not handed off to Render - configuration required.' });
  } else if (status === 'failed') {
    appendDeployStep(req, { name: 'failed', status: 'error', message: deployment?.errorMessage || 'Deployment failed.' });
  } else {
    appendDeployStep(req, { name: 'pipeline_complete', status: 'ok', message: `Status: ${status || 'unknown'}.` });
  }
}

export default { runGithubLinkDeployPipeline };
