/**
 * githubLinkDeploy.routes.js — GitHub LINK deploy routes ONLY.
 *
 * Mounted at /api/deployments/github-link (and aliased at /github):
 *   POST /deploy   — full staged GitHub-link deploy chain
 *   POST /         — bare compatibility alias (POST /api/deployments/github)
 *   POST /validate — validate the repo URL only (no import, no record, no bill)
 *
 * This file owns GitHub link only: it never imports multer and never handles
 * ZIP files or ZIP extraction.
 */
import express from 'express';
import authMiddleware from '../../../middleware/authMiddleware.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import { initDeployFlow, requireDeployUser } from '../middleware/shared/deployFlowState.middleware.js';
import {
  validateGithubLinkRequest,
  runGithubLinkDeployPipeline,
  validateGithubLinkOnly,
} from '../middleware/github-link/githubLinkDeployRoute.middleware.js';
import { attachDeploymentBilling } from '../middleware/shared/billingAttach.middleware.js';
import { sendDeployResponse } from '../middleware/shared/deployResponse.middleware.js';

const router = express.Router();

router.use(authMiddleware);

const deployChain = [
  requireFeature('GITHUB_HOSTING'),
  initDeployFlow('github-link'),
  requireDeployUser,
  validateGithubLinkRequest,
  runGithubLinkDeployPipeline,
  attachDeploymentBilling('github-link'),
  sendDeployResponse('GitHub link deployment session started.'),
];

router.post('/deploy', ...deployChain);
router.post('/', ...deployChain); // bare compatibility alias → POST /api/deployments/github

router.post('/validate', requireFeature('GITHUB_HOSTING'), validateGithubLinkRequest, validateGithubLinkOnly);

export default router;
