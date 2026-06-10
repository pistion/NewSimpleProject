import { requireFeature } from '../../../../middleware/featureFlag.js';
import authMiddleware from '../../../../middleware/authMiddleware.js';

export const requireTemplateMarketplace = requireFeature('SITE_BUILDER');
export { default as requireAuth } from '../../../../middleware/authMiddleware.js';
