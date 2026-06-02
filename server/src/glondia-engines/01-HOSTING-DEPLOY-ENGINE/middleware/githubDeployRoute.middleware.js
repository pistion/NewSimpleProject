/**
 * githubDeployRoute.middleware.js — staged GitHub deploy steps.
 *
 * validateGithubRequest → confirm a real GitHub repo URL is present + normalize.
 * runGithubDeployPipeline → run the EXISTING import→controlled-repo→Render
 *                           pipeline, store the result. No billing here.
 */
import { run as runGithubLinkToRender } from '../pipelines/githubLinkToRender.pipeline.js';
import { appendDeployStep, deployContext } from './deployFlowState.middleware.js';

const GITHUB_URL_RE = /github\.com[:/][^/\s]+\/[^/\s#?]+/i;

/** Validate + normalize the client GitHub repository URL. */
export function validateGithubRequest(req, res, next) {
  const raw = req.body?.repoUrl || req.body?.repositoryUrl || req.body?.githubUrl;
  if (!raw || !String(raw).trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'GITHUB_REPO_URL_REQUIRED', message: 'A GitHub repository URL is required.' },
      requestId: req.id,
    });
  }
  const repoUrl = String(raw).trim();
  if (!GITHUB_URL_RE.test(repoUrl)) {
    return res.status(400).json({
      success: false,
      error: { code: 'GITHUB_REPO_URL_INVALID', message: 'That does not look like a GitHub repository URL.' },
      requestId: req.id,
    });
  }
  req.body = req.body || {};
  req.body.repoUrl = repoUrl;
  appendDeployStep(req, { name: 'github_input', status: 'ok', message: 'Repository URL accepted.' });
  next();
}

/** Run the existing GitHub import→controlled-repo→Render pipeline. */
export async function runGithubDeployPipeline(req, res, next) {
  try {
    const deployment = await runGithubLinkToRender(req.body || {}, deployContext(req));
    req.deployFlow.deployment = deployment;
    const status = deployment?.status;
    if (status === 'building' || status === 'queued') {
      appendDeployStep(req, { name: 'render_queued', status: 'ok', message: `Deploy queued in Render (${deployment.renderServiceId}).` });
    } else if (status === 'ready' || deployment?.buildStatus === 'configuration_required') {
      appendDeployStep(req, { name: 'configuration_required', status: 'warn', message: deployment?.errorMessage || 'Prepared but not handed off to Render — configuration required.' });
    } else if (status === 'failed') {
      appendDeployStep(req, { name: 'failed', status: 'error', message: deployment?.errorMessage || 'Deployment failed.' });
    } else {
      appendDeployStep(req, { name: 'pipeline_complete', status: 'ok', message: `Status: ${status || 'unknown'}.` });
    }
    next();
  } catch (error) {
    if (!error.stage) error.stage = 'github_repo_validate';
    next(error);
  }
}

export default { validateGithubRequest, runGithubDeployPipeline };
