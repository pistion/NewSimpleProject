/**
 * zipValidation.controller.js - ZIP validate-only controller.
 */
import { validateZipDeploymentPreview } from './zipValidation.stage.js';

export async function validateZipDeployment(req, res, next) {
  try {
    const file = req.file || req.files?.siteZip?.[0] || req.files?.zip?.[0] || req.files?.file?.[0];
    res.ok(await validateZipDeploymentPreview({ file, fields: req.body || {} }));
  } catch (error) {
    if (!error.stage) error.stage = 'zip_validation';
    next(error);
  }
}

export default { validateZipDeployment };
