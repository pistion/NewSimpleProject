/**
 * legacyDeployRouteGuard.middleware.js - gate legacy deploy creation routes.
 */

export function requireAdminForLegacyDeploy(name) {
  return (req, res, next) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'LEGACY_DEPLOY_FORBIDDEN',
          message: `This deployment path (${name}) is restricted. Please use ZIP or GitHub deploy.`,
        },
        requestId: req.id,
      });
    }
    next();
  };
}

export function blockLegacyDeployRoute(name) {
  return (req, res) => res.status(410).json({
    success: false,
    error: {
      code: 'LEGACY_DEPLOY_DISABLED',
      message: `This deployment path (${name}) is disabled. Please use ZIP or GitHub deploy.`,
    },
    requestId: req.id,
  });
}

export default { requireAdminForLegacyDeploy, blockLegacyDeployRoute };
