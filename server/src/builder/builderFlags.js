/**
 * builderFlags.js — SiteBuilder production-rollout flag helpers.
 *
 * The canonical Builder flow ships dark behind these flags. Endpoints that
 * would otherwise accept work no running component can complete (dead jobs)
 * must check these and fail closed with 503 instead.
 */

import { isFeatureEnabled } from '../config/featureFlags.js';

export function projectFlowEnabled() {
  return isFeatureEnabled('BUILDER_PROJECT_FLOW');
}

export function dbStorageEnabled() {
  return isFeatureEnabled('BUILDER_DB_STORAGE');
}

export function durableJobsEnabled() {
  return isFeatureEnabled('BUILDER_DURABLE_JOBS');
}

export function isolatedPreviewEnabled() {
  return isFeatureEnabled('BUILDER_ISOLATED_PREVIEW');
}

/** 503 error used when a durable-job endpoint is hit while jobs cannot run. */
export function jobsUnavailableError(reason = 'BUILDER_JOBS_DISABLED') {
  const messages = {
    BUILDER_JOBS_DISABLED: 'Builder generation and deployment jobs are not enabled on this server.',
    BUILDER_WORKER_UNAVAILABLE: 'The builder job worker is not running. Try again shortly.',
  };
  const err = new Error(messages[reason] || messages.BUILDER_JOBS_DISABLED);
  err.status = 503;
  err.code = reason;
  err.expose = true;
  return err;
}
