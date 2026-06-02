/**
 * zipDeploy.routes.js — ZIP file deploy routes ONLY.
 *
 * Mounted at /api/deployments/zip:
 *   POST /deploy   — full staged ZIP deploy chain
 *   POST /         — bare compatibility alias (POST /api/deployments/zip)
 *   POST /validate — validate-only (no deploy, no billing)
 *
 * This file owns ZIP only: it imports multer, never GitHub-link middleware,
 * and never validates repo URLs.
 */
import express from 'express';
import multer from 'multer';
import authMiddleware from '../../../middleware/authMiddleware.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import hostingDeployController from '../controllers/hostingDeploy.controller.js';
import { initDeployFlow, requireDeployUser } from '../middleware/shared/deployFlowState.middleware.js';
import { validateZipUpload, runZipDeployPipeline } from '../middleware/zip/zipDeployRoute.middleware.js';
import { attachDeploymentBilling } from '../middleware/shared/billingAttach.middleware.js';
import { sendDeployResponse } from '../middleware/shared/deployResponse.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.ZIP_UPLOAD_MAX_BYTES || process.env.MAX_ZIP_BYTES || 100 * 1024 * 1024),
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!/\.zip$/i.test(file.originalname || '')) {
      const error = new Error('Only .zip uploads are supported.');
      error.status = 400;
      error.stage = 'zip_upload';
      cb(error);
      return;
    }
    cb(null, true);
  },
});

const zipUpload = upload.fields([{ name: 'zip', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'siteZip', maxCount: 1 }]);

router.use(authMiddleware);

const deployChain = [
  requireFeature('ZIP_HOSTING'),
  initDeployFlow('zip'),
  requireDeployUser,
  zipUpload,
  validateZipUpload,
  runZipDeployPipeline,
  attachDeploymentBilling('zip'),
  sendDeployResponse('ZIP deployment session started.'),
];

router.post('/deploy', ...deployChain);
router.post('/', ...deployChain); // bare compatibility alias → POST /api/deployments/zip

router.post('/validate', requireFeature('ZIP_HOSTING'), zipUpload, hostingDeployController.validateZipDeployment);

export default router;
