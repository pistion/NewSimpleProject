import { prisma } from './db.js';
import * as vultr from './vultrApiService.js';
import { calcPricing } from './vpsPricingService.js';
import { captureOrder as paypalCapture } from './paypalBillingService.js';
import { createAdminNotification, safeNotify } from './notificationService.js';
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

function isDummyRecord(record) {
  return String(record?.providerInstanceId || '').startsWith('dummy-vultr-')
    || safeJson(record?.metadata)?.testMode === true;
}

function safeJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function makeRootPassword() {
  return `Glo-${randomBytes(9).toString('base64url')}`;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function serializeVps(r) {
  const meta = safeJson(r.metadata);
  const isDummy = String(r.providerInstanceId || '').startsWith('dummy-vultr-') || meta.testMode === true;
  return {
    id:                 r.id,
    organizationId:     r.organizationId,
    createdByUserId:    r.createdByUserId ?? null,
    checkoutOrderId:    r.checkoutOrderId ?? null,
    providerInstanceId: r.providerInstanceId,
    label:              r.label,
    hostname:           r.hostname,
    region:             r.region,
    plan:               r.plan,
    osId:               r.osId,
    osName:             r.osName ?? null,
    status:             r.status,
    mainIp:             r.mainIp ?? null,
    vcpuCount:          r.vcpuCount ?? null,
    ramMb:              r.ramMb ?? null,
    diskGb:             r.diskGb ?? null,
    monthlyCostCents:   r.monthlyCostCents,
    markupPercent:      r.markupPercent,
    markupAmountCents:  r.markupAmountCents,
    totalPriceCents:    r.totalPriceCents,
    currency:           r.currency || 'USD',
    paypalOrderId:      r.paypalOrderId ?? null,
    paypalCaptureId:    r.paypalCaptureId ?? null,
    paymentStatus:      r.paymentStatus,
    connectionUsername:  meta.connectionUsername || 'root',
    connectionPassword:  meta.connectionPassword || (isDummy ? `Glo-test-${String(r.id).slice(0, 8)}` : null),
    testMode:            isDummy,
    createdAt:          r.createdAt,
    updatedAt:          r.updatedAt,
  };
}

async function logAction(vpsServiceId, organizationId, actorUserId, action, status, request = {}) {
  try {
    await prisma.vpsActionLog.create({
      data: {
        vpsServiceId,
        organizationId,
        actorUserId: actorUserId || null,
        action,
        status,
        request:  JSON.stringify(request),
        response: '{}',
      },
    });
  } catch (err) {
    console.warn('[vps] Failed to write action log:', err.message);
  }
}

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
        userId: actor.userId === 'local-user' ? null : actor.userId,
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
        userId: actor.userId === 'local-user' ? null : actor.userId,
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

// ─── Catalog ──────────────────────────────────────────────────────────────────

export function getSettings() {
  return {
    vultrConfigured:     vultr.isConfigured(),
    testMode:            vultr.isTestMode() && !vultr.isConfigured(),
    paypalConfigured:    Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    markupPercent:       Number(process.env.PLATFORM_MARKUP_PERCENT ?? 30),
    sandbox:             String(process.env.PAYPAL_SANDBOX ?? 'true').toLowerCase() !== 'false',
    directDeployEnabled: DIRECT_DEPLOY_ENABLED,
  };
}

// ─── Service listing / get ────────────────────────────────────────────────────

export async function listServices(organizationId) {
  const services = await prisma.vpsService.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (vultr.isConfigured() && services.length > 0) {
    try {
      const liveInstances = await vultr.listInstances();
      const liveMap = new Map(liveInstances.map((i) => [i.id, i]));
      const updates = [];

      for (const svc of services) {
        if (svc.providerInstanceId === 'FAILED' || svc.providerInstanceId === 'pending') continue;
        if (isDummyRecord(svc)) continue;
        const live = liveMap.get(svc.providerInstanceId);
        if (!live) {
          // Never silently erase a record because the provider instance is
          // missing — there is no confirmed destroy. Flag it for review.
          if (svc.status !== 'provider_missing') {
            updates.push(prisma.vpsService.update({
              where: { id: svc.id },
              data: { status: 'provider_missing', updatedAt: new Date() },
            }));
          }
        } else if (live.status !== svc.status || live.main_ip !== svc.mainIp) {
          updates.push(prisma.vpsService.update({
            where: { id: svc.id },
            data: {
              status: live.status, mainIp: live.main_ip ?? null,
              vcpuCount: live.vcpu_count ?? svc.vcpuCount,
              ramMb: live.ram ?? svc.ramMb, diskGb: live.disk ?? svc.diskGb,
              updatedAt: new Date(),
            },
          }));
        }
      }
      if (updates.length) await Promise.all(updates);
    } catch (err) {
      console.warn('[vps] Vultr sync failed, returning cached data:', err.message);
    }
  }

  const fresh = await prisma.vpsService.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return fresh.map(serializeVps);
}

export async function getService(id, organizationId) {
  const record = await prisma.vpsService.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });

  if (record.providerInstanceId !== 'FAILED' && vultr.isConfigured()) {
    try {
      const live = await vultr.getInstance(record.providerInstanceId);
      if (live.status !== record.status || live.main_ip !== record.mainIp) {
        const updated = await prisma.vpsService.update({
          where: { id: record.id },
          data: { status: live.status, mainIp: live.main_ip, updatedAt: new Date() },
        });
        return serializeVps(updated);
      }
    } catch { /* Vultr unreachable — return cached */ }
  }
  return serializeVps(record);
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

  const plans = await vultr.listPlans();
  const plan  = plans.find((p) => p.id === dto.plan);
  if (!plan) throw Object.assign(new Error(`Plan "${dto.plan}" not found.`), { status: 404 });

  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);
  const osName = await resolveOsName(dto.osId);
  const sshKeyId = await registerSshKey(dto.label, dto, actor);

  let instance;
  try {
    instance = await vultr.createInstance(buildVultrPayload(dto, sshKeyId, actor.organizationId));
  } catch (err) {
    console.error('[vps] Vultr createInstance failed:', err.message);
    throw Object.assign(new Error(`Server provisioning failed: ${err.message}`), { status: 502 });
  }

  const record = await prisma.vpsService.create({
    data: {
      organizationId:     actor.organizationId,
      createdByUserId:    actor.userId === 'local-user' ? null : actor.userId,
      providerInstanceId: instance.id,
      label: dto.label, hostname: dto.hostname ?? dto.label,
      region: dto.region, plan: dto.plan, osId: dto.osId, osName,
      status: instance.status ?? 'pending',
      mainIp: instance.main_ip ?? null,
      vcpuCount: instance.vcpu_count ?? null, ramMb: instance.ram ?? null, diskGb: instance.disk ?? null,
      monthlyCostCents: baseCents, markupPercent: markup,
      markupAmountCents: mkupCents, totalPriceCents: totalCents, currency: 'USD',
      paymentStatus: testMode ? 'free' : 'active',
      metadata: JSON.stringify({
        billingModel: testMode ? 'test' : 'usage',
        vultrId: instance.id,
        testMode,
        connectionUsername: 'root',
        connectionPassword: instance.default_password || (testMode ? makeRootPassword() : null),
      }),
    },
  });

  await prisma.serviceAccess.upsert({
    where: { serviceType_serviceId: { serviceType: 'vps', serviceId: record.id } },
    update: {
      userId: actor.userId === 'local-user' ? null : actor.userId,
      organizationId: actor.organizationId,
      serviceName: record.label,
      accessStatus: 'active',
      billingStatus: testMode ? 'free' : 'paid',
      adminStatus: 'allowed',
      startsAt: new Date(),
      metadata: JSON.stringify({ createdVia: testMode ? 'vps_test_mode' : 'direct_deploy', providerInstanceId: instance.id }),
    },
    create: {
      userId: actor.userId === 'local-user' ? null : actor.userId,
      organizationId: actor.organizationId,
      serviceType: 'vps',
      serviceId: record.id,
      serviceName: record.label,
      accessStatus: 'active',
      billingStatus: testMode ? 'free' : 'paid',
      adminStatus: 'allowed',
      planId: record.plan,
      startsAt: new Date(),
      metadata: JSON.stringify({ createdVia: testMode ? 'vps_test_mode' : 'direct_deploy', providerInstanceId: instance.id }),
    },
  });

  await logAction(record.id, actor.organizationId, actor.userId, 'create', 'success', dto);
  console.log(`[vps] Direct deploy ${record.id} — Vultr ${instance.id} in ${dto.region}`);
  return serializeVps(record);
}

// ─── PayPal capture + provision ───────────────────────────────────────────────

export async function captureAndProvision(orderId, actor) {
  // Capture payment and verify; load provisionDetails from server-side storage
  const { checkoutOrder, captureRecord, provisionDetails: dto } =
    await paypalCapture(actor.organizationId, orderId);

  if (!dto) throw Object.assign(new Error('Order provision details missing. Contact support.'), { status: 500 });

  const plans = await vultr.listPlans();
  const plan  = plans.find((p) => p.id === dto.plan);
  if (!plan) throw Object.assign(new Error(`Plan "${dto.plan}" not found.`), { status: 404 });

  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);
  const osName  = await resolveOsName(dto.osId);
  const sshKeyId = await registerSshKey(dto.label, dto, actor);

  // Create Vultr instance
  let instance;
  try {
    instance = await vultr.createInstance(buildVultrPayload(dto, sshKeyId, actor.organizationId));
  } catch (err) {
    // Payment captured but provisioning failed
    await prisma.checkoutOrder.update({
      where: { id: checkoutOrder.id },
      data: { status: 'provision_failed' },
    });
    const failRecord = await prisma.vpsService.create({
      data: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId === 'local-user' ? null : actor.userId,
        checkoutOrderId: checkoutOrder.id,
        providerInstanceId: 'FAILED',
        label: dto.label, hostname: dto.hostname ?? dto.label,
        region: dto.region, plan: dto.plan, osId: dto.osId, osName,
        status: 'error',
        monthlyCostCents: baseCents, markupPercent: markup,
        markupAmountCents: mkupCents, totalPriceCents: totalCents, currency: 'USD',
        paypalOrderId: orderId, paypalCaptureId: captureRecord.id, paymentStatus: 'completed',
        metadata: JSON.stringify({ error: err.message }),
      },
    });
    await logAction(failRecord.id, actor.organizationId, actor.userId, 'create', 'error', { error: err.message });
    console.error('[vps] Vultr createInstance failed after PayPal capture:', err.message);
    safeNotify('vps-paid-provision-failed', () => createAdminNotification({
      type: 'error',
      title: 'VPS payment captured but provisioning failed',
      message: `PayPal order ${orderId} was captured but Vultr provisioning failed for "${dto.label}": ${err.message}. Needs refund or manual provisioning.`,
      entityType: 'vps_service',
      entityId: failRecord.id,
    }));
    throw Object.assign(
      new Error(`Payment was captured but server provisioning failed. Contact support with order ID: ${orderId}`),
      { status: 409 },
    );
  }

  // Persist VpsService — compensate if DB write fails
  let record;
  try {
    record = await prisma.vpsService.create({
      data: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId === 'local-user' ? null : actor.userId,
        checkoutOrderId: checkoutOrder.id,
        providerInstanceId: instance.id,
        label: dto.label, hostname: dto.hostname ?? dto.label,
        region: dto.region, plan: dto.plan, osId: dto.osId, osName,
        status: instance.status ?? 'pending',
        mainIp: instance.main_ip ?? null,
        vcpuCount: instance.vcpu_count ?? null, ramMb: instance.ram ?? null, diskGb: instance.disk ?? null,
        monthlyCostCents: baseCents, markupPercent: markup,
        markupAmountCents: mkupCents, totalPriceCents: totalCents, currency: 'USD',
        paypalOrderId: orderId, paypalCaptureId: captureRecord.id, paymentStatus: 'completed',
        metadata: JSON.stringify({ vultrId: instance.id }),
      },
    });
  } catch (dbErr) {
    // DB failed after Vultr succeeded — attempt cleanup
    console.error('[vps] DB save failed after Vultr provision:', dbErr.message);
    await prisma.checkoutOrder.update({ where: { id: checkoutOrder.id }, data: { status: 'db_error' } }).catch(() => {});
    try {
      await vultr.deleteInstance(instance.id);
      console.warn(`[vps] Compensated — deleted Vultr instance ${instance.id}`);
    } catch (cleanErr) {
      console.error(`[vps] Compensation failed — Vultr ${instance.id} may be orphaned:`, cleanErr.message);
      safeNotify('vps-orphan-instance', () => createAdminNotification({
        type: 'error',
        title: 'Orphaned Vultr instance',
        message: `DB save failed after provisioning and cleanup also failed. Vultr instance ${instance.id} (order ${orderId}, org ${actor.organizationId}) may be live and unbilled — manual cleanup required.`,
        entityType: 'checkout_order',
        entityId: checkoutOrder.id,
      }));
    }
    throw Object.assign(new Error('Server created but record save failed. Contact support.'), { status: 500 });
  }

  // Paid checkout must activate ServiceAccess — the management routes require
  // an active row, so skipping this locks the customer out of their server.
  await prisma.serviceAccess.upsert({
    where: { serviceType_serviceId: { serviceType: 'vps', serviceId: record.id } },
    update: {
      userId: actor.userId === 'local-user' ? null : actor.userId,
      organizationId: actor.organizationId,
      serviceName: record.label,
      accessStatus: 'active',
      billingStatus: 'paid',
      adminStatus: 'allowed',
      checkoutOrderId: checkoutOrder.id,
      startsAt: new Date(),
      metadata: JSON.stringify({ createdVia: 'paypal_checkout', providerInstanceId: instance.id }),
    },
    create: {
      userId: actor.userId === 'local-user' ? null : actor.userId,
      organizationId: actor.organizationId,
      serviceType: 'vps',
      serviceId: record.id,
      serviceName: record.label,
      accessStatus: 'active',
      billingStatus: 'paid',
      adminStatus: 'allowed',
      planId: record.plan,
      checkoutOrderId: checkoutOrder.id,
      startsAt: new Date(),
      metadata: JSON.stringify({ createdVia: 'paypal_checkout', providerInstanceId: instance.id }),
    },
  }).catch((e) => console.error('[vps] Failed to create ServiceAccess after capture:', e.message));

  await logAction(record.id, actor.organizationId, actor.userId, 'create', 'success', dto);
  return serializeVps(record);
}

// ─── Lifecycle actions ────────────────────────────────────────────────────────

export async function startService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  if (isDummyRecord(record)) {
    await prisma.vpsService.update({ where: { id: record.id }, data: { status: 'running', updatedAt: new Date() } });
    await logAction(record.id, actor.organizationId, actor.userId, 'start', 'success', { testMode: true });
    return;
  }
  await vultr.startInstance(record.providerInstanceId);
  await prisma.vpsService.update({ where: { id: record.id }, data: { status: 'running', updatedAt: new Date() } });
  await logAction(record.id, actor.organizationId, actor.userId, 'start', 'success', {});
}

export async function haltService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  if (isDummyRecord(record)) {
    await prisma.vpsService.update({ where: { id: record.id }, data: { status: 'stopped', updatedAt: new Date() } });
    await logAction(record.id, actor.organizationId, actor.userId, 'halt', 'success', { testMode: true });
    return;
  }
  await vultr.haltInstance(record.providerInstanceId);
  await prisma.vpsService.update({ where: { id: record.id }, data: { status: 'stopped', updatedAt: new Date() } });
  await logAction(record.id, actor.organizationId, actor.userId, 'halt', 'success', {});
}

export async function rebootService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  if (isDummyRecord(record)) {
    await prisma.vpsService.update({ where: { id: record.id }, data: { status: 'running', updatedAt: new Date() } });
    await logAction(record.id, actor.organizationId, actor.userId, 'reboot', 'success', { testMode: true });
    return;
  }
  await vultr.rebootInstance(record.providerInstanceId);
  await prisma.vpsService.update({ where: { id: record.id }, data: { updatedAt: new Date() } });
  await logAction(record.id, actor.organizationId, actor.userId, 'reboot', 'success', {});
}

export async function destroyService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });

  if (record.providerInstanceId !== 'FAILED' && !isDummyRecord(record)) {
    try {
      await vultr.deleteInstance(record.providerInstanceId);
    } catch (err) {
      if (err.status !== 404) {
        // Provider deletion failed → the server may still be live and billing.
        // Keep the record visible as destroy_failed instead of hiding it.
        await prisma.vpsService.update({
          where: { id: record.id },
          data: { status: 'destroy_failed', updatedAt: new Date() },
        }).catch(() => {});
        await logAction(record.id, actor.organizationId, actor.userId, 'destroy', 'error', { error: err.message });
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

  await prisma.vpsService.update({
    where: { id: record.id },
    data: { deletedAt: new Date(), status: 'destroyed', updatedAt: new Date() },
  });
  await prisma.serviceAccess.updateMany({
    where: { serviceType: 'vps', serviceId: record.id },
    data: { accessStatus: 'deleted', billingStatus: 'cancelled', lastActivityAt: new Date() },
  }).catch(() => {});
  await logAction(record.id, actor.organizationId, actor.userId, 'destroy', 'success', {});
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
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
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
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  const snapshot = await vultr.createSnapshot(record.providerInstanceId, description || '');
  if (snapshot?.id) {
    await recordResource({
      organizationId: actor.organizationId,
      userId: actor.userId === 'local-user' ? null : actor.userId,
      serviceId: record.id,
      resourceType: 'snapshot',
      providerResourceId: snapshot.id,
      name: description || null,
    }).catch((e) => console.warn('[vps] Failed to record snapshot ownership:', e.message));
  }
  await logAction(record.id, actor.organizationId, actor.userId, 'snapshot_create', 'success', { description: description || '' });
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
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  await requireOwnedResource(actor.organizationId, 'snapshot', snapshotId);
  await vultr.restoreInstance(record.providerInstanceId, snapshotId);
  await logAction(record.id, actor.organizationId, actor.userId, 'snapshot_restore', 'success', { snapshotId });
}

// ─── Backup schedule ──────────────────────────────────────────────────────────

export async function getBackupSchedule(id, organizationId) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  return vultr.getBackupSchedule(record.providerInstanceId);
}

export async function setBackupSchedule(id, organizationId, body) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  return vultr.setBackupSchedule(record.providerInstanceId, body || {});
}

// ─── Resize / reinstall ───────────────────────────────────────────────────────

export async function resizeService(id, actor, plan) {
  if (!plan) throw Object.assign(new Error('plan is required.'), { status: 400 });
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });

  // Validate the target plan and price the change BEFORE touching the provider
  // so a resized server never keeps its old plan's price.
  const plans = await vultr.listPlans();
  const targetPlan = plans.find((p) => p.id === plan);
  if (!targetPlan) throw Object.assign(new Error(`Plan "${plan}" not found.`), { status: 404 });
  const { baseCents, mkupCents, totalCents, markup } = calcPricing(targetPlan.monthly_cost);

  await vultr.resizeInstance(record.providerInstanceId, plan);
  await prisma.vpsService.update({
    where: { id: record.id },
    data: {
      plan,
      monthlyCostCents: baseCents,
      markupPercent: markup,
      markupAmountCents: mkupCents,
      totalPriceCents: totalCents,
      vcpuCount: targetPlan.vcpu_count ?? record.vcpuCount,
      ramMb: targetPlan.ram ?? record.ramMb,
      diskGb: targetPlan.disk ?? record.diskGb,
      updatedAt: new Date(),
    },
  });
  await logAction(record.id, actor.organizationId, actor.userId, 'resize', 'success', {
    plan,
    previousPlan: record.plan,
    previousTotalPriceCents: record.totalPriceCents,
    newTotalPriceCents: totalCents,
  });
}

export async function reinstallService(id, actor, body) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  await vultr.reinstallInstance(record.providerInstanceId, body?.osId);
  if (body?.osId) {
    // Refresh the display name alongside the id so the UI shows the new OS.
    const osName = await resolveOsName(body.osId);
    await prisma.vpsService.update({
      where: { id: record.id },
      data: { osId: body.osId, ...(osName ? { osName } : {}), updatedAt: new Date() },
    });
  }
  await logAction(record.id, actor.organizationId, actor.userId, 'reinstall', 'success', body || {});
}
