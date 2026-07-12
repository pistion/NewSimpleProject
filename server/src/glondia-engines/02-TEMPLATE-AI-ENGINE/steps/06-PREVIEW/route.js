import express from 'express';
import { previewController } from './controller.js';
import { requireTemplateMarketplace } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';
import { verifyPreviewGrant } from '../../../../services/previewGrantService.js';

const router = express.Router();

/**
 * Preview access (hardening plan Phase 1): generated HTML is never served
 * anonymously. Either the request carries a valid signed grant (?grant=…,
 * issued below — iframes cannot send Bearer headers), or the caller must be
 * the authenticated owner (ownership enforced in the controller).
 */
function previewAccess(req, res, next) {
  if (verifyPreviewGrant(req.params.siteId, req.query.grant)) {
    req.previewGrant = true;
    return next();
  }
  return authMiddleware(req, res, next);
}

// Authenticated owners mint short-lived signed preview URLs here.
router.post('/sites/:siteId/preview-grants',
  requireTemplateMarketplace, authMiddleware,
  previewController.createPreviewGrant);

router.get('/sites/:siteId/preview',
  requireTemplateMarketplace, previewAccess,
  previewController.previewSite);

export default router;
