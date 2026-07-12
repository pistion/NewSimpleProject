import express from 'express';
import { userBriefController } from './controller.js';
import { requireAiBuilder, validateIntakeStart, validateIntakeMessage, validateSuggestAnswer } from './middleware.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';
import { aiSuggestRateLimit } from '../../../../middleware/rateLimit.middleware.js';
import { limitPromptChars, aiConcurrencyLimit, aiQuotaLimit, auditAiCall, recordAiUsage } from '../../../../middleware/aiProtection.middleware.js';

const router = express.Router();

// AI-spending endpoints: feature flag → auth → rate limit → concurrency →
// input validation/length budget → audit → controller (hardening plan Phase 1).
router.post('/intake/start',
  requireAiBuilder, authMiddleware, aiSuggestRateLimit, aiQuotaLimit,
  validateIntakeStart, auditAiCall('intake_start'), recordAiUsage('intake_start'),
  userBriefController.startIntake);

router.post('/intake/message',
  requireAiBuilder, authMiddleware, aiSuggestRateLimit, aiQuotaLimit, aiConcurrencyLimit,
  validateIntakeMessage, limitPromptChars(), auditAiCall('intake_message'), recordAiUsage('intake_message'),
  userBriefController.sendMessage);

router.post('/intake/suggest-answer',
  requireAiBuilder, authMiddleware, aiSuggestRateLimit, aiQuotaLimit, aiConcurrencyLimit,
  validateSuggestAnswer, limitPromptChars(), auditAiCall('intake_suggest_answer'), recordAiUsage('intake_suggest_answer'),
  userBriefController.suggestAnswer);

export default router;
