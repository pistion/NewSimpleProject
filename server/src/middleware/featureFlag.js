import { featureFlagSnapshot, featureLabel, isFeatureEnabled } from '../config/featureFlags.js';

/**
 * Express middleware that blocks a route when its feature flag is disabled.
 * Disabled features respond with 503 + a `coming_soon` status so the frontend
 * can render a Coming Soon surface instead of a broken page.
 *
 *   router.use('/api/v1/...', requireFeature('DOMAINS'), domainRoutes);
 */
export function requireFeature(name) {
  return (req, res, next) => {
    if (isFeatureEnabled(name)) return next();
    return res.status(503).json({
      success: false,
      status: 'coming_soon',
      feature: name,
      error: {
        code: 'FEATURE_COMING_SOON',
        message: `${featureLabel(name)} is coming soon and is not available yet.`,
      },
      requestId: req.id,
    });
  };
}

/** GET handler exposing the public feature flag snapshot to the frontend. */
export function featureFlagsHandler(req, res) {
  res.json({ data: { features: featureFlagSnapshot() }, requestId: req.id });
}
