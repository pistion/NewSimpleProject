import express from 'express';
import { handoffDeployController } from './controller.js';
import { requireTemplateMarketplace } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/sites/:siteId/package', requireTemplateMarketplace, authMiddleware, handoffDeployController.packageSite);
router.post('/sites/:siteId/deploy', requireTemplateMarketplace, authMiddleware, handoffDeployController.deploySite);
// NOTE: /plans/:planId/handoff is handled by sitePlanHandoffController in the legacy adapter
// (registered before step routes) — that controller includes the answer-sheet validation layer.

export default router;
