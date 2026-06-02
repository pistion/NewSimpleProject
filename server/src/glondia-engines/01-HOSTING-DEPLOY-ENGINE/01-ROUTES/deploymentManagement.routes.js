/**
 * deploymentManagement.routes.js - management routes only.
 */
import express from 'express';
import authMiddleware from '../../../middleware/authMiddleware.js';
import deploymentSessionMiddleware from '../../../middleware/deploymentSessionMiddleware.js';
import { deploymentOwnership } from '../../../middleware/deploymentOwnership.middleware.js';
import deploymentManagementController from '../10-MANAGEMENT-MOUNTAIN/deploymentManagement.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.param('deploymentId', deploymentOwnership);

router.get('/settings', deploymentManagementController.getSettings);
router.get('/:deploymentId', deploymentSessionMiddleware, deploymentManagementController.getDeployment);
router.get('/:deploymentId/status', deploymentSessionMiddleware, deploymentManagementController.getStatus);
router.post('/:deploymentId/verify-url', deploymentSessionMiddleware, deploymentManagementController.verifyUrl);
router.post('/:deploymentId/redeploy', deploymentSessionMiddleware, deploymentManagementController.redeploy);
router.post('/:deploymentId/redeploy-clear-cache', deploymentSessionMiddleware, deploymentManagementController.redeployClearCache);
router.get('/:deploymentId/logs', deploymentSessionMiddleware, deploymentManagementController.getLogs);

export default router;
