/**
 * githubLinkDeploy.routes.js - GitHub-link-only routes.
 */
import express from 'express';
import authMiddleware from '../../../middleware/authMiddleware.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import { initDeployFlow, requireDeployUser } from '../00-SHARED/deployFlowState.middleware.js';
import { attachDeploymentBilling } from '../00-SHARED/billingAttach.middleware.js';
import { sendDeployResponse } from '../00-SHARED/deployResponse.middleware.js';
import { validateGithubLinkRequest } from '../01-GITHUB-LINK-INTAKE-MOUNTAIN/githubLinkInput.middleware.js';
import { runGithubLinkDeployPipeline } from '../01-GITHUB-LINK-INTAKE-MOUNTAIN/githubLinkDeployPipeline.middleware.js';
import { validateGithubLinkOnly } from '../01-GITHUB-LINK-INTAKE-MOUNTAIN/githubLinkValidation.controller.js';

const router = express.Router();

const deployChain = [
  authMiddleware,
  requireFeature('GITHUB_HOSTING'),
  initDeployFlow('github-link'),
  requireDeployUser,
  validateGithubLinkRequest,
  runGithubLinkDeployPipeline,
  attachDeploymentBilling('github-link'),
  sendDeployResponse('GitHub link deployment session started.'),
];

router.post('/deploy', ...deployChain);
// Compatibility alias only. New frontend should use /github-link/deploy.
router.post('/', ...deployChain);

router.post('/validate', authMiddleware, requireFeature('GITHUB_HOSTING'), validateGithubLinkRequest, validateGithubLinkOnly);

export default router;
