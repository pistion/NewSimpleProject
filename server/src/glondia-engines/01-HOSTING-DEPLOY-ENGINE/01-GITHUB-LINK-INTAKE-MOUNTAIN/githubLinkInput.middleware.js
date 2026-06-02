/**
 * githubLinkInput.middleware.js - GitHub link request validation only.
 */
import { parseGithubRepoUrl } from './githubLink.intake.js';
import { appendDeployStep } from '../00-SHARED/deployFlowState.middleware.js';

function pickRepoUrl(body = {}) {
  return body.repoUrl || body.repositoryUrl || body.githubUrl;
}

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
  req.githubLink = { repoUrl, owner: parsed.owner, repo: parsed.repo, branch };
  if (req.deployFlow) {
    req.deployFlow.githubLink = req.githubLink;
    appendDeployStep(req, { name: 'github_link_input', status: 'ok', message: `${parsed.owner}/${parsed.repo}@${branch}` });
  }
  next();
}

export default { validateGithubLinkRequest };
