/**
 * deploymentPostDeployPoller.js
 *
 * After a ZIP/GitHub deploy starts, Render keeps building in the background.
 * The pipeline returns immediately with status `building`/`queued`, so without
 * a poller the record never advances to live/failed until the user opens the
 * dashboard (which triggers an on-demand refresh).
 *
 * This module starts a safe, non-blocking background polling loop that calls
 * deploymentStatusService.refreshDeployment() until the deployment reaches a
 * terminal status or times out. It is intentionally best-effort: any error is
 * logged and the loop continues/stops gracefully — it must never crash the
 * process or affect the deploy response.
 */

import deploymentStatusService from './deploymentStatusService.js';
import renderApiService from './renderApiService.js';
import { readHostingStore } from './hostingStore.js';
import { addDeploymentLog } from '../glondia-engines/00-SHARED/deploymentRecordStore.js';

// Statuses that end polling — the deployment has settled.
const TERMINAL_STATUSES = new Set([
  'live',
  'deployed_unverified',
  'failed',
  'suspended',
  'deleted',
  'payment_expired',
]);

// In-memory guard so the same deployment is never polled by two loops in the
// same Node process (e.g. duplicate calls or a redeploy racing the first poll).
const activePolls = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findDeployment(deploymentId) {
  const store = await readHostingStore();
  return store.deployments.find(
    (d) => d.deploymentId === deploymentId || d.id === deploymentId,
  ) || null;
}

/**
 * Start polling a deployment until it settles. Returns immediately; the work
 * runs detached on the event loop.
 *
 * @param {string} deploymentId
 * @param {object} [options]
 * @param {number} [options.fastIntervalMs=15000]  Poll cadence for the first phase.
 * @param {number} [options.slowIntervalMs=30000]  Poll cadence after fastPhaseMs.
 * @param {number} [options.fastPhaseMs=180000]    How long to stay on the fast cadence (3 min).
 * @param {number} [options.maxTotalMs=600000]     Hard cap before giving up (10 min).
 * @returns {boolean} true if a new poll loop was started, false if skipped.
 */
export function startPostDeployPolling(deploymentId, options = {}) {
  if (!deploymentId) return false;
  // If Render is not configured there is nothing to poll against.
  if (!renderApiService.configured()) return false;
  // Prevent duplicate loops for the same deployment in this process.
  if (activePolls.has(deploymentId)) return false;

  const fastIntervalMs = Number(options.fastIntervalMs || 15000);
  const slowIntervalMs = Number(options.slowIntervalMs || 30000);
  const fastPhaseMs = Number(options.fastPhaseMs || 180000);
  const maxTotalMs = Number(options.maxTotalMs || 600000);

  activePolls.set(deploymentId, true);

  // Detach: do not await. Errors are swallowed inside runPoll.
  runPoll(deploymentId, { fastIntervalMs, slowIntervalMs, fastPhaseMs, maxTotalMs })
    .catch((error) => {
      console.error(`[post-deploy-poller] ${deploymentId} loop crashed: ${error?.message || error}`);
    })
    .finally(() => {
      activePolls.delete(deploymentId);
    });

  return true;
}

async function runPoll(deploymentId, { fastIntervalMs, slowIntervalMs, fastPhaseMs, maxTotalMs }) {
  const startedAt = Date.now();
  let lastStatus = null;

  await safeLog(deploymentId, 'Post-deploy monitor started — watching Render until the deploy settles.', 'info');

  while (Date.now() - startedAt < maxTotalMs) {
    const elapsed = Date.now() - startedAt;
    await delay(elapsed < fastPhaseMs ? fastIntervalMs : slowIntervalMs);

    let record;
    try {
      record = await findDeployment(deploymentId);
    } catch (error) {
      console.error(`[post-deploy-poller] ${deploymentId} store read failed: ${error?.message || error}`);
      continue;
    }
    if (!record) {
      await safeLog(deploymentId, 'Post-deploy monitor stopped — deployment record not found.', 'warn');
      return;
    }

    // Already settled before we polled (e.g. dashboard refresh beat us).
    if (TERMINAL_STATUSES.has(record.status)) {
      await safeLog(deploymentId, `Post-deploy monitor: final status ${record.status}.`, statusLevel(record.status));
      return;
    }

    let refreshed;
    try {
      refreshed = await deploymentStatusService.refreshDeployment(record);
    } catch (error) {
      console.error(`[post-deploy-poller] ${deploymentId} refresh failed: ${error?.message || error}`);
      continue;
    }

    const status = refreshed?.status || record.status;
    if (status !== lastStatus) {
      lastStatus = status;
      await safeLog(deploymentId, `Post-deploy monitor: status changed to ${status}.`, statusLevel(status));
    }

    if (TERMINAL_STATUSES.has(status)) {
      await safeLog(deploymentId, `Post-deploy monitor: final status ${status}.`, statusLevel(status));
      return;
    }
  }

  await safeLog(
    deploymentId,
    `Post-deploy monitor timed out after ${Math.round(maxTotalMs / 60000)} minutes — open the deployment to refresh its status.`,
    'warn',
  );
}

function statusLevel(status) {
  if (status === 'live') return 'ok';
  if (status === 'failed' || status === 'suspended' || status === 'deleted' || status === 'payment_expired') return 'error';
  return 'info';
}

async function safeLog(deploymentId, message, level) {
  try {
    await addDeploymentLog(deploymentId, message, level);
  } catch (error) {
    console.error(`[post-deploy-poller] ${deploymentId} log failed: ${error?.message || error}`);
  }
}

export default { startPostDeployPolling };
