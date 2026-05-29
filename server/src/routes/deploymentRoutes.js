import express from 'express';
import deploymentController from '../controllers/deploymentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import deploymentSessionMiddleware from '../middleware/deploymentSessionMiddleware.js';
import { validateDeploymentInput } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.post('/render', validateDeploymentInput, deploymentController.createRenderDeployment);
router.post('/', validateDeploymentInput, deploymentController.createDeployment);
router.get('/:deploymentId', deploymentSessionMiddleware, deploymentController.getDeployment);
router.get('/:deploymentId/status', deploymentSessionMiddleware, deploymentController.getStatus);
router.post('/:deploymentId/verify-url', deploymentSessionMiddleware, deploymentController.verifyUrl);
router.post('/:deploymentId/redeploy', deploymentSessionMiddleware, deploymentController.redeploy);
router.post('/:deploymentId/redeploy-clear-cache', deploymentSessionMiddleware, deploymentController.redeployClearCache);
router.get('/:deploymentId/logs', deploymentSessionMiddleware, deploymentController.getLogs);

export default router;
