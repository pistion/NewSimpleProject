import express from 'express';
import multer from 'multer';
import hostingDeployController from '../controllers/hostingDeploy.controller.js';
import authMiddleware from '../../../middleware/authMiddleware.js';
import deploymentSessionMiddleware from '../../../middleware/deploymentSessionMiddleware.js';
import { validateDeploymentInput } from '../../../middleware/validationMiddleware.js';

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

router.use(authMiddleware);
router.post('/zip', upload.fields([{ name: 'zip', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'siteZip', maxCount: 1 }]), hostingDeployController.createZipDeployment);
router.post('/github', hostingDeployController.createGithubDeployment);
router.post('/render', validateDeploymentInput, hostingDeployController.createRenderDeployment);
router.post('/', validateDeploymentInput, hostingDeployController.createDeployment);
router.get('/:deploymentId', deploymentSessionMiddleware, hostingDeployController.getDeployment);
router.get('/:deploymentId/status', deploymentSessionMiddleware, hostingDeployController.getStatus);
router.post('/:deploymentId/verify-url', deploymentSessionMiddleware, hostingDeployController.verifyUrl);
router.post('/:deploymentId/redeploy', deploymentSessionMiddleware, hostingDeployController.redeploy);
router.post('/:deploymentId/redeploy-clear-cache', deploymentSessionMiddleware, hostingDeployController.redeployClearCache);
router.get('/:deploymentId/logs', deploymentSessionMiddleware, hostingDeployController.getLogs);

export default router;
