/**
 * githubLinkToRender.pipeline.js
 *
 * BACKWARD-COMPAT SHIM.
 *
 * The GitHub-link deploy path no longer deploys the client repo directly to
 * Render. It now routes through the controlled-source pipeline:
 *
 *   client repo → Glondiasites-controlled repo → Render
 *
 * This file keeps its name/exports so existing callers and the
 * POST /api/deployments/github route continue to work, but all behavior is
 * delegated to githubImportToRender.pipeline.js.
 *
 * See: pipelines/githubImportToRender.pipeline.js
 */

import { run as runGithubImportToRender } from './githubImportToRender.pipeline.js';

export async function run(input = {}, context = {}) {
  return runGithubImportToRender(input, context);
}

class GithubDeploymentPipelineService {
  async create(input = {}, context = {}) {
    return run(input, context);
  }
}

export default new GithubDeploymentPipelineService();
