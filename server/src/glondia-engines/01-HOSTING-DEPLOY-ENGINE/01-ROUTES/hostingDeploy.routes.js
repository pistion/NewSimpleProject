/**
 * hostingDeploy.routes.js - parent deployment router.
 *
 * Routes define order. Middleware protects/passes data. Pipelines deploy.
 */
import express from 'express';
import authMiddleware from '../../../middleware/authMiddleware.js';
import { validateDeploymentInput } from '../../../middleware/validationMiddleware.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import { requireAdminForLegacyDeploy } from '../00-SHARED/legacyDeployRouteGuard.middleware.js';
import hostingDeployController from '../controllers/hostingDeploy.controller.js';
import zipDeployRoutes from './zipDeploy.routes.js';
import githubLinkDeployRoutes from './githubLinkDeploy.routes.js';
import deploymentManagementRoutes from './deploymentManagement.routes.js';

const router = express.Router();

router.use('/zip', zipDeployRoutes);
router.use('/github-link', githubLinkDeployRoutes);
// Compatibility alias only. New frontend should use /github-link/deploy.
router.use('/github', githubLinkDeployRoutes);

// Legacy/admin deploy creation paths.
router.post('/generated-site', authMiddleware, requireFeature('AI_BUILDER'), hostingDeployController.createGeneratedSiteDeployment);
router.post('/render', authMiddleware, requireAdminForLegacyDeploy('render_direct'), validateDeploymentInput, hostingDeployController.createRenderDeployment);
router.post('/', authMiddleware, requireAdminForLegacyDeploy('generic_deploy'), validateDeploymentInput, hostingDeployController.createDeployment);

router.use('/', deploymentManagementRoutes);

export default router;
