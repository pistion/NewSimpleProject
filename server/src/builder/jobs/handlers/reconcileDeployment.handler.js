/**
 * reconcileDeployment.handler.js — DEPLOYMENT_RECONCILE.
 *
 * Durable replacement for the process-local post-deploy poller: reads the
 * hosting deployment record, refreshes provider status when possible, maps it
 * to the canonical Builder state, and either settles (LIVE / DEPLOYMENT_FAILED
 * / SUSPENDED) or retries with backoff as its next-check time. Restart-safe:
 * everything it needs lives in the job payload and the stores.
 */

import * as repo from '../../../repositories/builder.repository.js';
import { readHostingStore } from '../../../services/hostingStore.js';
import renderApiService from '../../../services/renderApiService.js';
import deploymentStatusService from '../../../services/deploymentStatusService.js';

const LIVE_STATUSES = new Set(['live', 'deployed', 'deployed_unverified']);
const FAILED_STATUSES = new Set(['failed', 'deleted', 'payment_expired']);

function permanent(code, message) {
  const err = new Error(message);
  err.code = code;
  err.retryable = false;
  return err;
}

function retryable(code, message) {
  const err = new Error(message);
  err.code = code;
  err.retryable = true;
  return err;
}

async function findHostingDeployment(hostingDeploymentId) {
  const store = await readHostingStore();
  return (store.deployments || []).find(
    (d) => d.deploymentId === hostingDeploymentId || d.id === hostingDeploymentId,
  ) || null;
}

async function settleProject(ctx, projectId, target, reason) {
  const project = await repo.getProjectById(projectId);
  if (!project) return;
  if (project.status === target) return;
  if (['BUILDING', 'DEPLOYMENT_QUEUED'].includes(project.status)
    || (target === 'SUSPENDED' && project.status === 'LIVE')
    || (target === 'LIVE' && project.status === 'BILLING_SETUP_FAILED')) {
    await repo.transitionProject({
      projectId, from: project.status, to: target,
      actorType: 'worker', actorId: ctx.workerId, reason, jobId: ctx.job.id,
    });
  }
}

export async function run(ctx) {
  const { job } = ctx;
  const payload = job.payload?.data ?? job.payload ?? {};
  const { hostingDeploymentId, linkId } = payload;
  if (!hostingDeploymentId) throw permanent('RECONCILE_PAYLOAD_INVALID', 'hostingDeploymentId is required.');

  await ctx.setStage('READ_DEPLOYMENT');
  let deployment = await findHostingDeployment(hostingDeploymentId);
  if (!deployment) throw permanent('RECONCILE_DEPLOYMENT_MISSING', 'Hosting deployment record not found.');

  // Refresh from the provider when we can; otherwise reconcile from the
  // stored record alone (a webhook/dashboard refresh may have advanced it).
  if (!LIVE_STATUSES.has(deployment.status) && !FAILED_STATUSES.has(deployment.status)
    && deployment.status !== 'suspended' && renderApiService.configured()) {
    await ctx.setStage('REFRESH_PROVIDER');
    try {
      const refreshed = await deploymentStatusService.refreshDeployment(deployment);
      if (refreshed) deployment = refreshed;
    } catch (err) {
      throw retryable('RECONCILE_PROVIDER_ERROR', `Provider refresh failed: ${err.message}`);
    }
  }

  await ctx.setStage('MAP_STATE');
  const status = String(deployment.status || '').toLowerCase();

  if (LIVE_STATUSES.has(status)) {
    if (linkId) {
      await repo.updateDeploymentLink(linkId, {
        status: 'LIVE',
        liveUrl: deployment.liveUrl || null,
        renderServiceId: deployment.renderServiceId || null,
        renderDeployId: deployment.renderDeployId || null,
        metadata: { providerStatus: deployment.providerStatus || status, reconciledAt: new Date().toISOString() },
      });
    }
    await settleProject(ctx, job.projectId, 'LIVE', 'deployment_live');
    return { settled: 'LIVE', hostingStatus: status };
  }

  if (FAILED_STATUSES.has(status)) {
    if (linkId) {
      await repo.updateDeploymentLink(linkId, {
        status: 'FAILED',
        errorMessage: deployment.errorMessage || `Provider reported ${status}.`,
        metadata: { providerStatus: deployment.providerStatus || status, reconciledAt: new Date().toISOString() },
      });
    }
    await settleProject(ctx, job.projectId, 'DEPLOYMENT_FAILED', `deployment_${status}`);
    return { settled: 'FAILED', hostingStatus: status };
  }

  if (status === 'suspended') {
    if (linkId) await repo.updateDeploymentLink(linkId, { status: 'SUSPENDED' });
    await settleProject(ctx, job.projectId, 'SUSPENDED', 'deployment_suspended');
    return { settled: 'SUSPENDED', hostingStatus: status };
  }

  // Still building/queued — the retry backoff is the next-check time.
  throw retryable('RECONCILE_PENDING', `Deployment ${hostingDeploymentId} still ${status || 'in progress'}.`);
}

export async function onPermanentFailure(ctx, error) {
  // Attempts exhausted while the deploy never settled: surface it honestly.
  const { job } = ctx;
  const payload = job.payload?.data ?? job.payload ?? {};
  if (payload.linkId) {
    await repo.updateDeploymentLink(payload.linkId, {
      status: 'UNRESOLVED',
      errorMessage: `Reconciliation gave up: ${error.message}`,
    }).catch(() => {});
  }
}
