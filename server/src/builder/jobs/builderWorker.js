/**
 * builderWorker.js — the durable Builder job worker.
 *
 * Claims QUEUED/RETRY jobs with a database lease, renews the lease while a
 * handler runs, retries transient failures with exponential backoff, recovers
 * expired leases from crashed workers, heartbeats for /readyz, and shuts down
 * gracefully (finishes or releases the in-flight job).
 *
 * Every effect is written to the database first — a restart at any point
 * resumes from durable state, never from process memory.
 */

import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as repo from '../../repositories/builder.repository.js';
import { workspaceRootDir } from '../generation/artifactWriter.js';
import { getJobHandler, registeredJobTypes } from './jobRegistry.js';

const RETRYABLE_CODES = new Set([
  'AI_RATE_LIMITED', 'AI_PROVIDER_ERROR', 'NETWORK_TIMEOUT', 'DB_BUSY', 'FS_TEMPORARY',
]);
const RETRYABLE_MESSAGE_RE = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|EBUSY|SQLITE_BUSY|database is locked|fetch failed/i;

export function isRetryableError(err) {
  if (!err) return false;
  if (err.retryable === true) return true;
  if (err.retryable === false) return false;
  if (RETRYABLE_CODES.has(err.code)) return true;
  const status = Number(err.status || err.statusCode || 0);
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  return RETRYABLE_MESSAGE_RE.test(String(err.message || ''));
}

export function backoffMs(attempt, baseMs = Number(process.env.BUILDER_JOB_BACKOFF_BASE_MS || 2000)) {
  const capped = Math.min(attempt, 6);
  const jitter = Math.floor(Math.random() * baseMs * 0.25);
  return baseMs * 2 ** Math.max(0, capped - 1) + jitter;
}

export function createBuilderWorker(options = {}) {
  const workerId = options.workerId || `worker-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const pollMs = Number(options.pollMs || process.env.BUILDER_WORKER_POLL_MS || 1000);
  const leaseMs = Number(options.leaseMs || process.env.BUILDER_JOB_LEASE_MS || 60_000);
  const heartbeatMs = Number(options.heartbeatMs || process.env.BUILDER_WORKER_HEARTBEAT_MS || 10_000);
  const recoverEveryMs = Number(options.recoverEveryMs || process.env.BUILDER_LEASE_RECOVERY_MS || 30_000);
  const log = options.logger || ((...args) => console.log('[builder-worker]', ...args));

  let running = false;
  let stopping = false;
  let pollTimer = null;
  let heartbeatTimer = null;
  let cleanupTimer = null;
  let inFlight = null; // Promise for the currently-running job

  async function heartbeat() {
    try {
      await repo.upsertWorkerHeartbeat({
        workerId,
        info: { pid: process.pid, host: hostname(), jobTypes: registeredJobTypes() },
      });
    } catch (err) {
      log('heartbeat failed:', err.message);
    }
  }

  // Stateless periodic hygiene: expired preview grants and orphaned job
  // workspaces (a crash between CREATE_WORKSPACE and the finally-cleanup).
  // Runs at startup and hourly, so it survives restarts by construction.
  async function cleanup() {
    try {
      const removedGrants = await repo.deleteExpiredPreviewGrants();
      let removedWorkspaces = 0;
      const root = workspaceRootDir();
      const maxAgeMs = Number(process.env.BUILDER_WORKSPACE_MAX_AGE_MS || 24 * 60 * 60 * 1000);
      const entries = await readdir(root).catch(() => []);
      for (const entry of entries) {
        const dir = join(root, entry);
        const stats = await stat(dir).catch(() => null);
        if (stats && Date.now() - stats.mtimeMs > maxAgeMs) {
          await rm(dir, { recursive: true, force: true }).catch(() => {});
          removedWorkspaces += 1;
        }
      }
      if (removedGrants || removedWorkspaces) {
        log(`cleanup: ${removedGrants} expired grants, ${removedWorkspaces} stale workspaces removed`);
      }
    } catch (err) {
      log('cleanup failed:', err.message);
    }
  }

  let lastRecovery = 0;
  async function maybeRecoverLeases() {
    if (Date.now() - lastRecovery < recoverEveryMs) return;
    lastRecovery = Date.now();
    try {
      const { retried, failed } = await repo.recoverExpiredLeases();
      if (retried || failed) log(`lease recovery: ${retried} retried, ${failed} failed permanently`);
    } catch (err) {
      log('lease recovery failed:', err.message);
    }
  }

  async function runJob(job) {
    const handler = getJobHandler(job.jobType);
    if (!handler) {
      await repo.failJob({ jobId: job.id, workerId, errorCode: 'UNKNOWN_JOB_TYPE', errorMessage: `No handler for ${job.jobType}.` });
      await repo.appendJobEvent({ jobId: job.id, level: 'error', message: `No handler registered for ${job.jobType}.` });
      return;
    }

    let renewTimer = setInterval(() => {
      repo.renewJobLease({ jobId: job.id, workerId, leaseMs }).then((ok) => {
        if (!ok) log(`lost lease on job ${job.id}`);
      }).catch(() => {});
    }, Math.max(1000, Math.floor(leaseMs / 3)));

    const ctx = {
      job,
      workerId,
      renewLease: () => repo.renewJobLease({ jobId: job.id, workerId, leaseMs }),
      setStage: async (stage, details) => {
        await repo.updateJobStage({ jobId: job.id, workerId, stage, details });
        await repo.appendJobEvent({ jobId: job.id, stage, message: `Stage ${stage}.`, details });
      },
      emit: (message, details = {}, level = 'info') =>
        repo.appendJobEvent({ jobId: job.id, stage: null, level, message, details }),
    };

    try {
      const result = await handler.run(ctx);
      await repo.completeJob({ jobId: job.id, workerId, result: result || {} });
      await repo.appendJobEvent({ jobId: job.id, stage: 'complete', message: 'Job completed.' });
    } catch (err) {
      const retryable = isRetryableError(err) && job.attempt < job.maxAttempts;
      log(`job ${job.id} (${job.jobType}) attempt ${job.attempt} failed${retryable ? ', will retry' : ' permanently'}:`, err.message);
      if (retryable) {
        const delay = backoffMs(job.attempt);
        await repo.retryJob({ jobId: job.id, workerId, errorCode: err.code || 'RETRYABLE_ERROR', errorMessage: err.message, backoffMs: delay });
        await repo.appendJobEvent({
          jobId: job.id, level: 'warn',
          message: `Attempt ${job.attempt} failed; retrying in ${Math.round(delay / 1000)}s.`,
          details: { errorCode: err.code || 'RETRYABLE_ERROR' },
        });
      } else {
        await repo.failJob({ jobId: job.id, workerId, errorCode: err.code || 'JOB_FAILED', errorMessage: err.message });
        await repo.appendJobEvent({
          jobId: job.id, level: 'error',
          message: 'Job failed permanently.',
          details: { errorCode: err.code || 'JOB_FAILED' },
        });
        if (typeof handler.onPermanentFailure === 'function') {
          await handler.onPermanentFailure(ctx, err).catch((hookErr) => {
            log(`onPermanentFailure hook for ${job.id} failed:`, hookErr.message);
          });
        }
      }
    } finally {
      clearInterval(renewTimer);
    }
  }

  async function pollOnce() {
    if (stopping) return;
    await maybeRecoverLeases();
    let job = null;
    try {
      job = await repo.claimNextJob({ workerId, jobTypes: registeredJobTypes(), leaseMs });
    } catch (err) {
      log('claim failed:', err.message);
    }
    if (job) {
      inFlight = runJob(job).finally(() => { inFlight = null; });
      await inFlight;
      // Immediately look for more work after finishing a job.
      if (!stopping) schedule(0);
      return;
    }
    schedule(pollMs);
  }

  function schedule(delay) {
    if (stopping) return;
    pollTimer = setTimeout(() => { pollOnce().catch((err) => log('poll error:', err.message)); }, delay);
    if (typeof pollTimer.unref === 'function') pollTimer.unref();
  }

  return {
    workerId,
    async start() {
      if (running) return;
      running = true;
      stopping = false;
      // Startup recovery: crashed workers leave RUNNING jobs with dead leases.
      try {
        const { retried, failed } = await repo.recoverExpiredLeases();
        if (retried || failed) log(`startup recovery: ${retried} retried, ${failed} failed permanently`);
      } catch (err) {
        log('startup recovery failed:', err.message);
      }
      await heartbeat();
      heartbeatTimer = setInterval(heartbeat, heartbeatMs);
      if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
      cleanup();
      cleanupTimer = setInterval(cleanup, Number(process.env.BUILDER_CLEANUP_INTERVAL_MS || 60 * 60 * 1000));
      if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
      schedule(0);
      log(`started as ${workerId} (poll ${pollMs}ms, lease ${leaseMs}ms)`);
    },
    async stop({ drainTimeoutMs = 30_000 } = {}) {
      stopping = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (cleanupTimer) clearInterval(cleanupTimer);
      if (inFlight) {
        // Let the in-flight job finish; its lease protects it if we're killed.
        await Promise.race([
          inFlight,
          new Promise((resolve) => setTimeout(resolve, drainTimeoutMs)),
        ]);
      }
      try { await repo.deleteWorkerHeartbeat(workerId); } catch { /* shutting down */ }
      running = false;
      log(`stopped ${workerId}`);
    },
  };
}
