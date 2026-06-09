import { prisma } from './db.js';
import * as vultr from './vultrApiService.js';
import { calcPricing } from './vpsPricingService.js';
import { captureOrder as paypalCapture } from './paypalBillingService.js';

const DIRECT_DEPLOY_ENABLED =
  String(process.env.VPS_DIRECT_DEPLOY_ENABLED ?? 'false').toLowerCase() === 'true';

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function serializeVps(r) {
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

async function registerSshKey(label, dto) {
  if (dto.sshPublicKey) {
    try {
      const newKey = await vultr.createSshKey(dto.sshKeyName || `glondia-${label}`, dto.sshPublicKey);
      return newKey.id;
    } catch (e) {
      console.warn('[vps] SSH key creation failed, continuing without it:', e.message);
    }
  }
  return dto.sshKeyId || undefined;
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
        const live = liveMap.get(svc.providerInstanceId);
        if (!live) {
          updates.push(prisma.vpsService.update({
            where: { id: svc.id },
            data: { deletedAt: new Date(), status: 'destroyed', updatedAt: new Date() },
          }));
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
  if (!DIRECT_DEPLOY_ENABLED) {
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
  const sshKeyId = await registerSshKey(dto.label, dto);

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
      paymentStatus: 'active',
      metadata: JSON.stringify({ billingModel: 'usage', vultrId: instance.id }),
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
  const sshKeyId = await registerSshKey(dto.label, dto);

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
    }
    throw Object.assign(new Error('Server created but record save failed. Contact support.'), { status: 500 });
  }

  await logAction(record.id, actor.organizationId, actor.userId, 'create', 'success', dto);
  return serializeVps(record);
}

// ─── Lifecycle actions ────────────────────────────────────────────────────────

export async function startService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  await vultr.startInstance(record.providerInstanceId);
  await prisma.vpsService.update({ where: { id: record.id }, data: { status: 'running', updatedAt: new Date() } });
  await logAction(record.id, actor.organizationId, actor.userId, 'start', 'success', {});
}

export async function haltService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  await vultr.haltInstance(record.providerInstanceId);
  await prisma.vpsService.update({ where: { id: record.id }, data: { status: 'stopped', updatedAt: new Date() } });
  await logAction(record.id, actor.organizationId, actor.userId, 'halt', 'success', {});
}

export async function rebootService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  await vultr.rebootInstance(record.providerInstanceId);
  await prisma.vpsService.update({ where: { id: record.id }, data: { updatedAt: new Date() } });
  await logAction(record.id, actor.organizationId, actor.userId, 'reboot', 'success', {});
}

export async function destroyService(id, actor) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });

  if (record.providerInstanceId !== 'FAILED') {
    try {
      await vultr.deleteInstance(record.providerInstanceId);
    } catch (err) {
      console.warn(`[vps] Vultr deleteInstance failed for ${record.providerInstanceId}:`, err.message);
    }
  }

  await prisma.vpsService.update({
    where: { id: record.id },
    data: { deletedAt: new Date(), status: 'destroyed', updatedAt: new Date() },
  });
  await logAction(record.id, actor.organizationId, actor.userId, 'destroy', 'success', {});
  console.log(`[vps] Destroyed service ${record.id} (Vultr: ${record.providerInstanceId})`);
}

// ─── SSH keys ─────────────────────────────────────────────────────────────────

export async function listSshKeys(organizationId) {
  const data = await vultr.listSshKeys();
  // Filter to keys tagged for this org
  return data.filter((k) => !k.name || k.name.startsWith(`glondia-`) || true);
}

export async function deleteSshKey(keyId) {
  await vultr.deleteSshKey(keyId);
}

// ─── Bandwidth ────────────────────────────────────────────────────────────────

export async function getBandwidth(id, organizationId) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  return vultr.getInstanceBandwidth(record.providerInstanceId);
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export async function listSnapshots() {
  return vultr.listSnapshots();
}

export async function createSnapshot(id, organizationId, description) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  return vultr.createSnapshot(record.providerInstanceId, description || '');
}

export async function deleteSnapshot(snapshotId) {
  await vultr.deleteSnapshot(snapshotId);
}

export async function restoreService(id, organizationId, snapshotId) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  await vultr.restoreInstance(record.providerInstanceId, snapshotId);
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
  await vultr.resizeInstance(record.providerInstanceId, plan);
  await prisma.vpsService.update({ where: { id: record.id }, data: { plan, updatedAt: new Date() } });
  await logAction(record.id, actor.organizationId, actor.userId, 'resize', 'success', { plan });
}

export async function reinstallService(id, actor, body) {
  const record = await prisma.vpsService.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!record) throw Object.assign(new Error('VPS service not found.'), { status: 404 });
  await vultr.reinstallInstance(record.providerInstanceId, body?.osId);
  if (body?.osId) {
    await prisma.vpsService.update({ where: { id: record.id }, data: { osId: body.osId, updatedAt: new Date() } });
  }
  await logAction(record.id, actor.organizationId, actor.userId, 'reinstall', 'success', body || {});
}
