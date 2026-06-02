/**
 * zipDeploy.routes.js - ZIP-only routes.
 */
import express from 'express';
import authMiddleware from '../../../middleware/authMiddleware.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import { initDeployFlow, requireDeployUser } from '../00-SHARED/deployFlowState.middleware.js';
import { attachDeploymentBilling } from '../00-SHARED/billingAttach.middleware.js';
import { sendDeployResponse } from '../00-SHARED/deployResponse.middleware.js';
import { zipUploadMiddleware } from '../01-ZIP-INTAKE-MOUNTAIN/zipUpload.middleware.js';
import { validateZipUpload, runZipDeployPipeline } from '../01-ZIP-INTAKE-MOUNTAIN/zipDeployPipeline.middleware.js';
import { validateZipDeployment } from '../01-ZIP-INTAKE-MOUNTAIN/zipValidation.controller.js';

const router = express.Router();

const deployChain = [
  authMiddleware,
  requireFeature('ZIP_HOSTING'),
  initDeployFlow('zip'),
  requireDeployUser,
  zipUploadMiddleware,
  validateZipUpload,
  runZipDeployPipeline,
  attachDeploymentBilling('zip'),
  sendDeployResponse('ZIP deployment session started.'),
];

router.post('/deploy', ...deployChain);
// Compatibility alias only. New frontend should use /zip/deploy.
router.post('/', ...deployChain);

router.post('/validate', authMiddleware, requireFeature('ZIP_HOSTING'), zipUploadMiddleware, validateZipUpload, validateZipDeployment);

export default router;
