/**
 * deployFlowState.middleware.js - shared deploy flow state.
 *
 * Middleware owns request safety/state only. Pipelines own deploy execution.
 */

export function initDeployFlow(source) {
  return (req, _res, next) => {
    req.deployFlow = {
      source,
      startedAt: new Date().toISOString(),
      steps: [],
      warnings: [],
      deployment: null,
      billing: null,
      skippedBilling: null,
      responseMessage: null,
      file: null,
    };
    next();
  };
}

export function requireDeployUser(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Please log in before deploying a site.' },
      requestId: req.id,
    });
  }
  next();
}

export function appendDeployWarning(req, warning) {
  if (!req.deployFlow || !warning) return;
  if (!req.deployFlow.warnings.includes(warning)) req.deployFlow.warnings.push(warning);
}

export function appendDeployStep(req, step = {}) {
  if (!req.deployFlow) return;
  req.deployFlow.steps.push({
    name: step.name || 'step',
    status: step.status || 'ok',
    at: new Date().toISOString(),
    message: step.message || null,
  });
}

export function deployContext(req) {
  return { userId: req.user?.id, isAdmin: req.user?.role === 'admin' };
}

export default { initDeployFlow, requireDeployUser, appendDeployWarning, appendDeployStep, deployContext };
