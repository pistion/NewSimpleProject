/**
 * github-link/githubLinkDeployRoute.middleware.js
 *
 * GitHub LINK deploy steps — fully separate from ZIP. No multer, no ZIP
 * handling. Validates + normalizes a GitHub repo URL, runs the existing
 * import→controlled-repo→Render pipeline, and offers a validate-only check.
 */
import { run as runGithubLinkToRender } from '../../pipelines/githubLinkToRender.pipeline.js';
import { parseGithubRepoUrl } from '../../01-GITHUB-LINK-INTAKE-MOUNTAIN/githubLink.intake.js';
import { appendDeployStep, deployContext } from '../shared/deployFlowState.middleware.js';

function pickRepoUrl(body = {}) {
  return body.repoUrl || body.repositoryUrl || body.githubUrl;
}

/** Validate + normalize the client repo URL; stash owner/repo/branch on req. */
export function validateGithubLinkRequest(req, res, next) {
  const raw = pickRepoUrl(req.body || {});
  if (!raw || !String(raw).trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'GITHUB_REPO_URL_REQUIRED', message: 'A GitHub repository URL is required.' },
      requestId: req.id,
    });
  }
  const cleaned = String(raw).trim().replace(/\.git$/i, '');
  const parsed = parseGithubRepoUrl(cleaned);
  if (!parsed?.owner || !parsed?.repo) {
    return res.status(400).json({
      success: false,
      error: { code: 'GITHUB_REPO_URL_INVALID', message: 'That does not look like a GitHub repository URL (expected github.com/owner/repo).' },
      requestId: req.id,
    });
  }
  const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;
  const branch = (req.body?.branch && String(req.body.branch).trim()) || 'main';

  req.body = req.body || {};
  req.body.repoUrl = repoUrl;
  // Available both with and without a deploy flow (validate route has no flow).
  req.githubLink = { repoUrl, owner: parsed.owner, repo: parsed.repo, branch };
  if (req.deployFlow) req.deployFlow.githubLink = req.githubLink;
  appendDeployStep(req, { name: 'github_link_input', status: 'ok', message: `${parsed.owner}/${parsed.repo}@${branch}` });
  next();
}

/** Run the existing GitHub import→controlled-repo→Render pipeline (no billing). */
export async function runGithubLinkDeployPipeline(req, res, next) {
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

/** Validate-only handler — no import, no record, no billing. */
export function validateGithubLinkOnly(req, res) {
  const gl = req.githubLink || {};
  res.status(200).json({
    data: {
      repoUrl: gl.repoUrl || null,
      owner: gl.owner || null,
      repo: gl.repo || null,
      branch: gl.branch || 'main',
      valid: true,
    },
    requestId: req.id,
  });
}

export default { validateGithubLinkRequest, runGithubLinkDeployPipeline, validateGithubLinkOnly };
