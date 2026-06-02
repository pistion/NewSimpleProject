/**
 * deployFlowState.middleware.js — per-request deploy flow state.
 *
 * Each ZIP/GitHub deploy request carries a `req.deployFlow` object that the
 * staged middlewares append to (steps, warnings, the deployment record, the
 * billing result). The final response middleware serializes it. This keeps each
 * route step single-purpose: "deploy first, bill second, notify last".
 */

/** Initialize the flow state for a deploy request. */
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

/** Reject unauthenticated deploys with a clear message. */
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

/** Append a warning to the flow (deduplicated). */
export function appendDeployWarning(req, warning) {
  if (!req.deployFlow || !warning) return;
  if (!req.deployFlow.warnings.includes(warning)) req.deployFlow.warnings.push(warning);
}

/** Append a timestamped step to the flow. */
export function appendDeployStep(req, step = {}) {
  if (!req.deployFlow) return;
  req.deployFlow.steps.push({
    name: step.name || 'step',
    status: step.status || 'ok',
    at: new Date().toISOString(),
    message: step.message || null,
  });
}

/** Pipeline context: only an admin may force a non-free initial Render plan. */
export function deployContext(req) {
  return { userId: req.user?.id, isAdmin: req.user?.role === 'admin' };
}

export default { initDeployFlow, requireDeployUser, appendDeployWarning, appendDeployStep, deployContext };
