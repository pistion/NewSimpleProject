/**
 * requireRecentMfa.middleware.js
 *
 * MFA hook for sensitive admin actions.  In v1 this is a named stub that
 * passes through unless the user has MFA configured AND the last MFA
 * verification is older than the grace period.
 *
 * Usage:
 *   router.post('/users/:id/delete', requireRecentMfa(), handler)
 *
 * When MFA is fully implemented, replace the check body with a real
 * AdminMfaMethod + session challenge lookup.
 */

const MFA_GRACE_SECONDS = Number(process.env.MFA_GRACE_SECONDS || 900); // 15 min default

export function requireRecentMfa({ graceSecs = MFA_GRACE_SECONDS } = {}) {
  return async function requireRecentMfaMiddleware(req, res, next) {
    // v1: pass through — MFA infrastructure exists in schema but enforcement
    // is disabled until TOTP/email-OTP setup flows are built.
    // When ready: check AdminMfaMethod.enabled + req.session.mfaVerifiedAt.
    const mfaEnabled = process.env.REQUIRE_ADMIN_MFA === 'true';
    if (!mfaEnabled) return next();

    // Stub: if the user does not have an MFA timestamp in their session, block.
    const verifiedAt = req.session?.mfaVerifiedAt;
    if (!verifiedAt) {
      if (req.securityContext) {
        req.securityContext.watchdogTags.push('admin.mfa_required_failed');
      }
      return res.status(403).json({
        error: {
          message: 'This action requires a recent MFA verification. Please re-authenticate.',
          code: 'MFA_REQUIRED',
        },
      });
    }

    const ageSecs = (Date.now() - new Date(verifiedAt).getTime()) / 1000;
    if (ageSecs > graceSecs) {
      return res.status(403).json({
        error: {
          message: 'Your MFA session has expired. Please verify again.',
          code: 'MFA_EXPIRED',
        },
      });
    }

    next();
  };
}
