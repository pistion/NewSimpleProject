/**
 * deploymentStream.controller.js
 *
 * HTTP/SSE setup only — business logic lives in deploymentStream.service.js.
 */

import deploymentStreamService from '../services/deploymentStream.service.js';

async function streamDeploymentLogs(req, res, next) {
  try {
    await deploymentStreamService.streamDeploymentLogs(req, res);
  } catch (error) {
    next(error);
  }
}

export default { streamDeploymentLogs };
