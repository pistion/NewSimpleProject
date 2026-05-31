/**
 * githubLinkToRender.pipeline.js
 *
 * GitHub repo URL → Render pipeline.
 * Skips ZIP intake/extract mountains — straight to GitHub source → Render.
 *
 * STATUS: STUB — not yet migrated.
 * Currently proxies to the existing service files.
 */

import githubDeploymentService from '../../../services/githubDeploymentService.js';

/**
 * Run the GitHub repo → Render pipeline.
 * Called from hostingDeploy.controller.js via /api/deployments/github.
 *
 * @param {object} input  { repoUrl, branch, serviceName, serviceType, ... }
 * @param {object} context  Optional context with userId etc.
 */
export async function run(input, context = {}) {
  // TODO (Phase 5): replace with stage-by-stage pipeline
  return githubDeploymentService.create(input, context);
}
