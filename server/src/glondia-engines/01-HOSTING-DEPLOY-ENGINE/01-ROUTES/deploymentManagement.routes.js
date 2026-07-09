/**
 * deploymentManagement.routes.js - management routes only.
 */
import express from 'express';
import authMiddleware from '../../../middleware/authMiddleware.js';
import deploymentSessionMiddleware from '../../../middleware/deploymentSessionMiddleware.js';
import { deploymentOwnership } from '../../../middleware/deploymentOwnership.middleware.js';
import { requireServiceAccess } from '../../../middleware/serviceAccess.middleware.js';
import deploymentManagementController from '../10-MANAGEMENT-MOUNTAIN/deploymentManagement.controller.js';

const router = express.Router();

// Resolver: hosting serviceId is the deploymentId param
const hostingServiceId = (req) => req.params.deploymentId;

router.use(authMiddleware);
router.param('deploymentId', deploymentOwnership);

router.get('/settings', deploymentManagementController.getSettings);

// Read-only deployment detail — require active ServiceAccess
router.get('/:deploymentId',
  deploymentSessionMiddleware,
  requireServiceAccess('hosting', hostingServiceId),
  deploymentManagementController.getDeployment);

router.get('/:deploymentId/status',
  deploymentSessionMiddleware,
  requireServiceAccess('hosting', hostingServiceId),
  deploymentManagementController.getStatus);

router.post('/:deploymentId/verify-url',
  deploymentSessionMiddleware,
  requireServiceAccess('hosting', hostingServiceId),
  deploymentManagementController.verifyUrl);

// Mutating deployment actions — require active ServiceAccess
router.post('/:deploymentId/redeploy',
  deploymentSessionMiddleware,
  requireServiceAccess('hosting', hostingServiceId),
  deploymentManagementController.redeploy);

router.post('/:deploymentId/redeploy-clear-cache',
  deploymentSessionMiddleware,
  requireServiceAccess('hosting', hostingServiceId),
  deploymentManagementController.redeployClearCache);

router.get('/:deploymentId/logs',
  deploymentSessionMiddleware,
  requireServiceAccess('hosting', hostingServiceId),
  deploymentManagementController.getLogs);

export default router;
