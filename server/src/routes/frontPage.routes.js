import express from 'express';
import FrontPageController from '../controllers/frontPage.controller.js';
import deploymentRoutes from './deploymentRoutes.js';

const router = express.Router();

// Compatibility alias for the isolated Render deploy lab endpoints:
// POST /api/deploy/zip and POST /api/deploy/github.
// The canonical production endpoints remain /api/deployments/zip and /api/deployments/github.
router.use('/api/deploy', deploymentRoutes);

router.get('/', FrontPageController.serveIndex);

export default router;
