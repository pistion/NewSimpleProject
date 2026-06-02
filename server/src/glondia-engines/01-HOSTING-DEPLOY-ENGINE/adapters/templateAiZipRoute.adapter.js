/**
 * Compatibility adapter only. Do not use in new route flow.
 *
 * Hosting Deploy Engine handler for /api/template-ai/zip/deploy.
 */

import { runFromBase64 } from '../pipelines/zipToRender.pipeline.js';

export async function handleZipDeploy(req, res) {
  const safeJson = (raw) => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const result = await runFromBase64({
    fileName: req.file.originalname,
    fileBase64: req.file.buffer.toString('base64'),
    userId: req.user?.id || req.headers['x-user-id'] || req.headers['x-glondia-user-id'] || 'local-user',
    siteName: req.body?.siteName,
    slug: req.body?.slug,
    serviceType: req.body?.serviceType,
    plan: req.body?.plan,
    region: req.body?.region,
    environment: req.body?.environment,
    buildCommand: req.body?.buildCommand,
    publishDirectory: req.body?.publishDirectory,
    startCommand: req.body?.startCommand,
    runtime: req.body?.runtime,
    healthCheckPath: req.body?.healthCheckPath,
    pullRequestPreviewsEnabled: req.body?.pullRequestPreviewsEnabled,
    repoUrl: req.body?.repoUrl,
    repositoryUrl: req.body?.repositoryUrl,
    branch: req.body?.branch,
    rootDirectory: req.body?.rootDirectory,
    envVars: safeJson(req.body?.envVars),
    disk: safeJson(req.body?.disk),
  });
  res.json(result);
}
