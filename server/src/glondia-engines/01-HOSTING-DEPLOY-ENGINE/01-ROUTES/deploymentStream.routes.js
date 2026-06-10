/**
 * deploymentStream.routes.js
 *
 * Mounted at /api/deployments in server.js (before deploymentRoutes).
 */

import express from 'express';
import deploymentStreamController from '../controllers/deploymentStream.controller.js';

const router = express.Router();

router.get('/:deploymentId/logs/stream', deploymentStreamController.streamDeploymentLogs);

export default router;
