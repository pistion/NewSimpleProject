import express from 'express';
import { templateSourceController } from './controller.js';
import { requireTemplateMarketplace } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/sites', requireTemplateMarketplace, authMiddleware, templateSourceController.createSite);
router.get('/sites/:siteId', requireTemplateMarketplace, authMiddleware, templateSourceController.getSite);

export default router;
