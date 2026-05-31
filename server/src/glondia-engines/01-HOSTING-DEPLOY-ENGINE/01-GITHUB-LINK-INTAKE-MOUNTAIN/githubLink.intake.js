/**
 * githubLink.intake.js
 *
 * Normalizes a direct GitHub repository link for Render handoff.
 * This path is intentionally separate from ZIP -> GitHub -> Render.
 */

export function normalizeGithubLinkInput(input = {}, context = {}) {
  const repoUrl = String(input.repoUrl || input.repositoryUrl || input.sourceRepository || input.sourceReference || '').trim();
  if (!repoUrl) throw requestError('repoUrl is required.', 400, 'github_repo_validate');
  const parsedRepo = parseGithubRepoUrl(repoUrl);
  if (!parsedRepo) throw requestError('A valid GitHub repository URL is required.', 400, 'github_repo_validate');

  const branch = String(input.branch || input.githubBranch || 'main').trim() || 'main';
  const siteName = input.serviceName || input.name || input.siteName || parsedRepo.repo || 'glondia-github-site';

  return {
    input,
    context,
    userId: context.userId || input.userId || null,
    siteId: input.siteId || null,
    projectId: input.projectId || input.siteId || null,
    repoUrl,
    parsedRepo,
    branch,
    siteName,
    sourceReference: repoUrl,
  };
}

export function parseGithubRepoUrl(url = '') {
  const match = String(url || '').trim().match(/github\.com[:/]([^/]+)\/([^/.#?]+)(?:\.git)?(?:[/?#].*)?$/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, ''),
    fullName: `${match[1]}/${match[2].replace(/\.git$/i, '')}`,
  };
}

function requestError(message, status, stage) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  error.expose = true;
  return error;
}
