/**
 * requirePermission.middleware.js
 *
 * Permission matrix hook for admin routes.  In v1 all admins share the same
 * role; this middleware is a named hook so route files can reference it today
 * and it will grow into a real matrix when sub-roles (billing_admin, etc.)
 * are needed.
 *
 * Usage:
 *   router.post('/receipts/:id/approve', requirePermission('billing:approve'), handler)
 *
 * Permissions (v1 — all granted to role === 'admin'):
 *   billing:approve   billing:reject   billing:view
 *   users:suspend     users:reactivate users:delete   users:view
 *   services:suspend  services:manage  services:view
 *   watchdog:review   watchdog:dismiss watchdog:escalate
 *   policies:update
 *   reports:export
 *   system:manage
 */

// v1: flat admin role has all permissions
const ADMIN_PERMISSIONS = new Set([
  'billing:approve', 'billing:reject', 'billing:view',
  'users:suspend', 'users:reactivate', 'users:delete', 'users:view',
  'services:suspend', 'services:manage', 'services:view',
  'watchdog:review', 'watchdog:dismiss', 'watchdog:escalate',
  'policies:update',
  'reports:export',
  'system:manage',
  'tickets:manage',
]);

/**
 * Check if a user has a given permission string.
 * Extend this function when sub-roles are added.
 */
export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return ADMIN_PERMISSIONS.has(permission);
  return false;
}

/**
 * Express middleware factory.
 * @param {string} permission  e.g. 'billing:approve'
 */
export function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Authentication required.', code: 'UNAUTHENTICATED' } });
    }
    if (!hasPermission(req.user, permission)) {
      if (req.securityContext) {
        req.securityContext.watchdogTags.push('admin.permission_denied');
        req.securityContext.riskScore += 3;
      }
      return res.status(403).json({
        error: { message: 'You do not have permission to perform this action.', code: 'PERMISSION_DENIED' },
      });
    }
    next();
  };
}
