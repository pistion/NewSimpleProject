/**
 * providerRender.routes.js
 *
 * Mounts all Render provider + GitHub import routes under /api.
 * Mount in server.js with: app.use('/api', providerRenderRoutes)
 */

import express from 'express';
import { providerApiGuard } from '../services/providerApiGuard.service.js';
import providerRenderController from '../controllers/providerRender.controller.js';

const router = express.Router();

router.post('/builder/import-github', providerApiGuard, providerRenderController.importGithubSandbox);
router.post('/render/deploy', providerApiGuard, providerRenderController.triggerRenderDeploy);
router.post('/render/test-deploy', providerApiGuard, providerRenderController.testRenderDeploy);
router.post('/render/activate-repo', providerApiGuard, providerRenderController.activateRenderRepo);
router.get('/render/settings', providerRenderController.getRenderSettings);
router.get('/render/deploys', providerRenderController.listRenderDeploys);
router.get('/render/services', providerRenderController.listRenderServices);

export default router;
