/**
 * renderPayloadBuilder.stage.js - 04-RENDER-PAYLOAD-MOUNTAIN
 *
 * Builds the normalized Render input object used by the deploy stage.
 */

import { inferServiceType, renderSafeName } from '../../00-SHARED/renderCommon.js';

export function buildRenderPayload(input = {}) {
  const serviceName = renderSafeName(input.serviceName || input.name || 'glondia-site');
  const serviceType = inferServiceType(input);
  return {
    ...input,
    serviceName,
    serviceType,
    repoUrl: input.repoUrl || input.repositoryUrl || input.sourceRepository || input.sourceReference || '',
    repositoryUrl: input.repositoryUrl || input.repoUrl || input.sourceRepository || input.sourceReference || '',
    branch: input.branch || input.productionBranch || 'main',
    rootDirectory: input.rootDirectory || input.rootDir || '',
    buildCommand: input.buildCommand || null,
    outputDirectory: input.outputDirectory || input.publishDirectory || null,
    publishDirectory: input.publishDirectory || input.outputDirectory || null,
    startCommand: input.startCommand || null,
    runtime: input.runtime || input.env || null,
    // Launch-first rule: default to the free plan unless an upstream caller
    // (admin override) explicitly set one. Paid plans apply after payment.
    plan: input.plan || process.env.RENDER_INITIAL_PLAN || 'free',
    region: input.region || 'oregon',
  };
}

export async function runStage(context) {
  context.render.payload = buildRenderPayload({
    ...(context.input || {}),
    serviceType: context.project?.serviceType || context.input?.serviceType,
    framework: context.project?.framework || context.input?.framework,
    buildCommand: context.project?.buildCommand || context.input?.buildCommand,
    publishDirectory: context.project?.publishDirectory || context.input?.publishDirectory,
    startCommand: context.project?.startCommand || context.input?.startCommand,
    runtime: context.project?.runtime || context.input?.runtime,
    repoUrl: context.source?.repoUrl || context.input?.repoUrl,
    branch: context.source?.branch || context.input?.branch,
    rootDirectory: context.source?.rootDir || context.input?.rootDirectory,
  });
  return context;
}
