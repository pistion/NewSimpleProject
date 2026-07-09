/**
 * serviceAccessService.js — CRUD for ServiceAccess records.
 *
 * ServiceAccess is the central monthly access pass: one row per user-owned
 * service.  accessStatus + billingStatus + adminStatus together determine
 * whether the customer can use the service.
 */

import { prisma } from './db.js';
import { writeAuditLog } from './auditLogService.js';

function httpError(msg, status = 400) {
  return Object.assign(new Error(msg), { status, expose: true });
}

const VALID_ACCESS_STATUS  = new Set(['pending', 'active', 'suspended', 'expired', 'cancelled', 'deleted']);
const VALID_BILLING_STATUS = new Set(['trial', 'pending', 'paid', 'overdue', 'failed', 'cancelled', 'free']);
const VALID_ADMIN_STATUS   = new Set(['allowed', 'blocked', 'review_required']);

// ── Admin helpers ─────────────────────────────────────────────────────────────

export async function listServiceAccess({ limit = 30, offset = 0, userId, serviceType, accessStatus, adminStatus } = {}) {
  const where = {
    ...(userId       ? { userId }                       : {}),
    ...(serviceType  ? { serviceType }                  : {}),
    ...(accessStatus ? { accessStatus }                 : {}),
    ...(adminStatus  ? { adminStatus }                  : {}),
  };
  const [items, total] = await Promise.all([
    prisma.serviceAccess.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.serviceAccess.count({ where }),
  ]);
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

export async function getServiceAccess(id) {
  const row = await prisma.serviceAccess.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!row) throw httpError('ServiceAccess record not found.', 404);
  return row;
}

export async function adminUpdateServiceAccess(id, adminUserId, updates) {
  const { accessStatus, billingStatus, adminStatus, expiresAt } = updates;
  const reason = updates.reason ?? updates.adminNote ?? null;

  const row = await prisma.serviceAccess.findUnique({ where: { id } });
  if (!row) throw httpError('ServiceAccess record not found.', 404);

  if (accessStatus && !VALID_ACCESS_STATUS.has(accessStatus))
    throw httpError(`Invalid accessStatus: ${accessStatus}`);
  if (billingStatus && !VALID_BILLING_STATUS.has(billingStatus))
    throw httpError(`Invalid billingStatus: ${billingStatus}`);
  if (adminStatus && !VALID_ADMIN_STATUS.has(adminStatus))
    throw httpError(`Invalid adminStatus: ${adminStatus}`);

  const data = {};
  if (accessStatus)  data.accessStatus  = accessStatus;
  if (billingStatus) data.billingStatus = billingStatus;
  if (adminStatus)   data.adminStatus   = adminStatus;
  if (expiresAt)     data.expiresAt     = new Date(expiresAt);

  const before = JSON.stringify({ accessStatus: row.accessStatus, billingStatus: row.billingStatus, adminStatus: row.adminStatus });
  const updated = await prisma.serviceAccess.update({ where: { id }, data });

  await Promise.all([
    prisma.adminCommand.create({
      data: {
        adminUserId,
        commandType: 'service_access.updated',
        beforeState: before,
        afterState: JSON.stringify(data),
        reason: reason || null,
        metadata: JSON.stringify({ entityType: 'ServiceAccess', entityId: id }),
      },
    }),
    writeAuditLog({
      actorUserId: adminUserId,
      action: 'admin.service_access_updated',
      entityType: 'ServiceAccess',
      entityId: id,
      status: 'success',
      metadata: JSON.stringify(data),
    }),
  ]);

  return updated;
}

export async function adminSuspendServiceAccess(id, adminUserId, reason) {
  return adminUpdateServiceAccess(id, adminUserId, {
    accessStatus: 'suspended',
    adminStatus: 'blocked',
    reason: reason || 'Suspended by admin.',
  });
}

export async function adminReactivateServiceAccess(id, adminUserId) {
  return adminUpdateServiceAccess(id, adminUserId, {
    accessStatus: 'active',
    adminStatus: 'allowed',
    reason: 'Reactivated by admin.',
  });
}

// ── Payment sync ──────────────────────────────────────────────────────────────

/**
 * Create or activate the ServiceAccess row for a hosting deployment once payment
 * is confirmed.  Safe to call more than once — idempotent upsert.
 *
 * @param {{ userId?: string, deploymentId: string, orderId?: string, expiresAt?: Date, via?: string }} opts
 */
export async function syncServiceAccessOnPayment({ userId, deploymentId, orderId, expiresAt, via = 'payment' } = {}) {
  if (!deploymentId) return null;

  try {
    const now = new Date();
    // Default access period: 30 days from now if caller doesn't supply an expiry.
    const accessExpiry = expiresAt instanceof Date ? expiresAt : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const row = await prisma.serviceAccess.upsert({
      where: { serviceType_serviceId: { serviceType: 'hosting', serviceId: deploymentId } },
      update: {
        accessStatus: 'active',
        billingStatus: 'paid',
        ...(userId ? { userId } : {}),
        ...(orderId ? { checkoutOrderId: orderId } : {}),
        startsAt: now,
        expiresAt: accessExpiry,
        metadata: JSON.stringify({ lastPaidVia: via, lastPaidAt: now.toISOString() }),
      },
      create: {
        userId: userId || null,
        serviceType: 'hosting',
        serviceId: deploymentId,
        serviceName: `Hosting: ${deploymentId}`,
        accessStatus: 'active',
        billingStatus: 'paid',
        adminStatus: 'allowed',
        checkoutOrderId: orderId || null,
        startsAt: now,
        expiresAt: accessExpiry,
        metadata: JSON.stringify({ createdVia: via, paidAt: now.toISOString() }),
      },
    });

    return row;
  } catch (err) {
    // Non-fatal — log and continue so the payment itself is never blocked by this.
    console.error('[serviceAccess] syncServiceAccessOnPayment failed:', err.message);
    return null;
  }
}
