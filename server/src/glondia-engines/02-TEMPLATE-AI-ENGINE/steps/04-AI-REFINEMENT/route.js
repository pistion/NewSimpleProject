import express from 'express';
import { aiRefinementController } from './controller.js';
import { requireAiBuilder, validateGenerate } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';
import { aiGenerationRateLimit } from '../../../../middleware/rateLimit.middleware.js';
import { limitPromptChars, aiConcurrencyLimit, aiQuotaLimit, auditAiCall, recordAiUsage } from '../../../../middleware/aiProtection.middleware.js';

const router = express.Router();

// Full-site AI generation — the most expensive calls in the platform. Both
// endpoints require authentication, hourly generation limits, a per-user
// concurrency cap, a prompt-size budget and an audit trail (Phase 1).
router.post('/generate',
  requireAiBuilder, authMiddleware, aiGenerationRateLimit, aiQuotaLimit, aiConcurrencyLimit,
  validateGenerate, limitPromptChars(), auditAiCall('generate'), recordAiUsage('generate'),
  aiRefinementController.generate);

router.post('/sites/:siteId/ai-edit',
  requireAiBuilder, authMiddleware, aiGenerationRateLimit, aiQuotaLimit, aiConcurrencyLimit,
  limitPromptChars(), auditAiCall('ai_edit_site'), recordAiUsage('ai_edit_site'),
  aiRefinementController.aiEditSite);

export default router;
