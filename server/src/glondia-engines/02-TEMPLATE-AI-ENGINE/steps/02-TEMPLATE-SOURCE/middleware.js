import { requireFeature } from '../../../../middleware/featureFlag.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';

export const requireTemplateMarketplace = requireFeature('TEMPLATE_MARKETPLACE');
export { default as requireAuth } from '../../../../middleware/authMiddleware.js';
