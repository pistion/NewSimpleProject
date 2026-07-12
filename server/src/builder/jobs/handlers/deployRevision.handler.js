/**
 * deployRevision.handler.js — BUILDER_DEPLOY_REVISION.
 *
 * Stages:
 *   VERIFY_APPROVED_REVISION → VERIFY_ARTIFACT → PUBLISH_AND_DEPLOY →
 *   LINK_DEPLOYMENT → QUEUE_RECONCILIATION → QUEUE_BILLING_ATTACH → COMPLETE
 *
 * Uses the existing Hosting Deploy Engine (generatedSiteToRender pipeline) for
 * controlled source publication and Render service/deploy creation — provider
 * logic is not duplicated here. Provider identity (hosting deployment id,
 * Render service/deploy ids) is persisted on the BuilderDeploymentLink so a
 * retry after partial success reuses the existing resources instead of
 * creating duplicates.
 */

import { join } from 'node:path';
import * as repo from '../../../repositories/builder.repository.js';
import { verifyArtifact } from '../../generation/artifactWriter.js';
import { loadTemplate } from '../../generation/templateLoader.js';
import { run as runGeneratedSiteToRender } from '../../../glondia-engines/01-HOSTING-DEPLOY-ENGINE/pipelines/generatedSiteToRender.pipeline.js';

function permanent(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  err.retryable = false;
  err.details = details;
  return err;
}

export async function run(ctx) {
  const { job } = ctx;
  const payload = job.payload?.data ?? job.payload ?? {};
  const linkId = payload.linkId;

  await ctx.setStage('VERIFY_APPROVED_REVISION');
  const project = await repo.getProjectById(job.projectId);
  if (!project) throw permanent('BUILDER_PROJECT_MISSING', 'Project no longer exists.');
  const revision = await repo.getRevisionById(job.revisionId);
  if (!revision) throw permanent('BUILDER_REVISION_MISSING', 'Revision no longer exists.');
  if (revision.status !== 'APPROVED') {
    throw permanent('BUILDER_REVISION_NOT_APPROVED', `Revision is ${revision.status}; only approved revisions deploy.`);
  }
  const link = linkId ? await repo.getDeploymentLinkById(linkId) : null;
  if (!link) throw permanent('BUILDER_DEPLOYMENT_LINK_MISSING', 'Deployment link no longer exists.');

  await ctx.setStage('VERIFY_ARTIFACT');
  let artifact;
  try {
    artifact = await verifyArtifact(job.revisionId, revision.artifactChecksum);
  } catch (err) {
    throw permanent(err.code || 'BUILDER_ARTIFACT_INVALID', err.message);
  }

  if (project.status === 'DEPLOYMENT_QUEUED') {
    await repo.transitionProject({
      projectId: project.id, from: 'DEPLOYMENT_QUEUED', to: 'BUILDING',
      actorType: 'worker', actorId: ctx.workerId, reason: 'deployment_started', jobId: job.id,
    });
  } else if (project.status !== 'BUILDING') {
    throw permanent('BUILDER_ILLEGAL_TRANSITION', `Project is ${project.status}; expected DEPLOYMENT_QUEUED or BUILDING.`);
  }

  // Provider idempotency: a retry after the engine already ran reuses the
  // recorded hosting deployment instead of publishing/creating again.
  let hostingRecord = null;
  if (!link.hostingDeploymentId) {
    await ctx.setStage('PUBLISH_AND_DEPLOY');
    await ctx.renewLease();

    const template = project.templateId ? await loadTemplate(project.templateId).catch(() => null) : null;
    const meta = template?.metadata || {};
    hostingRecord = await runGeneratedSiteToRender({
      userId: project.userId,
      siteId: link.deploymentId,
      projectId: project.id,
      siteName: project.name,
      slug: project.slug,
      source: 'builder-revision',
      sourceReference: `builder/${revision.id}`,
      generatedSite: {
        siteDir: join(artifact.artifactDir, 'files'),
        framework: meta.framework || 'vite',
        buildCommand: meta.buildCommand || 'npm run build',
        publishDirectory: meta.publishDirectory || 'dist',
        siteProfile: {
          siteId: link.deploymentId,
          userId: project.userId,
          siteName: project.name,
          slug: project.slug,
          revisionId: revision.id,
          artifactChecksum: revision.artifactChecksum,
        },
      },
      // Durable jobs replace the engine's process-local billing/polling.
      skipBillingAttach: true,
      skipPostDeployPolling: true,
    }, { userId: project.userId });

    await ctx.setStage('LINK_DEPLOYMENT');
    await repo.updateDeploymentLink(link.id, {
      hostingDeploymentId: hostingRecord.deploymentId,
      renderServiceId: hostingRecord.renderServiceId || null,
      renderDeployId: hostingRecord.renderDeployId || null,
      liveUrl: hostingRecord.liveUrl || null,
      status: hostingRecord.platformDeployed ? 'BUILDING' : 'BLOCKED',
      errorMessage: hostingRecord.errorMessage || null,
      metadata: {
        artifactChecksum: revision.artifactChecksum,
        providerStatus: hostingRecord.providerStatus || null,
        hostingStatus: hostingRecord.status || null,
      },
    });
  } else {
    await ctx.emit('Reusing previously created hosting deployment.', { hostingDeploymentId: link.hostingDeploymentId });
  }

  const current = await repo.getDeploymentLinkById(link.id);
  if (!current.hostingDeploymentId) {
    throw permanent('DEPLOY_HANDOFF_FAILED', 'Hosting engine did not create a deployment record.');
  }
  if (current.status === 'BLOCKED') {
    // Handoff blocked (missing provider configuration or publish failure).
    // Preserve the record and fail visibly; retry is safe once config exists.
    throw permanent('DEPLOY_HANDOFF_BLOCKED', current.errorMessage || 'Deployment handoff was blocked.', {
      hostingDeploymentId: current.hostingDeploymentId,
    });
  }

  await ctx.setStage('QUEUE_RECONCILIATION');
  await repo.enqueueJob({
    projectId: project.id,
    revisionId: revision.id,
    jobType: 'DEPLOYMENT_RECONCILE',
    idempotencyKey: `reconcile:${current.deploymentId}`,
    payload: { linkId: current.id, hostingDeploymentId: current.hostingDeploymentId },
    maxAttempts: Number(process.env.BUILDER_RECONCILE_MAX_ATTEMPTS || 40),
    delayMs: 15_000,
  });

  await ctx.setStage('QUEUE_BILLING_ATTACH');
  await repo.enqueueJob({
    projectId: project.id,
    revisionId: revision.id,
    jobType: 'BILLING_ATTACH',
    idempotencyKey: `billing:${current.deploymentId}`,
    payload: { linkId: current.id, hostingDeploymentId: current.hostingDeploymentId, userId: project.userId },
    maxAttempts: Number(process.env.BUILDER_BILLING_MAX_ATTEMPTS || 8),
    delayMs: 5_000,
  });

  return {
    deploymentId: current.deploymentId,
    hostingDeploymentId: current.hostingDeploymentId,
    renderServiceId: current.renderServiceId,
    liveUrl: current.liveUrl,
  };
}

export async function onPermanentFailure(ctx, error) {
  const { job } = ctx;
  const payload = job.payload?.data ?? job.payload ?? {};
  if (payload.linkId) {
    await repo.updateDeploymentLink(payload.linkId, {
      status: 'FAILED',
      errorMessage: error.message || 'Deployment failed.',
    }).catch(() => {});
  }
  const project = await repo.getProjectById(job.projectId);
  if (project && ['DEPLOYMENT_QUEUED', 'BUILDING'].includes(project.status)) {
    await repo.transitionProject({
      projectId: job.projectId, from: project.status, to: 'DEPLOYMENT_FAILED',
      actorType: 'worker', actorId: ctx.workerId, reason: error.code || 'deployment_failed', jobId: job.id,
    });
  }
}
