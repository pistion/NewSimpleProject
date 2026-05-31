/**
 * Backward-compatibility re-export.
 * Base64 ZIP deployment is implemented by the Hosting Deploy Engine pipeline.
 */
export {
  deployZipSite,
  validateZipSite,
  getZipDeployConfigStatus,
} from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/pipelines/base64ZipToRender.pipeline.js';
