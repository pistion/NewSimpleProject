import express from 'express';
import { aiRefinementController } from './controller.js';
import { requireAiBuilder, requireTemplateMarketplace, validateGenerate } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/generate', requireAiBuilder, validateGenerate, aiRefinementController.generate);
router.post('/sites/:siteId/ai-edit', requireAiBuilder, authMiddleware, aiRefinementController.aiEditSite);

export default router;
