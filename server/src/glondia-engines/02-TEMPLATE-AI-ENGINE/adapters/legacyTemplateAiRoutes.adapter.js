/**
 * legacyTemplateAiRoutes.adapter.js
 *
 * Implements /api/template-ai/* routes.
 * Exported as default and re-imported by server/src/routes/template-ai.routes.js.
 *
 * Routes:
 *   GET  /api/template-ai/templates              — list all available templates
 *   GET  /api/template-ai/config/:templateId     — wizard config for a template
 *   POST /api/template-ai/assist                 — per-field AI assist (debounced)
 *   POST /api/template-ai/clean                  — batch clean all filled fields
 *   POST /api/template-ai/generate               — generate ZIP (download)
 *   POST /api/template-ai/deploy                 — generate + push to GitHub → return Render config
 */

import { Router } from 'express';
import authMiddleware from '../../../middleware/authMiddleware.js';
import {
  getTemplateList,
  getTemplateConfig,
  handleAssistField,
  handleCleanFields,
  handleGenerate,
  handleDeploy
} from '../templateAi.controller.js';

const router = Router();

// Public — listing templates doesn't require auth
router.get('/templates', getTemplateList);

// Public — wizard config doesn't require auth (drives the form UI)
router.get('/config/:templateId', getTemplateConfig);

// Auth required — all AI operations consume OpenAI credits
router.post('/assist',   authMiddleware, handleAssistField);
router.post('/clean',    authMiddleware, handleCleanFields);
router.post('/generate', authMiddleware, handleGenerate);
router.post('/deploy',   authMiddleware, handleDeploy);

export default router;
