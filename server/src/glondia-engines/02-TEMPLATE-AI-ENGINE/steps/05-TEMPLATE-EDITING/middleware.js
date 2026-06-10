import { requireFeature } from '../../../../middleware/featureFlag.js';

export const requireTemplateMarketplace = requireFeature('TEMPLATE_MARKETPLACE');
export const requireAiBuilder = requireFeature('AI_BUILDER');
