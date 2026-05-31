/**
 * zipToRender.pipeline.js
 *
 * Full ZIP → GitHub → Render pipeline.
 * Chains all six mountains in order.
 *
 * STATUS: STUB — not yet migrated.
 * Currently proxies to the existing service files.
 * Each phase of the migration will replace one import with a real stage.
 */

// ── Temporary proxy to existing services ────────────────────────────────────
// These imports will be replaced one-by-one as each mountain is migrated.
import zipDeploymentService from '../../../services/zipDeploymentService.js';
import { deployZipSite } from '../../../services/zipSiteDeployment.service.js';

/**
 * Run the full ZIP → Render pipeline.
 * Called from hostingDeploy.controller.js via the /api/deployments/zip route.
 *
 * @param {object} input  { file, fields, userId }
 * @param {object} context  Optional pre-built deployment context
 */
export async function run(input, context = {}) {
  // TODO (Phase 5): replace with stage-by-stage pipeline
  return zipDeploymentService.create(input, context);
}

/**
 * Run from a base64-encoded ZIP (used by the template-ai route).
 * Called from the /api/template-ai/zip/deploy adapter.
 */
export async function runFromBase64(input) {
  // TODO (Phase 5): replace with stage-by-stage pipeline
  return deployZipSite(input);
}
