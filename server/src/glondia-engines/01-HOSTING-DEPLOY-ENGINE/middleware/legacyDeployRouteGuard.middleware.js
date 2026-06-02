/**
 * legacyDeployRouteGuard.middleware.js — gate the legacy deployment-creation
 * routes (/render, /). Normal users must deploy through /zip or /github so the
 * full feature → deploy → billing → ownership chain always applies.
 */

/** Allow only admins through a legacy deploy route; clear 403 otherwise. */
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

/** Hard-disable a legacy deploy route (410 Gone) with a clear message. */
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
