import express from 'express';
import { previewController } from './controller.js';
import { requireTemplateMarketplace } from './middleware.js';

const router = express.Router();

router.get('/sites/:siteId/preview', requireTemplateMarketplace, previewController.previewSite);

export default router;
