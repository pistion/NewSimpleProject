import deploymentService from '../../../services/deploymentService.js';
import { getZipDeployConfigStatus, validateZipSite } from '../pipelines/base64ZipToRender.pipeline.js';
import { run as runGithubLinkToRender } from '../pipelines/githubLinkToRender.pipeline.js';
import { run as runGeneratedSiteToRender } from '../pipelines/generatedSiteToRender.pipeline.js';
import { run as runZipToRender } from '../pipelines/zipToRender.pipeline.js';
import { createDeploymentOrder } from '../../../services/deploymentBillingService.js';
import { updateDeploymentRecord, addDeploymentLog } from '../../00-SHARED/deploymentRecordStore.js';
import { writeAuditLog } from '../../../services/auditLogService.js';
import { checkDeployReadiness } from '../../../services/deployReadinessService.js';

// A deployment is "queued in Render" — and therefore billable — only once it has
// a real Render service + deploy id and a live-track status.
const BILLABLE_STATUSES = new Set(['building', 'queued', 'deployed', 'live', 'deployed_unverified']);

function isQueuedInRender(d) {
  if (!d.renderServiceId || !d.renderDeployId) return false;
  if (BILLABLE_STATUSES.has(d.status)) return true;
  if (d.buildStatus === 'queued' && d.renderServiceId) return true;
  return false;
}

/**
 * Attach a pending deployment billing order — ONLY after the deploy actually
 * reached Render (real service + deploy id). Deployment always happens first;
 * billing must never block or corrupt the deploy. Returns a billing summary, a
 * `{ skipped }` object (not yet billable), or a `{ error }` object (billing
 * setup failed but the deploy is live).
 */
async function attachBilling(deployment, req, kind) {
  if (!deployment || deployment.deploymentId == null) {
    return { skipped: true, reason: 'no_deployment', message: 'No deployment record to bill.' };
  }
  // Skip billing for anything that did not produce a queued Render service:
  // failed, ready/configuration_required, or missing the Render handoff.
  if (
    deployment.status === 'failed'
    || deployment.status === 'ready'
    || deployment.buildStatus === 'configuration_required'
    || !isQueuedInRender(deployment)
  ) {
    return {
      skipped: true,
      reason: 'deployment_not_queued',
      message: 'Billing will start after the deployment is queued in Render.',
    };
  }

  try {
    const billingTierId = req.body?.billingTierId || req.body?.tierId || null;
    await addDeploymentLog(deployment.deploymentId, 'Billing attach started.', 'info');
    const summary = await createDeploymentOrder({ deployment, user: req.user || {}, kind, billingTierId });
    await addDeploymentLog(deployment.deploymentId, `Billing attached (${summary?.billingTierId || 'tier'}).`, 'ok');
    return summary;
  } catch (error) {
    // Billing setup failed AFTER the deploy reached Render — make it visible on
    // the record + audit, but never fail the deploy response.
    console.error('[billing] Failed to attach deployment billing order:', error.message);
    try {
      await updateDeploymentRecord(deployment.deploymentId, {
        paymentStatus: 'billing_error',
        subscriptionStatus: 'billing_error',
        billingErrorMessage: String(error.message || '').slice(0, 500),
        billingErrorAt: new Date().toISOString(),
      });
      await addDeploymentLog(deployment.deploymentId, `Billing attach failed: ${error.message}`, 'error');
      await writeAuditLog({
        actorUserId: req.user?.id && req.user.id !== 'local-user' ? req.user.id : null,
        action: 'deployment.billing.attach_failed',
        entityType: 'deployment',
        entityId: deployment.deploymentId,
        status: 'error',
        result: { kind, message: String(error.message || '').slice(0, 300) },
      });
    } catch (recordErr) {
      console.error('[billing] Could not record billing error:', recordErr.message);
    }
    return {
      error: true,
      status: 'billing_error',
      message: 'Deployment started, but billing setup failed. Admin support required.',
      details: String(error.message || '').slice(0, 300),
    };
  }
}

/** Collect user-facing warnings from the deployment record + billing result. */
function collectWarnings(deployment, billing) {
  const warnings = [];
  if (deployment?.status === 'ready' || deployment?.buildStatus === 'configuration_required') {
    warnings.push(deployment.errorMessage || 'Deployment prepared but not handed off to Render — configuration required.');
  }
  if (Array.isArray(deployment?.deployModeWarnings)) warnings.push(...deployment.deployModeWarnings);
  if (billing?.error) warnings.push(billing.message);
  if (billing?.warning) warnings.push(billing.warning);
  return warnings;
}

/** Pipeline context: only an admin may force a non-free initial Render plan. */
function deployContext(req) {
  return { userId: req.user?.id, isAdmin: req.user?.role === 'admin' };
}

const hostingDeployController = {
  createDeployment: async (req, res, next) => {
    try {
      const deployment = await deploymentService.createDeployment(req.body || {}, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'Deployment session started.', requestId: req.id });
    } catch (error) {
      next(error);
    }
  },

  createRenderDeployment: async (req, res, next) => {
    try {
      const deployment = await deploymentService.createRenderDeployment(req.body || {}, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'Render deployment accepted.', requestId: req.id });
    } catch (error) {
      if (!error.stage) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('repo') || msg.includes('github')) error.stage = 'github_repo_validate';
        else if (msg.includes('render') && msg.includes('service')) error.stage = 'render_service_create';
        else if (msg.includes('render') && msg.includes('deploy')) error.stage = 'render_deploy_trigger';
        else error.stage = 'render_service_create';
      }
      next(error);
    }
  },

  createGithubDeployment: async (req, res, next) => {
    try {
      if (!req.user?.id) return res.error('UNAUTHENTICATED', 'A valid session is required to deploy.', 401);
      const repoUrl = req.body?.repoUrl || req.body?.repositoryUrl || req.body?.sourceReference;
      if (!repoUrl || !String(repoUrl).trim()) {
        const err = new Error('A GitHub repository URL is required.');
        err.status = 400; err.code = 'GITHUB_REPO_REQUIRED'; err.stage = 'github_repo_validate'; err.expose = true;
        throw err;
      }
      const deployment = await runGithubLinkToRender(req.body || {}, deployContext(req));
      const billing = await attachBilling(deployment, req, 'github');
      res.status(202).json({
        data: { ...deployment, billing },
        billing,
        warnings: collectWarnings(deployment, billing),
        message: 'GitHub deployment session started.',
        requestId: req.id,
      });
    } catch (error) {
      if (!error.stage) error.stage = 'github_repo_validate';
      next(error);
    }
  },

  createZipDeployment: async (req, res, next) => {
    try {
      if (!req.user?.id) return res.error('UNAUTHENTICATED', 'A valid session is required to deploy.', 401);
      const file = req.file || req.files?.siteZip?.[0] || req.files?.zip?.[0] || req.files?.file?.[0];
      if (!file?.buffer) {
        const err = new Error('A ZIP file is required (field zip, file, or siteZip).');
        err.status = 400; err.code = 'ZIP_MISSING_FILE'; err.stage = 'zip_upload'; err.expose = true;
        throw err;
      }
      const deployment = await runZipToRender({ file, fields: req.body || {} }, deployContext(req));
      const billing = await attachBilling(deployment, req, 'zip');
      res.status(202).json({
        data: { ...deployment, billing },
        billing,
        warnings: collectWarnings(deployment, billing),
        message: 'ZIP deployment session started.',
        requestId: req.id,
      });
    } catch (error) {
      if (!error.stage) error.stage = 'zip_upload';
      next(error);
    }
  },

  createGeneratedSiteDeployment: async (req, res, next) => {
    try {
      const deployment = await runGeneratedSiteToRender(req.body || {}, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'Generated site deployment session started.', requestId: req.id });
    } catch (error) {
      if (!error.stage) error.stage = 'generated_site_package';
      next(error);
    }
  },

  getSettings: async (_req, res, next) => {
    try {
      const [config, readiness] = await Promise.all([
        Promise.resolve(getZipDeployConfigStatus()),
        checkDeployReadiness().catch(() => null),
      ]);
      res.ok({ ...config, readiness });
    } catch (error) {
      next(error);
    }
  },

  validateZipDeployment: async (req, res, next) => {
    try {
      const file = req.file || req.files?.siteZip?.[0] || req.files?.zip?.[0] || req.files?.file?.[0];
      if (!file) {
        const error = new Error('siteZip file is required.');
        error.status = 400;
        error.code = 'ZIP_MISSING_FILE';
        error.stage = 'zip_upload';
        throw error;
      }
      res.ok(await validateZipSite({
        fileName: file.originalname,
        fileBase64: file.buffer.toString('base64'),
      }));
    } catch (error) {
      if (!error.stage) error.stage = 'zip_validation';
      next(error);
    }
  },

  getDeployment: async (req, res, next) => {
    try {
      res.ok(await deploymentService.getDeployment(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },

  getStatus: async (req, res, next) => {
    try {
      res.ok(await deploymentService.getStatus(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },

  redeploy: async (req, res, next) => {
    try {
      res.status(202).json({
        data: await deploymentService.redeploy(req.params.deploymentId, req.body || {}),
        message: 'Redeploy started.',
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  },

  redeployClearCache: async (req, res, next) => {
    try {
      res.status(202).json({
        data: await deploymentService.redeploy(req.params.deploymentId, { ...req.body, clearCache: 'clear' }),
        message: 'Redeploy with cache clear started.',
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  },

  verifyUrl: async (req, res, next) => {
    try {
      res.ok(await deploymentService.verifyUrl(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },

  getLogs: async (req, res, next) => {
    try {
      res.ok(await deploymentService.getLogs(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },
};

export default hostingDeployController;
