import express from 'express';
import { handoffDeployController } from './controller.js';
import { requireTemplateMarketplace } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/sites/:siteId/package', requireTemplateMarketplace, authMiddleware, handoffDeployController.packageSite);
router.post('/sites/:siteId/deploy', requireTemplateMarketplace, authMiddleware, handoffDeployController.deploySite);
router.post('/plans/:planId/handoff', requireTemplateMarketplace, authMiddleware, handoffDeployController.handoffPlan);

export default router;
