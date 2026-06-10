import { requireFeature } from '../../../../middleware/featureFlag.js';

export const requireTemplateMarketplace = requireFeature('SITE_BUILDER');
