import express from 'express';
import multer from 'multer';
import hostingDeployController from '../controllers/hostingDeploy.controller.js';
import authMiddleware from '../../../middleware/authMiddleware.js';
import deploymentSessionMiddleware from '../../../middleware/deploymentSessionMiddleware.js';
import { validateDeploymentInput } from '../../../middleware/validationMiddleware.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import { deploymentOwnership } from '../../../middleware/deploymentOwnership.middleware.js';
import { initDeployFlow, requireDeployUser } from '../middleware/deployFlowState.middleware.js';
import { validateZipUpload, runZipDeployPipeline } from '../middleware/zipDeployRoute.middleware.js';
import { validateGithubRequest, runGithubDeployPipeline } from '../middleware/githubDeployRoute.middleware.js';
import { attachDeploymentBilling } from '../middleware/billingAttach.middleware.js';
import { sendDeployResponse } from '../middleware/deployResponse.middleware.js';
import { requireAdminForLegacyDeploy } from '../middleware/legacyDeployRouteGuard.middleware.js';

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

// All deployment routes require a valid session (authMiddleware rejects in prod
// without a token; allows the local-user fallback only in dev/demo mode).
router.use(authMiddleware);
// Per-user ownership guard on every :deploymentId route (admins bypass).
router.param('deploymentId', deploymentOwnership);
router.get('/settings', hostingDeployController.getSettings);

// ── ZIP upload hosting — clean staged deploy chain ────────────────────────────
// auth → feature → init flow → user guard → upload → validate → run pipeline →
// attach billing (only if Render queued) → response. Deploy first, bill second.
router.post(
  '/zip',
  requireFeature('ZIP_HOSTING'),
  initDeployFlow('zip'),
  requireDeployUser,
  upload.fields([{ name: 'zip', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'siteZip', maxCount: 1 }]),
  validateZipUpload,
  runZipDeployPipeline,
  attachDeploymentBilling('zip'),
  sendDeployResponse('ZIP deployment session started.'),
);

// Validate-only (no deploy, no billing).
router.post(
  '/zip/validate',
  requireFeature('ZIP_HOSTING'),
  upload.fields([{ name: 'zip', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'siteZip', maxCount: 1 }]),
  hostingDeployController.validateZipDeployment,
);

// ── GitHub import hosting — clean staged deploy chain ─────────────────────────
router.post(
  '/github',
  requireFeature('GITHUB_HOSTING'),
  initDeployFlow('github'),
  requireDeployUser,
  validateGithubRequest,
  runGithubDeployPipeline,
  attachDeploymentBilling('github'),
  sendDeployResponse('GitHub deployment session started.'),
);

// ── Legacy deployment-creation routes — NOT open to normal users ──────────────
// /generated-site is gated behind the AI builder feature (returns 403 when off).
// /render and / are admin-only; normal users must use /zip or /github so the
// full feature → deploy → billing → ownership chain always applies.
router.post('/generated-site', requireFeature('AI_BUILDER'), hostingDeployController.createGeneratedSiteDeployment);
router.post('/render', requireAdminForLegacyDeploy('render_direct'), validateDeploymentInput, hostingDeployController.createRenderDeployment);
router.post('/', requireAdminForLegacyDeploy('generic_deploy'), validateDeploymentInput, hostingDeployController.createDeployment);
router.get('/:deploymentId', deploymentSessionMiddleware, hostingDeployController.getDeployment);
router.get('/:deploymentId/status', deploymentSessionMiddleware, hostingDeployController.getStatus);
router.post('/:deploymentId/verify-url', deploymentSessionMiddleware, hostingDeployController.verifyUrl);
router.post('/:deploymentId/redeploy', deploymentSessionMiddleware, hostingDeployController.redeploy);
router.post('/:deploymentId/redeploy-clear-cache', deploymentSessionMiddleware, hostingDeployController.redeployClearCache);
router.get('/:deploymentId/logs', deploymentSessionMiddleware, hostingDeployController.getLogs);

export default router;
