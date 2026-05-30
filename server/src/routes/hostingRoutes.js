import express from 'express';
import hostingController from '../controllers/hostingController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.post('/import-from-render', hostingController.importFromRender);
router.get('/', hostingController.listHosting);
router.get('/:deploymentId', hostingController.getHostingService);
router.post('/:deploymentId/sync', hostingController.syncHostingService);
router.patch('/:deploymentId/settings', hostingController.updateSettings);
router.patch('/:deploymentId/deploy-settings', hostingController.updateDeploySettings);
router.patch('/:deploymentId/build-settings', hostingController.updateBuildSettings);
router.patch('/:deploymentId/source-settings', hostingController.updateSourceSettings);
router.post('/:deploymentId/redeploy-with-settings', hostingController.redeployWithSettings);
router.post('/:deploymentId/suspend', hostingController.suspendHostingService);
router.delete('/:deploymentId', hostingController.deleteHostingService);

export default router;
