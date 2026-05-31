/**
 * githubRenderSource.stage.js
 *
 * Builds the Render source shape for a direct GitHub link deployment.
 */

export function buildGithubRenderSource(normalized) {
  return {
    sourceType: 'github-link',
    repoUrl: normalized.repoUrl,
    repositoryUrl: normalized.repoUrl,
    sourceReference: normalized.sourceReference || normalized.repoUrl,
    branch: normalized.branch,
    owner: normalized.parsedRepo.owner,
    repo: normalized.parsedRepo.repo,
    fullName: normalized.parsedRepo.fullName,
  };
}

export async function runStage(context = {}) {
  context.source = buildGithubRenderSource(context.githubLink);
  return context;
}
