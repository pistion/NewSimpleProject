import { requireFeature } from '../../../../middleware/featureFlag.js';

export const requireAiBuilder = requireFeature('AI_BUILDER');
export const requireTemplateMarketplace = requireFeature('SITE_BUILDER');

export function validateGenerate(req, res, next) {
  const { templateId, templateHtml, answers } = req.body || {};
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId is required.' });
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers (object) is required.' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI tailoring is not available. OPENAI_API_KEY is not configured on this server.', code: 'OPENAI_NOT_CONFIGURED' });
  }
  next();
}
