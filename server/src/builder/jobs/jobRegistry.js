/**
 * jobRegistry.js — maps BuilderJob.jobType to its handler module.
 *
 * A handler is `{ run(ctx), onPermanentFailure(ctx, error) }`.
 * ctx: { job, workerId, renewLease(), setStage(stage, details?), emit(message, details?, level?) }
 */

import * as generateRevision from './handlers/generateRevision.handler.js';

const REGISTRY = new Map([
  ['BUILDER_GENERATE_REVISION', generateRevision],
]);

export function registerJobHandler(jobType, handler) {
  REGISTRY.set(jobType, handler);
}

export function getJobHandler(jobType) {
  return REGISTRY.get(jobType) || null;
}

export function registeredJobTypes() {
  return [...REGISTRY.keys()];
}
