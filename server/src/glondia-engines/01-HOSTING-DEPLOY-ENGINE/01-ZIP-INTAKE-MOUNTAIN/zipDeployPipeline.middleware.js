/**
 * zipDeployPipeline.middleware.js - ZIP route validation and pipeline handoff.
 */
import { run as runZipToRender } from '../pipelines/zipToRender.pipeline.js';
import { appendDeployStep, deployContext } from '../00-SHARED/deployFlowState.middleware.js';

export function validateZipUpload(req, res, next) {
  const file = req.file || req.files?.siteZip?.[0] || req.files?.zip?.[0] || req.files?.file?.[0];
  if (!file?.buffer && !file?.path) {
    return res.status(400).json({
      success: false,
      error: { code: 'ZIP_MISSING_FILE', message: 'A ZIP file is required (field zip, file, or siteZip).' },
      requestId: req.id,
    });
  }
  if (!/\.zip$/i.test(file.originalname || '')) {
    return res.status(400).json({
      success: false,
      error: { code: 'ZIP_INVALID_TYPE', message: 'Only .zip uploads are supported.' },
      requestId: req.id,
    });
  }
  if (req.deployFlow) {
    req.deployFlow.file = file;
    appendDeployStep(req, { name: 'zip_upload', status: 'ok', message: `Accepted ${file.originalname} (${file.size} bytes).` });
  }
  next();
}

export async function runZipDeployPipeline(req, res, next) {
  try {
    const deployment = await runZipToRender(
      { file: req.deployFlow.file, fields: req.body || {} },
      deployContext(req),
    );
    req.deployFlow.deployment = deployment;
    recordOutcomeStep(req, deployment);
    next();
  } catch (error) {
    if (!error.stage) error.stage = 'zip_upload';
    if (error.stage === 'zip_upload' && !error.expose) {
      error.expose = true;
      error.status = error.status || 500;
      error.code = error.code || 'ZIP_UPLOAD_PIPELINE_ERROR';
      error.message = error.message || 'ZIP upload could not be prepared on the server.';
    }
    next(error);
  }
}

function recordOutcomeStep(req, deployment) {
  const status = deployment?.status;
  if (status === 'building' || status === 'queued') {
    appendDeployStep(req, { name: 'render_queued', status: 'ok', message: `Deploy queued in Render (${deployment.renderServiceId}).` });
  } else if (status === 'ready' || deployment?.buildStatus === 'configuration_required') {
    appendDeployStep(req, { name: 'configuration_required', status: 'warn', message: deployment?.errorMessage || 'Prepared but not handed off to Render - configuration required.' });
  } else if (status === 'failed') {
    appendDeployStep(req, { name: 'failed', status: 'error', message: deployment?.errorMessage || 'Deployment failed.' });
  } else {
    appendDeployStep(req, { name: 'pipeline_complete', status: 'ok', message: `Status: ${status || 'unknown'}.` });
  }
}

export default { validateZipUpload, runZipDeployPipeline };
