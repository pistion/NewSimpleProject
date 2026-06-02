/**
 * zipDeployRoute.middleware.js — staged ZIP deploy steps.
 *
 * validateZipUpload  → confirm a .zip file is present.
 * runZipDeployPipeline → run the EXISTING extract→scan→publish→Render pipeline
 *                        (no second record is created), store the result.
 * Billing is NOT attached here — that is a later middleware, and only when
 * Render actually accepted the deploy.
 */
import { run as runZipToRender } from '../pipelines/zipToRender.pipeline.js';
import { appendDeployStep, deployContext } from './deployFlowState.middleware.js';

/** Locate + validate the uploaded ZIP file. */
export function validateZipUpload(req, res, next) {
  const file = req.file || req.files?.siteZip?.[0] || req.files?.zip?.[0] || req.files?.file?.[0];
  if (!file?.buffer) {
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
  req.deployFlow.file = file;
  appendDeployStep(req, { name: 'zip_upload', status: 'ok', message: `Accepted ${file.originalname} (${file.size} bytes).` });
  next();
}

/** Run the existing ZIP→GitHub→Render pipeline and record the outcome step. */
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
    next(error);
  }
}

function recordOutcomeStep(req, deployment) {
  const status = deployment?.status;
  if (status === 'building' || status === 'queued') {
    appendDeployStep(req, { name: 'render_queued', status: 'ok', message: `Deploy queued in Render (${deployment.renderServiceId}).` });
  } else if (status === 'ready' || deployment?.buildStatus === 'configuration_required') {
    appendDeployStep(req, { name: 'configuration_required', status: 'warn', message: deployment?.errorMessage || 'Prepared but not handed off to Render — configuration required.' });
  } else if (status === 'failed') {
    appendDeployStep(req, { name: 'failed', status: 'error', message: deployment?.errorMessage || 'Deployment failed.' });
  } else {
    appendDeployStep(req, { name: 'pipeline_complete', status: 'ok', message: `Status: ${status || 'unknown'}.` });
  }
}

export default { validateZipUpload, runZipDeployPipeline };
