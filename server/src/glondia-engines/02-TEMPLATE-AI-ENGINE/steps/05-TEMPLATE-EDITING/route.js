import express from 'express';
import { templateEditingController } from './controller.js';
import { requireTemplateMarketplace } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/sites/:siteId/prepare', requireTemplateMarketplace, authMiddleware, templateEditingController.prepareSite);

export default router;
