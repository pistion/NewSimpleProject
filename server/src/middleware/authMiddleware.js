import { verifyAccessToken } from '../services/authService.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Authenticate a request from the `Authorization: Bearer <jwt>` header.
 *
 *  - A valid JWT sets req.user = { id, email, role, name }.
 *  - A present-but-invalid token is always rejected (401), even in dev.
 *  - When NO token is present:
 *      • In explicit development/demo mode we fall back to a local user so the
 *        app is usable without a backend session (honouring x-user-id headers).
 *      • In production we reject (401). We never trust x-user-id in production
 *        and never default to "local-user" there.
 */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (match) {
    try {
      const payload = verifyAccessToken(match[1]);
      req.user = {
        id: payload.sub,
        email: payload.email || null,
        role: payload.role || 'owner',
        name: payload.name || null,
      };
      return next();
    } catch {
      return reject(req, res);
    }
  }

  if (devFallbackAllowed()) {
    req.user = {
      id: req.headers['x-user-id'] || req.headers['x-glondia-user-id'] || 'local-user',
      role: req.headers['x-user-role'] || 'owner',
      email: null,
      name: null,
    };
    return next();
  }

  return reject(req, res);
}

/** Dev/demo fallback is allowed only outside production and unless disabled. */
function devFallbackAllowed() {
  return !isProd && String(process.env.AUTH_DEV_FALLBACK || 'true').toLowerCase() !== 'false';
}

function reject(req, res) {
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHENTICATED', message: 'A valid access token is required.' },
    requestId: req.id,
  });
}

export default authMiddleware;
