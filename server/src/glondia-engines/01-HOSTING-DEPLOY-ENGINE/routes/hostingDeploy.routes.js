/**
 * hostingDeploy.routes.js — deployment mount + compatibility + management.
 *
 * ZIP and GitHub-link deploys now live in their own route files; this file just
 * mounts them, keeps backward-compatible bare aliases, and owns the shared
 * management + legacy/admin routes.
 *
 *   /zip          → zipDeploy.routes.js        (/zip/deploy, /zip/validate, /zip)
 *   /github-link  → githubLinkDeploy.routes.js (/github-link/deploy|validate)
 *   /github       → githubLinkDeploy.routes.js (compatibility alias only)
 */
import express from 'express';
import hostingDeployController from '../controllers/hostingDeploy.controller.js';
import authMiddleware from '../../../middleware/authMiddleware.js';
import deploymentSessionMiddleware from '../../../middleware/deploymentSessionMiddleware.js';
import { validateDeploymentInput } from '../../../middleware/validationMiddleware.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import { deploymentOwnership } from '../../../middleware/deploymentOwnership.middleware.js';
import { requireAdminForLegacyDeploy } from '../middleware/shared/legacyDeployRouteGuard.middleware.js';
import zipDeployRoutes from './zipDeploy.routes.js';
import githubLinkDeployRoutes from './githubLinkDeploy.routes.js';

const router = express.Router();

// All deployment routes require a valid session (authMiddleware rejects in prod
// without a token; allows the local-user fallback only in dev/demo mode).
router.use(authMiddleware);
// Per-user ownership guard on every :deploymentId route (admins bypass).
router.param('deploymentId', deploymentOwnership);
router.get('/settings', hostingDeployController.getSettings);

// ── Separated deploy ownership ────────────────────────────────────────────────
// ZIP file deploy   → /zip/deploy, /zip/validate, /zip (bare alias)
router.use('/zip', zipDeployRoutes);
// GitHub link deploy → /github-link/deploy, /github-link/validate
router.use('/github-link', githubLinkDeployRoutes);
// Compatibility alias only. New frontend should call /github-link/deploy.
router.use('/github', githubLinkDeployRoutes);

// ── Legacy deployment-creation routes — NOT open to normal users ──────────────
// /generated-site is gated behind the AI builder feature (returns 403 when off).
// /render and / are admin-only; normal users must use /zip or /github-link so
// the full feature → deploy → billing → ownership chain always applies.
router.post('/generated-site', requireFeature('AI_BUILDER'), hostingDeployController.createGeneratedSiteDeployment);
router.post('/render', requireAdminForLegacyDeploy('render_direct'), validateDeploymentInput, hostingDeployController.createRenderDeployment);
router.post('/', requireAdminForLegacyDeploy('generic_deploy'), validateDeploymentInput, hostingDeployController.createDeployment);

// ── Management (read + control a specific deployment) ─────────────────────────
router.get('/:deploymentId', deploymentSessionMiddleware, hostingDeployController.getDeployment);
router.get('/:deploymentId/status', deploymentSessionMiddleware, hostingDeployController.getStatus);
router.post('/:deploymentId/verify-url', deploymentSessionMiddleware, hostingDeployController.verifyUrl);
router.post('/:deploymentId/redeploy', deploymentSessionMiddleware, hostingDeployController.redeploy);
router.post('/:deploymentId/redeploy-clear-cache', deploymentSessionMiddleware, hostingDeployController.redeployClearCache);
router.get('/:deploymentId/logs', deploymentSessionMiddleware, hostingDeployController.getLogs);

export default router;
