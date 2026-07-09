/**
 * serviceAccess.middleware.js
 *
 * Verifies that the authenticated user has an active ServiceAccess row for
 * the requested service before the service controller runs.
 *
 * Usage:
 *   router.use(authMiddleware, requireServiceAccess('hosting', getServiceId))
 *
 * getServiceId is a fn(req) => serviceId string.
 * If the service is blocked/expired, tags the attempt and returns 403.
 */

import { prisma } from '../services/db.js';

/**
 * Core access check — can be called directly from service controllers too.
 *
 * Returns { allowed: true } or { allowed: false, reason, code }
 */
export async function checkServiceAccess(userId, serviceType, serviceId, { adminBypass = false } = {}) {
  if (adminBypass) return { allowed: true, reason: 'admin_bypass' };

  const row = await prisma.serviceAccess.findUnique({
    where: { serviceType_serviceId: { serviceType, serviceId } },
  });

  if (!row) return { allowed: false, reason: 'no_access_record', code: 'SERVICE_NOT_FOUND' };

  // Ownership check
  if (row.userId && row.userId !== userId) {
    return { allowed: false, reason: 'owner_mismatch', code: 'SERVICE_OWNER_MISMATCH' };
  }

  if (row.adminStatus === 'blocked') {
    return { allowed: false, reason: 'admin_blocked', code: 'SERVICE_ADMIN_BLOCKED' };
  }

  if (row.adminStatus === 'review_required') {
    return { allowed: false, reason: 'admin_review', code: 'SERVICE_UNDER_REVIEW' };
  }

  const accessAllowed = row.accessStatus === 'active';
  if (!accessAllowed) {
    return { allowed: false, reason: `access_status_${row.accessStatus}`, code: 'SERVICE_NOT_ACTIVE' };
  }

  const billingOk = ['paid', 'trial', 'free'].includes(row.billingStatus);
  if (!billingOk) {
    return { allowed: false, reason: `billing_${row.billingStatus}`, code: 'SERVICE_BILLING_ISSUE' };
  }

  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    return { allowed: false, reason: 'expired', code: 'SERVICE_EXPIRED' };
  }

  // Update last activity timestamp (non-blocking)
  prisma.serviceAccess.update({
    where: { id: row.id },
    data:  { lastActivityAt: new Date() },
  }).catch(() => {});

  return { allowed: true, row };
}

/**
 * Express middleware factory.
 *
 * @param {string} serviceType  e.g. 'hosting'
 * @param {Function} getServiceId  fn(req) => serviceId string
 */
export function requireServiceAccess(serviceType, getServiceId) {
  return async function serviceAccessMiddleware(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: { message: 'Authentication required.', code: 'UNAUTHENTICATED' } });

      const serviceId = typeof getServiceId === 'function' ? getServiceId(req) : getServiceId;
      if (!serviceId) return next(); // no service ID — let controller handle

      const isAdmin = req.user?.role === 'admin';
      const result = await checkServiceAccess(userId, serviceType, serviceId, { adminBypass: isAdmin });

      if (!result.allowed) {
        // Tag the attempt
        if (req.securityContext) {
          const tag = result.reason === 'owner_mismatch'
            ? 'service.owner_mismatch'
            : result.reason === 'admin_blocked'
            ? 'service.disabled_access_attempt'
            : 'service.access_denied';
          req.securityContext.watchdogTags.push(tag);
          req.securityContext.riskScore += result.reason === 'owner_mismatch' ? 5 : 2;
        }

        return res.status(403).json({
          error: {
            message: friendlyMessage(result.code),
            code:    result.code,
          },
        });
      }

      // Attach access row to request for downstream use
      req.serviceAccess = result.row;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function friendlyMessage(code) {
  switch (code) {
    case 'SERVICE_NOT_FOUND':       return 'Service access record not found.';
    case 'SERVICE_OWNER_MISMATCH':  return 'You do not own this service.';
    case 'SERVICE_ADMIN_BLOCKED':   return 'This service has been blocked by an administrator.';
    case 'SERVICE_UNDER_REVIEW':    return 'This service is currently under review.';
    case 'SERVICE_NOT_ACTIVE':      return 'This service is not currently active.';
    case 'SERVICE_BILLING_ISSUE':   return 'Service access requires payment. Please update your billing.';
    case 'SERVICE_EXPIRED':         return 'Your service access has expired. Please renew to continue.';
    default:                        return 'Service access denied.';
  }
}
