/**
 * vpsHostingService.js — Cloud Servers (VPS) business logic.
 *
 * Layering:
 *   controller → this service → repositories (Prisma) / provider adapter / billing
 *
 * This file contains NO direct database access. It sequences validation,
 * pricing, provider calls, repository transactions, billing updates, audit
 * records, notifications and compensation. Provider and PayPal calls always
 * run OUTSIDE database transactions.
 *
 * Creation flow (both direct deploy and paid checkout):
 *   1. one short transaction: pending VpsService + pending ServiceAccess +
 *      pending action record,
 *   2. provider call (outside any transaction),
 *   3. success → one short transaction: provider state + access activation +
 *      action success,
 *   4. provider failure → failed state stays visible (review state for paid
 *      flows) and admins are alerted,
 *   5. provider success + DB failure → provider cleanup, compensation result
 *      recorded, orphan alert if cleanup fails.
 */

import * as vultr from './vultrApiService.js';
import { calcPricing } from './vpsPricingService.js';
import { captureOrder as paypalCapture, updateOrderStatus } from './paypalBillingService.js';
import { createAdminNotification, safeNotify } from './notificationService.js';
import { syncVpsInstance, syncOrganizationVps } from './vpsSyncService.js';
import { toCustomerVpsDto, toCredentialsDto, isDummyRecord } from './vpsDto.js';
import * as vpsRepo from '../repositories/vps.repository.js';
import * as actionRepo from '../repositories/vpsAction.repository.js';
import {
  recordResource,
  listOwnedResources,
  findByProviderResourceId,
  requireOwnedResource,
  markResourceDeleted,
} from '../repositories/providerResource.repository.js';
import { randomBytes } from 'node:crypto';

const DIRECT_DEPLOY_ENABLED =
  String(process.env.VPS_DIRECT_DEPLOY_ENABLED ?? 'false').toLowerCase() === 'true';

function makeRootPassword() {
  return `Glo-${randomBytes(9).toString('base64url')}`;
}

function actorUserId(actor) {
  return actor.userId === 'local-user' ? null : actor.userId;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function resolveOsName(osId) {
  try {
    const osList = await vultr.listOs();
    return osList.find((o) => o.id === osId)?.name ?? null;
  } catch { return null; }
}

async function registerSshKey(label, dto, actor) {
  if (dto.sshPublicKey) {
    const keyName = dto.sshKeyName || `glondia-${label}`;
    try {
      const newKey = await vultr.createSshKey(keyName, dto.sshPublicKey);
      await recordResource({
        organizationId: actor.organizationId,
        userId: actorUserId(actor),
        resourceType: 'ssh_key',
        providerResourceId: newKey.id,
        name: keyName,
      }).catch((e) => console.warn('[vps] Failed to record SSH key ownership:', e.message));
      return newKey.id;
    } catch (e) {
      console.warn('[vps] SSH key creation failed, continuing without it:', e.message);
    }
    return undefined;
  }
  if (dto.sshKeyId) {
    // Reusing an existing key: a key mapped to another org is rejected; an
    // unmapped (legacy) key is claimed for this org on first use.
    const mapped = await findByProviderResourceId('ssh_key', dto.sshKeyId);
    if (mapped && !mapped.deletedAt && mapped.organizationId !== actor.organizationId) {
      throw Object.assign(new Error('SSH key not found.'), { status: 404, code: 'VPS_RESOURCE_OWNERSHIP_MISMATCH' });
    }
    if (!mapped) {
      await recordResource({
        organizationId: actor.organizationId,
        userId: actorUserId(actor),
        resourceType: 'ssh_key',
        providerResourceId: dto.sshKeyId,
        metadata: { claimedVia: 'legacy_use' },
      }).catch((e) => console.warn('[vps] Failed to record SSH key ownership:', e.message));
    }
    return dto.sshKeyId;
  }
  return undefined;
}

function buildVultrPayload(dto, resolvedSshKeyId, organizationId) {
  return {
    region:   dto.region,
    plan:     dto.plan,
    os_id:    dto.osId,
    label:    dto.label,
    hostname: dto.hostname ?? dto.label,
    tags:     [`org:${organizationId}`],
    ...(resolvedSshKeyId  ? { sshkey_id:      [resolvedSshKeyId] }                          : {}),
    ...(dto.userData       ? { user_data:       Buffer.from(dto.userData).toString('base64') } : {}),
    ...(dto.enableIpv6     ? { enable_ipv6:     true }                                         : {}),
    ...(dto.backups        ? { backups:          'enabled' }                                    : {}),
    ...(dto.ddosProtection ? { ddos_protection:  true }                                         : {}),
  };
}

function providerFieldsFromInstance(instance) {
  return {
    providerInstanceId: instance.id,
    status: instance.status ?? 'pending',
    mainIp: instance.main_ip ?? null,
    vcpuCount: instance.vcpu_count ?? null,
    ramMb: instance.ram ?? null,
    diskGb: instance.disk ?? null,
  };
}

// ─── Catalog / settings ───────────────────────────────────────────────────────

export function getSettings() {
  return {
    vultrConfigured:     vultr.isConfigured(),
    testMode:            vultr.isTestMode() && !vultr.isConfigured(),
    paypalConfigured:    Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    // Deprecated: only kept while the deploy form computes plan prices
    // client-side. New consumers must use POST /quote.
    markupPercent:       Number(process.env.PLATFORM_MARKUP_PERCENT ?? 30),
    sandbox:             String(process.env.PAYPAL_SANDBOX ?? 'true').toLowerCase() !== 'false',
    directDeployEnabled: DIRECT_DEPLOY_ENABLED,
  };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listServices(organizationId) {
  const services = await vpsRepo.listByOrganization(organizationId);
  // Controlled, throttled refresh — reads still succeed on provider outage.
  const changed = await syncOrganizationVps(organizationId, services);
  const rows = changed ? await vpsRepo.listByOrganization(organizationId) : services;
  return rows.map(toCustomerVpsDto);
}

export async function getService(id, organizationId) {
  let record = await vpsRepo.requireOwnedById(id, organizationId);
  record = await syncVpsInstance(record);
  return toCustomerVpsDto(record);
}

/**
 * Protected credentials reveal — behind auth + ownership + active access.
 * Every reveal is recorded in the action log.
 */
export async function getServiceCredentials(id, actor) {
  const record = await vpsRepo.requireOwnedById(id, actor.organizationId);
  await actionRepo.recordCompletedAction({
    vpsServiceId: record.id,
    organizationId: actor.organizationId,
    actorUserId: actorUserId(actor),
    action: 'credentials_reveal',
  });
  return toCredentialsDto(record);
}

// ─── Creation engine ──────────────────────────────────────────────────────────

/**
 * Shared provisioning engine (steps 1–5 in the header). `billing` carries the
 * flow-specific service fields, access states and failure hooks.
 */
async function provisionInstance(dto, actor, billing) {
  const testMode = vultr.isTestMode() && !vultr.isConfigured();

  const plans = await vultr.listPlans();
  const plan  = plans.find((p) => p.id === dto.plan);
  if (!plan) throw Object.assign(new Error(`Plan "${dto.plan}" not found.`), { status: 404 });

  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);
  const osName = await resolveOsName(dto.osId);

  // Step 1 — record intent before any provider call (one short transaction).
  const { record, actionRecord } = await vpsRepo.createPendingBundle({
    service: {
      organizationId: actor.organizationId,
      createdByUserId: actorUserId(actor),
      label: dto.label,
      hostname: dto.hostname ?? dto.label,
      region: dto.region,
      plan: dto.plan,
      osId: dto.osId,
      osName,
      monthlyCostCents: baseCents,
      markupPercent: markup,
      markupAmountCents: mkupCents,
      totalPriceCents: totalCents,
      currency: 'USD',
      ...billing.serviceFields,
    },
    access: {
      userId: actorUserId(actor),
      organizationId: actor.organizationId,
      adminStatus: 'allowed',
      ...billing.accessFields,
    },
    action: {
      actorUserId: actorUserId(actor),
      action: 'create',
      // Never persist key material or cloud-init contents in the action log.
      request: { plan: dto.plan, region: dto.region, osId: dto.osId, label: dto.label },
    },
  });

  // Step 2 — provider calls, outside any transaction.
  let instance;
  try {
    const sshKeyId = await registerSshKey(dto.label, dto, actor);
    instance = await vultr.createInstance(buildVultrPayload(dto, sshKeyId, actor.organizationId));
  } catch (err) {
    // Step 4 — provider refused: keep the record visible as failed.
    console.error('[vps] Provider createInstance failed:', err.message);
    await vpsRepo.markProvisionFailedBundle({
      serviceId: record.id,
      actionId: actionRecord.id,
      error: err.message,
      access: billing.failedAccessState,
    }).catch((e) => console.error('[vps] Failed to persist provision failure:', e.message));
    if (billing.onProviderFailure) await billing.onProviderFailure(err, record);
    throw billing.providerFailureError(err);
  }

  // Step 3 — persist provider result + activate access (one short transaction).
  try {
    const activated = await vpsRepo.activateProvisionedBundle({
      serviceId: record.id,
      actionId: actionRecord.id,
      providerFields: providerFieldsFromInstance(instance),
      metadata: {
        ...billing.metadata(instance, testMode),
        connectionUsername: 'root',
        connectionPassword: instance.default_password || (testMode ? makeRootPassword() : null),
      },
      actionResponse: { providerInstanceId: instance.id },
    });
    console.log(`[vps] Provisioned ${record.id} — Vultr ${instance.id} in ${dto.region}`);
    return toCustomerVpsDto(activated);
  } catch (dbErr) {
    // Step 5 — provider succeeded but persistence failed: compensate.
    console.error('[vps] DB save failed after provider provision:', dbErr.message);
    if (billing.onDbFailure) await billing.onDbFailure(dbErr, record, instance);
    // Preserve the provider id even if the activation transaction failed.
    await vpsRepo.updateProviderState(record.id, { providerInstanceId: instance.id, status: 'error' }).catch(() => {});
    let compensated = false;
    let cleanupError = null;
    try {
      await vultr.deleteInstance(instance.id);
      compensated = true;
      console.warn(`[vps] Compensated — deleted Vultr instance ${instance.id}`);
    } catch (cleanErr) {
      cleanupError = cleanErr.message;
      console.error(`[vps] Compensation failed — Vultr ${instance.id} may be orphaned:`, cleanErr.message);
      safeNotify('vps-orphan-instance', () => createAdminNotification({
        type: 'error',
        title: 'Orphaned Vultr instance',
        message: `DB save failed after provisioning and cleanup also failed. Vultr instance ${instance.id} (service ${record.id}, org ${actor.organizationId}) may be live and unbilled — manual cleanup required.`,
        entityType: 'vps_service',
        entityId: record.id,
      }));
    }
    await actionRepo.recordCompensationResult(actionRecord.id, {
      compensated,
      providerInstanceId: instance.id,
      error: cleanupError,
    });
    throw Object.assign(new Error('Server created but record save failed. Contact support.'), { status: 500 });
  }
}

// ─── Direct deploy (usage-billed) ─────────────────────────────────────────────

export async function createDirect(dto, actor) {
  const testMode = vultr.isTestMode() && !vultr.isConfigured();
  if (!DIRECT_DEPLOY_ENABLED && !testMode) {
    throw Object.assign(new Error('Direct deploy is disabled. Use PayPal checkout.'), { status: 403 });
  }
  if (!dto.plan || !dto.region || dto.osId == null || !dto.label) {
    throw Object.assign(new Error('plan, region, osId and label are required.'), { status: 400 });
  }

  return provisionInstance(dto, actor, {
    serviceFields: { paymentStatus: testMode ? 'free' : 'active' },
    accessFields: {
      accessStatus: 'pending',
      billingStatus: testMode ? 'free' : 'paid',
      metadata: { createdVia: testMode ? 'vps_test_mode' : 'direct_deploy' },
    },
    metadata: (instance, isTest) => ({
      billingModel: isTest ? 'test' : 'usage',
      vultrId: instance.id,
      testMode: isTest,
    }),
    // Unpaid flow: a provider failure simply cancels the pending access.
    failedAccessState: { accessStatus: 'cancelled' },
    providerFailureError: (err) =>
      Object.assign(new Error(`Server provisioning failed: ${err.message}`), { status: 502 }),
  });
}

// ─── PayPal capture + provision ───────────────────────────────────────────────

export async function captureAndProvision(orderId, actor) {
  // Capture payment and verify; loads provisionDetails from server-side storage.
  const { checkoutOrder, captureRecord, provisionDetails: dto } =
    await paypalCapture(actor.organizationId, orderId);

  if (!dto) throw Object.assign(new Error('Order provision details missing. Contact support.'), { status: 500 });

  // Idempotency: capture can legitimately be retried, but one order must never
  // provision two servers.
  const existing = await vpsRepo.findByCheckoutOrderId(checkoutOrder.id);
  if (existing) {
    if (existing.providerInstanceId !== 'FAILED' && existing.status !== 'error') {
      return toCustomerVpsDto(existing);
    }
    throw Object.assign(
      new Error(`Provisioning for this order previously failed and is under review. Contact support with order ID: ${orderId}`),
      { status: 409 },
    );
  }

  return provisionInstance(dto, actor, {
    serviceFields: {
      checkoutOrderId: checkoutOrder.id,
      paypalOrderId: orderId,
      paypalCaptureId: captureRecord.id,
      paymentStatus: 'completed',
    },
    accessFields: {
      accessStatus: 'pending',
      billingStatus: 'paid',
      checkoutOrderId: checkoutOrder.id,
      metadata: { createdVia: 'paypal_checkout' },
    },
    metadata: (instance) => ({ vultrId: instance.id }),
    // Paid flow: money was captured, so a provider failure enters a
    // recoverable review state instead of being cancelled or hidden.
    failedAccessState: { adminStatus: 'review_required', billingStatus: 'paid' },
    onProviderFailure: async (err, record) => {
      await updateOrderStatus(checkoutOrder.id, 'provision_failed');
      safeNotify('vps-paid-provision-failed', () => createAdminNotification({
        type: 'error',
        title: 'VPS payment captured but provisioning failed',
        message: `PayPal order ${orderId} was captured but provisioning failed for "${dto.label}": ${err.message}. Needs refund or manual provisioning.`,
        entityType: 'vps_service',
        entityId: record.id,
      }));
    },
    onDbFailure: async () => {
      await updateOrderStatus(checkoutOrder.id, 'db_error');
    },
    providerFailureError: () =>
      Object.assign(
        new Error(`Payment was captured but server provisioning failed. Contact support with order ID: ${orderId}`),
        { status: 409 },
      ),
  });
}

// ─── Lifecycle actions ────────────────────────────────────────────────────────

async function lifecycleAction(id, actor, { action, providerCall, nextStatus, dummyStatus }) {
  const record = await vpsRepo.requireOwnedById(id, actor.organizationId);
  if (isDummyRecord(record)) {
    if (dummyStatus) await vpsRepo.setStatus(record.id, dummyStatus);
    await actionRepo.recordCompletedAction({
      vpsServiceId: record.id,
      organizationId: actor.organizationId,
      actorUserId: actorUserId(actor),
      action,
      request: { testMode: true },
    });
    return;
  }
  await providerCall(record.providerInstanceId);
  if (nextStatus) await vpsRepo.setStatus(record.id, nextStatus);
  await actionRepo.recordCompletedAction({
    vpsServiceId: record.id,
    organizationId: actor.organizationId,
    actorUserId: actorUserId(actor),
    action,
  });
}

export async function startService(id, actor) {
  return lifecycleAction(id, actor, {
    action: 'start',
    providerCall: (pid) => vultr.startInstance(pid),
    nextStatus: 'running',
    dummyStatus: 'running',
  });
}

export async function haltService(id, actor) {
  return lifecycleAction(id, actor, {
    action: 'halt',
    providerCall: (pid) => vultr.haltInstance(pid),
    nextStatus: 'stopped',
    dummyStatus: 'stopped',
  });
}

export async function rebootService(id, actor) {
  return lifecycleAction(id, actor, {
    action: 'reboot',
    providerCall: (pid) => vultr.rebootInstance(pid),
    nextStatus: null,       // power state unchanged after reboot completes
    dummyStatus: 'running',
  });
}

// ─── Destroy ──────────────────────────────────────────────────────────────────

export async function destroyService(id, actor) {
  const record = await vpsRepo.requireOwnedById(id, actor.organizationId);
  const action = await actionRepo.createAction({
    vpsServiceId: record.id,
    organizationId: actor.organizationId,
    actorUserId: actorUserId(actor),
    action: 'destroy',
  });

  const hasProviderInstance = record.providerInstanceId
    && record.providerInstanceId !== 'FAILED'
    && record.providerInstanceId !== 'pending'
    && !isDummyRecord(record);

  if (hasProviderInstance) {
    await vpsRepo.markDestroyPending(record.id);
    try {
      await vultr.deleteInstance(record.providerInstanceId);
    } catch (err) {
      if (err.status !== 404) {
        // Provider deletion failed → the server may still be live and billing.
        // Keep the record visible as destroy_failed instead of hiding it.
        await vpsRepo.markDestroyFailed(record.id).catch(() => {});
        await actionRepo.markActionFailed(action.id, err.message).catch(() => {});
        safeNotify('vps-destroy-failed', () => createAdminNotification({
          type: 'error',
          title: 'VPS destroy failed',
          message: `Provider deletion failed for VPS ${record.label} (${record.id}, Vultr ${record.providerInstanceId}): ${err.message}. The instance may still be live and billing.`,
          entityType: 'vps_service',
          entityId: record.id,
        }));
        throw Object.assign(
          new Error('The provider could not delete this server yet. It remains visible — please retry shortly.'),
          { status: 502, code: 'VPS_DESTROY_FAILED' },
        );
      }
      // 404 → already gone at the provider; safe to finalize.
    }
  }

  // Deletion confirmed (or nothing live at the provider): soft-delete, close
  // access + billing and complete the action in one transaction.
  await vpsRepo.finalizeDestroyBundle({ serviceId: record.id, actionId: action.id });
  console.log(`[vps] Destroyed service ${record.id} (Vultr: ${record.providerInstanceId})`);
}

// ─── SSH keys ─────────────────────────────────────────────────────────────────

export async function listSshKeys(organizationId) {
  // The Vultr account is shared: return only keys mapped to this organization,
  // never the raw account-wide listing.
  const owned = await listOwnedResources(organizationId, 'ssh_key');
  if (owned.length === 0) return [];
  const ownedIds = new Set(owned.map((r) => r.providerResourceId));
  const data = await vultr.listSshKeys();
  return data.filter((k) => ownedIds.has(k.id));
}

export async function deleteSshKey(keyId, actor) {
  const resource = await requireOwnedResource(actor.organizationId, 'ssh_key', keyId);
  try {
    await vultr.deleteSshKey(keyId);
  } catch (err) {
    if (err.status !== 404) throw err; // already gone at the provider → finalize locally
  }
  await markResourceDeleted(resource.id);
}

// ─── Bandwidth ────────────────────────────────────────────────────────────────

export async function getBandwidth(id, organizationId) {
  const record = await vpsRepo.requireOwnedById(id, organizationId);
  return vultr.getInstanceBandwidth(record.providerInstanceId);
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export async function listSnapshots(organizationId) {
  // Shared provider account: only snapshots mapped to this organization.
  const owned = await listOwnedResources(organizationId, 'snapshot');
  if (owned.length === 0) return [];
  const ownedIds = new Set(owned.map((r) => r.providerResourceId));
  const data = await vultr.listSnapshots();
  return data.filter((s) => ownedIds.has(s.id));
}

export async function createSnapshot(id, actor, description) {
  const record = await vpsRepo.requireOwnedById(id, actor.organizationId);
  const snapshot = await vultr.createSnapshot(record.providerInstanceId, description || '');
  if (snapshot?.id) {
    await recordResource({
      organizationId: actor.organizationId,
      userId: actorUserId(actor),
      serviceId: record.id,
      resourceType: 'snapshot',
      providerResourceId: snapshot.id,
      name: description || null,
    }).catch((e) => console.warn('[vps] Failed to record snapshot ownership:', e.message));
  }
  await actionRepo.recordCompletedAction({
    vpsServiceId: record.id,
    organizationId: actor.organizationId,
    actorUserId: actorUserId(actor),
    action: 'snapshot_create',
    request: { description: description || '' },
  });
  return snapshot;
}

export async function deleteSnapshot(snapshotId, actor) {
  const resource = await requireOwnedResource(actor.organizationId, 'snapshot', snapshotId);
  try {
    await vultr.deleteSnapshot(snapshotId);
  } catch (err) {
    if (err.status !== 404) throw err; // already gone at the provider → finalize locally
  }
  await markResourceDeleted(resource.id);
}

export async function restoreService(id, actor, snapshotId) {
  if (!snapshotId) throw Object.assign(new Error('snapshotId is required.'), { status: 400 });
  const record = await vpsRepo.requireOwnedById(id, actor.organizationId);
  await requireOwnedResource(actor.organizationId, 'snapshot', snapshotId);
  await vultr.restoreInstance(record.providerInstanceId, snapshotId);
  await actionRepo.recordCompletedAction({
    vpsServiceId: record.id,
    organizationId: actor.organizationId,
    actorUserId: actorUserId(actor),
    action: 'snapshot_restore',
    request: { snapshotId },
  });
}

// ─── Backup schedule ──────────────────────────────────────────────────────────

export async function getBackupSchedule(id, organizationId) {
  const record = await vpsRepo.requireOwnedById(id, organizationId);
  return vultr.getBackupSchedule(record.providerInstanceId);
}

export async function setBackupSchedule(id, organizationId, body) {
  const record = await vpsRepo.requireOwnedById(id, organizationId);
  return vultr.setBackupSchedule(record.providerInstanceId, body || {});
}

// ─── Resize / reinstall ───────────────────────────────────────────────────────

export async function resizeService(id, actor, plan) {
  if (!plan) throw Object.assign(new Error('plan is required.'), { status: 400 });
  const record = await vpsRepo.requireOwnedById(id, actor.organizationId);

  // Validate the target plan and price the change BEFORE touching the provider
  // so a resized server never keeps its old plan's price.
  const plans = await vultr.listPlans();
  const targetPlan = plans.find((p) => p.id === plan);
  if (!targetPlan) throw Object.assign(new Error(`Plan "${plan}" not found.`), { status: 404 });
  const { baseCents, mkupCents, totalCents, markup } = calcPricing(targetPlan.monthly_cost);

  await vultr.resizeInstance(record.providerInstanceId, plan);
  await vpsRepo.updatePlanAndPrice(record.id, {
    plan,
    monthlyCostCents: baseCents,
    markupPercent: markup,
    markupAmountCents: mkupCents,
    totalPriceCents: totalCents,
    vcpuCount: targetPlan.vcpu_count ?? record.vcpuCount,
    ramMb: targetPlan.ram ?? record.ramMb,
    diskGb: targetPlan.disk ?? record.diskGb,
  });
  // Price snapshot: the action log keeps the old→new price transition.
  await actionRepo.recordCompletedAction({
    vpsServiceId: record.id,
    organizationId: actor.organizationId,
    actorUserId: actorUserId(actor),
    action: 'resize',
    request: {
      plan,
      previousPlan: record.plan,
      previousTotalPriceCents: record.totalPriceCents,
      newTotalPriceCents: totalCents,
    },
  });
}

export async function reinstallService(id, actor, body) {
  const record = await vpsRepo.requireOwnedById(id, actor.organizationId);
  await vultr.reinstallInstance(record.providerInstanceId, body?.osId);
  if (body?.osId) {
    // Refresh the display name alongside the id so the UI shows the new OS.
    const osName = await resolveOsName(body.osId);
    await vpsRepo.updateOperatingSystem(record.id, { osId: body.osId, osName });
  }
  await actionRepo.recordCompletedAction({
    vpsServiceId: record.id,
    organizationId: actor.organizationId,
    actorUserId: actorUserId(actor),
    action: 'reinstall',
    request: { osId: body?.osId ?? null },
  });
}
