/**
 * deployErrors.js - shared deploy error helpers for the hosting engine.
 */
export function deprecatedDeployControllerResponse(res, requestId) {
  return res.status(410).json({
    success: false,
    error: {
      code: 'DEPRECATED_DEPLOY_CONTROLLER',
      message: 'Use staged ZIP or GitHub Link deploy routes.',
    },
    requestId,
  });
}
