import express from 'express';
import { templateLibraryController } from './controller.js';
import { requireTemplateMarketplace } from './middleware.js';

const router = express.Router();

router.get('/settings', requireTemplateMarketplace, templateLibraryController.getSettings);
router.get('/templates', requireTemplateMarketplace, templateLibraryController.list);
router.get('/templates/:templateId', requireTemplateMarketplace, templateLibraryController.getOne);
router.get('/templates/:templateId/preview', requireTemplateMarketplace, templateLibraryController.getPreview);

export default router;
