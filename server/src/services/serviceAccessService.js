/**
 * serviceAccessService.js — the shared ServiceAccess business layer.
 *
 * ServiceAccess is the central monthly access pass: one row per user-owned
 * service. accessStatus + billingStatus + adminStatus together determine
 * whether the customer can use the service.
 *
 * Layering:
 *   serviceAccess.middleware.js → this service → serviceAccess.repository.js → shared Prisma client
 *
 * This file owns the RULES (ownership, admin bypass, access/billing status,
 * expiry). All database access goes through the repository.
 */

import { writeAuditLog, recordAdminCommand } from './auditLogService.js';
import * as accessRepo from '../repositories/serviceAccess.repository.js';

function httpError(msg, status = 400) {
  return Object.assign(new Error(msg), { status, expose: true });
}

const VALID_ACCESS_STATUS  = new Set(['pending', 'active', 'suspended', 'expired', 'cancelled', 'deleted']);
const VALID_BILLING_STATUS = new Set(['trial', 'pending', 'paid', 'overdue', 'failed', 'cancelled', 'free']);
const VALID_ADMIN_STATUS   = new Set(['allowed', 'blocked', 'review_required']);

const BILLING_OK = new Set(['paid', 'trial', 'free']);

// ── Access decision rules ─────────────────────────────────────────────────────

/**
 * Pure rule evaluation for one access row and one user. No I/O — unit-testable.
 * Returns { allowed: true, row } or { allowed: false, reason, code }.
 */
export function evaluateAccess(row, userId) {
  if (!row) return { allowed: false, reason: 'no_access_record', code: 'SERVICE_NOT_FOUND' };

  if (row.userId && row.userId !== userId) {
    return { allowed: false, reason: 'owner_mismatch', code: 'SERVICE_OWNER_MISMATCH' };
  }
  if (row.adminStatus === 'blocked') {
    return { allowed: false, reason: 'admin_blocked', code: 'SERVICE_ADMIN_BLOCKED' };
  }
  if (row.adminStatus === 'review_required') {
    return { allowed: false, reason: 'admin_review', code: 'SERVICE_UNDER_REVIEW' };
  }
  if (row.accessStatus !== 'active') {
    return { allowed: false, reason: `access_status_${row.accessStatus}`, code: 'SERVICE_NOT_ACTIVE' };
  }
  if (!BILLING_OK.has(row.billingStatus)) {
    return { allowed: false, reason: `billing_${row.billingStatus}`, code: 'SERVICE_BILLING_ISSUE' };
  }
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    return { allowed: false, reason: 'expired', code: 'SERVICE_EXPIRED' };
  }
  return { allowed: true, row };
}

/**
 * Full access check for a user against one service.
 * Admin bypass is explicit and audit-logged (never silent).
 */
export async function checkServiceAccess(userId, serviceType, serviceId, { adminBypass = false } = {}) {
  if (adminBypass) {
    writeAuditLog({
      actorUserId: userId,
      action: 'service_access.admin_bypass',
      entityType: 'ServiceAccess',
      entityId: `${serviceType}:${serviceId}`,
      status: 'success',
    }).catch(() => {});
    return { allowed: true, reason: 'admin_bypass' };
  }

  const row = await accessRepo.findByService(serviceType, serviceId);
  const result = evaluateAccess(row, userId);

  if (result.allowed && row) accessRepo.touchActivity(row.id);
  return result;
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

export async function listServiceAccess({ limit = 30, offset = 0, userId, serviceType, accessStatus, adminStatus } = {}) {
  const where = {
    ...(userId       ? { userId }       : {}),
    ...(serviceType  ? { serviceType }  : {}),
    ...(accessStatus ? { accessStatus } : {}),
    ...(adminStatus  ? { adminStatus }  : {}),
  };
  const { items, total } = await accessRepo.listAccess({ where, limit, offset });
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

export async function getServiceAccess(id) {
  const row = await accessRepo.findById(id, { includeUser: true });
  if (!row) throw httpError('ServiceAccess record not found.', 404);
  return row;
}

export async function adminUpdateServiceAccess(id, adminUserId, updates) {
  const { accessStatus, billingStatus, adminStatus, expiresAt } = updates;
  const reason = updates.reason ?? updates.adminNote ?? null;

  const row = await accessRepo.findById(id);
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
  const updated = await accessRepo.updateById(id, data);

  await Promise.all([
    recordAdminCommand({
      adminUserId,
      commandType: 'service_access.updated',
      beforeState: before,
      afterState: JSON.stringify(data),
      reason,
      metadata: { entityType: 'ServiceAccess', entityId: id },
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

    return await accessRepo.upsertAccess('hosting', deploymentId, {
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
  } catch (err) {
    // Non-fatal — log and continue so the payment itself is never blocked by this.
    console.error('[serviceAccess] syncServiceAccessOnPayment failed:', err.message);
    return null;
  }
}
