/**
 * jobRegistry.js — maps BuilderJob.jobType to its handler module.
 *
 * A handler is `{ run(ctx), onPermanentFailure(ctx, error) }`.
 * ctx: { job, workerId, renewLease(), setStage(stage, details?), emit(message, details?, level?) }
 */

import * as generateRevision from './handlers/generateRevision.handler.js';
import * as deployRevision from './handlers/deployRevision.handler.js';
import * as attachBilling from './handlers/attachBilling.handler.js';
import * as reconcileDeployment from './handlers/reconcileDeployment.handler.js';

const REGISTRY = new Map([
  ['BUILDER_GENERATE_REVISION', generateRevision],
  ['BUILDER_DEPLOY_REVISION', deployRevision],
  ['BILLING_ATTACH', attachBilling],
  ['DEPLOYMENT_RECONCILE', reconcileDeployment],
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
