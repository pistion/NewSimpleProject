/**
 * templateAiZipRoute.adapter.js
 *
 * The /api/template-ai/zip/deploy endpoint currently lives inside
 * template-ai.routes.js. This adapter will eventually replace that
 * inline handler with a call to zipToRender.pipeline.js.
 *
 * STATUS: Stub — placeholder for Phase 5 migration.
 */

import { runFromBase64 } from '../pipelines/zipToRender.pipeline.js';

/**
 * Drop-in handler for the /api/template-ai/zip/deploy route.
 * Replaces the inline deployZipSite() call in template-ai.routes.js.
 */
export async function handleZipDeploy(req, res) {
  // TODO (Phase 5): wire this in and remove inline handler from template-ai.routes.js
  const safeJson = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const result = await runFromBase64({
    fileName:                   req.file.originalname,
    fileBase64:                 req.file.buffer.toString('base64'),
    userId:                     req.user?.id || req.headers['x-user-id'] || 'local-user',
    siteName:                   req.body?.siteName,
    slug:                       req.body?.slug,
    serviceType:                req.body?.serviceType,
    plan:                       req.body?.plan,
    region:                     req.body?.region,
    environment:                req.body?.environment,
    buildCommand:               req.body?.buildCommand,
    publishDirectory:           req.body?.publishDirectory,
    startCommand:               req.body?.startCommand,
    runtime:                    req.body?.runtime,
    healthCheckPath:            req.body?.healthCheckPath,
    pullRequestPreviewsEnabled: req.body?.pullRequestPreviewsEnabled,
    repoUrl:                    req.body?.repoUrl,
    repositoryUrl:              req.body?.repositoryUrl,
    branch:                     req.body?.branch,
    rootDirectory:              req.body?.rootDirectory,
    envVars:                    safeJson(req.body?.envVars),
    disk:                       safeJson(req.body?.disk),
  });
  res.json(result);
}
