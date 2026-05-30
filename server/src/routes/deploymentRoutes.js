import express from 'express';
import multer from 'multer';
import deploymentController from '../controllers/deploymentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import deploymentSessionMiddleware from '../middleware/deploymentSessionMiddleware.js';
import { validateDeploymentInput } from '../middleware/validationMiddleware.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.ZIP_UPLOAD_MAX_BYTES || process.env.MAX_ZIP_BYTES || 100 * 1024 * 1024),
    files: 1,
  },
  fileFilter: (req, file, cb) => {
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
router.post('/zip', upload.fields([{ name: 'zip', maxCount: 1 }, { name: 'file', maxCount: 1 }]), deploymentController.createZipDeployment);
router.post('/github', deploymentController.createGithubDeployment);
router.post('/render', validateDeploymentInput, deploymentController.createRenderDeployment);
router.post('/', validateDeploymentInput, deploymentController.createDeployment);
router.get('/:deploymentId', deploymentSessionMiddleware, deploymentController.getDeployment);
router.get('/:deploymentId/status', deploymentSessionMiddleware, deploymentController.getStatus);
router.post('/:deploymentId/verify-url', deploymentSessionMiddleware, deploymentController.verifyUrl);
router.post('/:deploymentId/redeploy', deploymentSessionMiddleware, deploymentController.redeploy);
router.post('/:deploymentId/redeploy-clear-cache', deploymentSessionMiddleware, deploymentController.redeployClearCache);
router.get('/:deploymentId/logs', deploymentSessionMiddleware, deploymentController.getLogs);

export default router;
