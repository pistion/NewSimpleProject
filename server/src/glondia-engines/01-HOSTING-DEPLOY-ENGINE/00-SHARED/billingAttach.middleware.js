/**
 * billingAttach.middleware.js - attach billing after Render handoff only.
 *
 * No Render service means no billing and no trial timer.
 */
import { createDeploymentOrder } from '../../../services/deploymentBillingService.js';
import { updateDeploymentRecord, addDeploymentLog } from '../../00-SHARED/deploymentRecordStore.js';
import { writeAuditLog } from '../../../services/auditLogService.js';
import { appendDeployStep, appendDeployWarning } from './deployFlowState.middleware.js';

const BILLABLE_STATUSES = new Set(['building', 'queued', 'deployed', 'live', 'deployed_unverified']);

function isQueuedInRender(d) {
  if (!d || !d.deploymentId || !d.renderServiceId) return false;
  if (!d.renderDeployId && d.buildStatus !== 'queued') return false;
  return BILLABLE_STATUSES.has(d.status);
}

export function attachDeploymentBilling(kind) {
  return async (req, _res, next) => {
    const d = req.deployFlow?.deployment;
    if (
      !d
      || !d.deploymentId
      || d.status === 'failed'
      || d.status === 'ready'
      || d.buildStatus === 'configuration_required'
      || !isQueuedInRender(d)
    ) {
      const skipped = {
        skipped: true,
        reason: 'deployment_not_queued',
        message: 'Billing will start after the deployment is queued in Render.',
      };
      req.deployFlow.billing = skipped;
      req.deployFlow.skippedBilling = skipped;
      appendDeployWarning(req, skipped.message);
      appendDeployStep(req, { name: 'billing_attach', status: 'skipped', message: skipped.reason });
      return next();
    }

    try {
      const billingTierId = req.body?.billingTierId || req.body?.tierId || null;
      appendDeployStep(req, { name: 'billing_attach', status: 'started' });
      await addDeploymentLog(d.deploymentId, 'Billing attach started.', 'info');
      const summary = await createDeploymentOrder({ deployment: d, user: req.user || {}, kind, billingTierId });
      req.deployFlow.billing = summary;
      if (summary?.warning) appendDeployWarning(req, summary.warning);
      appendDeployStep(req, { name: 'billing_attach', status: 'complete', message: summary?.billingTierId || 'tier' });
      await addDeploymentLog(d.deploymentId, `Billing attached (${summary?.billingTierId || 'tier'}).`, 'ok');
    } catch (error) {
      console.error('[billing] attach failed:', error.message);
      try {
        await updateDeploymentRecord(d.deploymentId, {
          paymentStatus: 'billing_error',
          subscriptionStatus: 'billing_error',
          billingErrorMessage: String(error.message || '').slice(0, 500),
          billingErrorAt: new Date().toISOString(),
        });
        await addDeploymentLog(d.deploymentId, `Billing attach failed: ${error.message}`, 'error');
        await writeAuditLog({
          actorUserId: req.user?.id && req.user.id !== 'local-user' ? req.user.id : null,
          action: 'deployment.billing.attach_failed',
          entityType: 'deployment',
          entityId: d.deploymentId,
          status: 'error',
          result: { kind, message: String(error.message || '').slice(0, 300) },
        });
      } catch (recordErr) {
        console.error('[billing] could not record billing error:', recordErr.message);
      }
      const billingError = {
        error: true,
        status: 'billing_error',
        message: 'Deployment started, but billing setup failed. Admin support required.',
        details: String(error.message || '').slice(0, 300),
      };
      req.deployFlow.billing = billingError;
      appendDeployWarning(req, billingError.message);
      appendDeployStep(req, { name: 'billing_attach', status: 'failed', message: billingError.details });
    }
    next();
  };
}

export default { attachDeploymentBilling };
