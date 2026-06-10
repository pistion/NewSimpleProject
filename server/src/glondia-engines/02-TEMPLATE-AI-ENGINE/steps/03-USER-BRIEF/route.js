import express from 'express';
import { userBriefController } from './controller.js';
import { requireAiBuilder, validateIntakeStart, validateSuggestAnswer } from './middleware.js';

const router = express.Router();

router.post('/intake/start', requireAiBuilder, validateIntakeStart, userBriefController.startIntake);
router.post('/intake/message', requireAiBuilder, userBriefController.sendMessage);
router.post('/intake/suggest-answer', requireAiBuilder, validateSuggestAnswer, userBriefController.suggestAnswer);

export default router;
