/**
 * sandbox.routes.js
 *
 * Serves sandbox previews (static dist or runtime proxy).
 * Mount in server.js with: app.use('/sandbox', sandboxRoutes)
 */

import express from 'express';
import sandboxController from '../controllers/sandbox.controller.js';

const router = express.Router();

router.use('/:siteId', sandboxController.serveSandbox);
router.get('/:siteId/*', sandboxController.serveSandboxFallback);

export default router;
