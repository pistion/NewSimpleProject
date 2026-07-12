import { requireFeature } from '../../../../middleware/featureFlag.js';

export const requireAiBuilder = requireFeature('AI_BUILDER');
export const requireTemplateMarketplace = requireFeature('SITE_BUILDER');

export function validateIntakeStart(req, res, next) {
  const { templateId } = req.body || {};
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId is required.' });
  }
  if (templateId.length > 100) {
    return res.status(400).json({ error: 'templateId is too long.' });
  }
  next();
}

export function validateIntakeMessage(req, res, next) {
  const { sessionId, message } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
    return res.status(400).json({ error: 'A valid sessionId is required.' });
  }
  if (message !== undefined && typeof message !== 'string') {
    return res.status(400).json({ error: 'message must be a string.' });
  }
  next();
}

export function validateSuggestAnswer(req, res, next) {
  const { questionKey } = req.body || {};
  if (!questionKey || typeof questionKey !== 'string') {
    return res.status(400).json({ error: 'questionKey is required.' });
  }
  if (questionKey.length > 100) {
    return res.status(400).json({ error: 'questionKey is too long.' });
  }
  next();
}
