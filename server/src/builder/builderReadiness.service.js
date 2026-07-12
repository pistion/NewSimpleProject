/**
 * builderReadiness.service.js — /readyz checks for the Builder rollout.
 *
 * Ready means: the database answers, the Builder tables exist, and every
 * ENABLED builder feature has the configuration and running components it
 * needs. Disabled features are not checked (they cannot accept work anyway).
 */

import { prisma } from '../services/db.js';
import { hasFreshHeartbeat } from '../repositories/builder.repository.js';
import { durableJobsEnabled, isolatedPreviewEnabled } from './builderFlags.js';

const REQUIRED_TABLES = [
  'builder_projects',
  'builder_revisions',
  'builder_jobs',
  'builder_job_events',
  'builder_preview_grants',
  'builder_deployment_links',
  'builder_state_transitions',
  'builder_worker_heartbeats',
];

export function workerHeartbeatMaxAgeMs() {
  return Number(process.env.BUILDER_WORKER_HEARTBEAT_MAX_AGE_MS || 45_000);
}

/** True when at least one worker heartbeat is fresh. */
export async function hasFreshWorkerHeartbeat() {
  try {
    return await hasFreshHeartbeat(workerHeartbeatMaxAgeMs());
  } catch {
    return false;
  }
}

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkBuilderTables() {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    const have = new Set(rows.map((r) => r.name));
    const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
    return missing.length ? { ok: false, missing } : { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function checkPreviewConfig() {
  const missing = [];
  if (!process.env.BUILDER_PREVIEW_ORIGIN) missing.push('BUILDER_PREVIEW_ORIGIN');
  if (!process.env.PREVIEW_SIGNING_SECRET && !process.env.JWT_SECRET) missing.push('PREVIEW_SIGNING_SECRET');
  if (process.env.NODE_ENV === 'production' && !process.env.DASHBOARD_ORIGIN) missing.push('DASHBOARD_ORIGIN');
  return missing.length ? { ok: false, missing } : { ok: true };
}

async function checkWorker() {
  const fresh = await hasFreshWorkerHeartbeat();
  return fresh ? { ok: true } : { ok: false, error: 'no fresh builder worker heartbeat' };
}

/**
 * Full readiness snapshot. `ready` is the AND of every applicable check.
 */
export async function readinessSnapshot() {
  const checks = {
    database: await checkDatabase(),
    builderTables: await checkBuilderTables(),
  };
  if (durableJobsEnabled()) checks.worker = await checkWorker();
  if (isolatedPreviewEnabled()) checks.previewConfig = checkPreviewConfig();

  const ready = Object.values(checks).every((c) => c.ok);
  return { ready, checks, timestamp: new Date().toISOString() };
}
