/**
 * vpsSyncService.js — provider-state synchronization, separated from reads.
 *
 * Commands change provider state; sync brings provider truth back into the
 * database. List/get handlers call these explicitly (throttled) instead of
 * interleaving provider reconciliation with serialization.
 *
 * Rules:
 *  - persistence goes through vps.repository (no Prisma here),
 *  - provider access goes through the vultr adapter,
 *  - a missing provider instance is flagged `provider_missing`, never
 *    silently deleted — only a confirmed destroy may hide a record.
 */

import * as vultr from './vultrApiService.js';
import * as vpsRepo from '../repositories/vps.repository.js';
import { isDummyRecord } from './vpsDto.js';

// Per-organization throttle so bursts of list requests don't hammer the
// provider API. 0 disables sync entirely.
const SYNC_MIN_INTERVAL_MS = Number(process.env.VPS_SYNC_MIN_INTERVAL_MS ?? 15000);
const lastOrgSyncAt = new Map();

function syncable(record) {
  return record.providerInstanceId
    && record.providerInstanceId !== 'FAILED'
    && record.providerInstanceId !== 'pending'
    && !isDummyRecord(record);
}

function diffProviderState(record, live) {
  const fields = {};
  if (live.status && live.status !== record.status) fields.status = live.status;
  if ((live.main_ip ?? null) !== record.mainIp) fields.mainIp = live.main_ip ?? null;
  if (live.vcpu_count != null && live.vcpu_count !== record.vcpuCount) fields.vcpuCount = live.vcpu_count;
  if (live.ram != null && live.ram !== record.ramMb) fields.ramMb = live.ram;
  if (live.disk != null && live.disk !== record.diskGb) fields.diskGb = live.disk;
  return fields;
}

/**
 * One controlled refresh of a single service from the provider.
 * Returns the (possibly updated) record; never throws — reads must still
 * succeed on provider outage, returning cached state.
 */
export async function syncVpsInstance(record) {
  if (!vultr.isConfigured() || !syncable(record)) return record;
  try {
    const live = await vultr.getInstance(record.providerInstanceId);
    const fields = diffProviderState(record, live);
    if (Object.keys(fields).length === 0) return record;
    return await vpsRepo.updateProviderState(record.id, fields);
  } catch (err) {
    if (err.status === 404 && record.status !== 'provider_missing') {
      // Instance gone at the provider with no confirmed destroy → flag it.
      return vpsRepo.markProviderMissing(record.id).catch(() => record);
    }
    console.warn(`[vps:sync] Refresh failed for ${record.id}:`, err.message);
    return record;
  }
}

/**
 * Sync every syncable service of one organization against the provider's
 * instance list. Throttled per organization. Never throws.
 *
 * @returns {boolean} true when a sync actually ran.
 */
export async function syncOrganizationVps(organizationId, services) {
  if (!vultr.isConfigured()) return false;
  const candidates = services.filter(syncable);
  if (candidates.length === 0) return false;

  const last = lastOrgSyncAt.get(organizationId) ?? 0;
  if (SYNC_MIN_INTERVAL_MS <= 0 || Date.now() - last < SYNC_MIN_INTERVAL_MS) return false;
  lastOrgSyncAt.set(organizationId, Date.now());

  try {
    const liveInstances = await vultr.listInstances();
    const liveMap = new Map(liveInstances.map((i) => [i.id, i]));
    const updates = [];

    for (const svc of candidates) {
      const live = liveMap.get(svc.providerInstanceId);
      if (!live) {
        // Never silently erase — there is no confirmed destroy. Flag it.
        if (svc.status !== 'provider_missing') {
          updates.push(vpsRepo.markProviderMissing(svc.id));
        }
      } else {
        const fields = diffProviderState(svc, live);
        if (Object.keys(fields).length > 0) {
          updates.push(vpsRepo.updateProviderState(svc.id, fields));
        }
      }
    }
    if (updates.length) await Promise.all(updates);
    return updates.length > 0;
  } catch (err) {
    console.warn('[vps:sync] Organization sync failed, keeping cached data:', err.message);
    return false;
  }
}
