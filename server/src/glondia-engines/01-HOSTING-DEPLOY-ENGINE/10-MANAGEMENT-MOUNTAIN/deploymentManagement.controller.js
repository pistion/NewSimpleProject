/**
 * deploymentManagement.controller.js - read/control deployed sites only.
 */
import deploymentService from '../../../services/deploymentService.js';
import { checkDeployReadiness, getZipDeployConfigStatus } from '../00-SHARED/deployReadiness.service.js';

export async function getSettings(_req, res, next) {
  try {
    const [config, readiness] = await Promise.all([
      Promise.resolve(getZipDeployConfigStatus()),
      checkDeployReadiness().catch(() => null),
    ]);
    res.ok({ ...config, readiness });
  } catch (error) {
    next(error);
  }
}

export async function getDeployment(req, res, next) {
  try {
    res.ok(await deploymentService.getDeployment(req.params.deploymentId));
  } catch (error) {
    next(error);
  }
}

export async function getStatus(req, res, next) {
  try {
    res.ok(await deploymentService.getStatus(req.params.deploymentId));
  } catch (error) {
    next(error);
  }
}

export async function redeploy(req, res, next) {
  try {
    res.status(202).json({
      data: await deploymentService.redeploy(req.params.deploymentId, req.body || {}),
      message: 'Redeploy started.',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function redeployClearCache(req, res, next) {
  try {
    res.status(202).json({
      data: await deploymentService.redeploy(req.params.deploymentId, { ...req.body, clearCache: 'clear' }),
      message: 'Redeploy with cache clear started.',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyUrl(req, res, next) {
  try {
    res.ok(await deploymentService.verifyUrl(req.params.deploymentId));
  } catch (error) {
    next(error);
  }
}

export async function getLogs(req, res, next) {
  try {
    res.ok(await deploymentService.getLogs(req.params.deploymentId));
  } catch (error) {
    next(error);
  }
}

export default { getSettings, getDeployment, getStatus, redeploy, redeployClearCache, verifyUrl, getLogs };
