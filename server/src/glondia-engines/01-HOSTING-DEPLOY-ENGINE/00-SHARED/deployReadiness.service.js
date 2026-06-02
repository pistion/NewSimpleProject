/**
 * deployReadiness.service.js - engine-local deployment readiness/config.
 */
import renderApiService from '../../../services/renderApiService.js';
import { resolveGitHubPublisherToken } from '../03-GITHUB-SOURCE-MOUNTAIN/generatedSitesRepoPublisher.stage.js';

export { checkDeployReadiness } from '../../../services/deployReadinessService.js';

export function getZipDeployConfigStatus() {
  const renderApiConfigured = renderApiService.configured();
  const sourceRepo = (process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || '').trim();
  const renderSourceRepoConfigured = Boolean(sourceRepo);
  const { token: ghToken, error: ghTokenError } = resolveGitHubPublisherToken();
  const githubPublisherConfigured = Boolean(ghToken && !ghTokenError);

  const missing = [];
  if (!renderApiConfigured) missing.push('RENDER_API_KEY and/or RENDER_OWNER_ID');
  if (!renderSourceRepoConfigured) missing.push('RENDER_GENERATED_SITES_REPO_URL');
  if (!githubPublisherConfigured) missing.push('GITHUB_GENERATED_SITES_TOKEN');

  return {
    provider: 'render',
    renderApiConfigured,
    renderSourceRepoConfigured,
    githubPublisherConfigured,
    githubTokenError: ghTokenError || null,
    missing,
    expectedEnv: [
      'RENDER_API_KEY',
      'RENDER_OWNER_ID',
      'RENDER_GENERATED_SITES_REPO_URL',
      'GITHUB_GENERATED_SITES_TOKEN',
    ],
  };
}
