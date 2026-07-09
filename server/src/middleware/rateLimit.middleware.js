/**
 * rateLimit.middleware.js
 *
 * In-process sliding-window rate limiter.  Uses a simple Map so it works with
 * SQLite / no Redis.  For multi-process / multi-instance deployments, replace
 * the store with a shared cache.
 *
 * Exported factory: createRateLimit({ windowMs, max, keyFn?, message?, group? })
 * Pre-built limiters:  authRateLimit, signupRateLimit, checkoutRateLimit,
 *                      receiptRateLimit, ticketRateLimit, analyticsRateLimit,
 *                      adminRateLimit, webhookRateLimit
 */

// ── Sliding-window store ──────────────────────────────────────────────────────

const store = new Map(); // key -> [timestamp, ...]

function isRateLimited(key, windowMs, max) {
  const now = Date.now();
  const cutoff = now - windowMs;
  let hits = (store.get(key) || []).filter(t => t > cutoff);
  if (hits.length >= max) return true;
  hits.push(now);
  store.set(key, hits);
  return false;
}

// Prevent unbounded memory growth — sweep stale entries every 5 min.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 h max window
  for (const [key, hits] of store.entries()) {
    const fresh = hits.filter(t => t > cutoff);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}, 5 * 60 * 1000).unref?.();

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRateLimit({ windowMs, max, keyFn, message, group } = {}) {
  const _keyFn  = keyFn  || ((req) => req.ip || 'unknown');
  const _msg    = message || 'Too many requests. Please try again later.';
  const _window = windowMs || 60_000;
  const _max    = max || 60;

  return function rateLimitMiddleware(req, res, next) {
    const key = `${group || 'default'}:${_keyFn(req)}`;
    if (isRateLimited(key, _window, _max)) {
      if (req.securityContext) {
        req.securityContext.riskScore += 2;
        req.securityContext.watchdogTags.push(`rate_limit.${group || 'default'}`);
      }
      res.status(429).json({ error: { message: _msg, code: 'RATE_LIMITED' } });
      return;
    }
    next();
  };
}

// ── Pre-built limiters ────────────────────────────────────────────────────────

// Auth login — strict per IP (300 req / 15 min)
export const authRateLimit = createRateLimit({
  group: 'auth.login',
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: (req) => `${req.ip}:${(req.body?.email || '').toLowerCase().slice(0, 64)}`,
  message: 'Too many login attempts. Please wait and try again.',
});

// Signup — strict per IP
export const signupRateLimit = createRateLimit({
  group: 'auth.signup',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many signup attempts from this address.',
});

// Checkout — moderate per user + IP
export const checkoutRateLimit = createRateLimit({
  group: 'billing.checkout',
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: (req) => req.user?.id || req.ip,
  message: 'Too many checkout requests.',
});

// Receipt upload — moderate per user
export const receiptRateLimit = createRateLimit({
  group: 'billing.receipt_upload',
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyFn: (req) => req.user?.id || req.ip,
  message: 'Too many receipt uploads.',
});

// Tickets — moderate per user
export const ticketRateLimit = createRateLimit({
  group: 'support.tickets',
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyFn: (req) => req.user?.id || req.ip,
  message: 'Too many ticket requests.',
});

// Analytics events — high volume, sampled
export const analyticsRateLimit = createRateLimit({
  group: 'analytics',
  windowMs: 60 * 1000,
  max: 120,
  keyFn: (req) => req.user?.id || req.ip,
  message: 'Analytics event rate limit exceeded.',
});

// Admin API mutations
export const adminRateLimit = createRateLimit({
  group: 'admin_api',
  windowMs: 60 * 1000,
  max: 60,
  keyFn: (req) => req.user?.id || req.ip,
  message: 'Admin API rate limit exceeded.',
});

// Webhooks — per source IP
export const webhookRateLimit = createRateLimit({
  group: 'webhook',
  windowMs: 60 * 1000,
  max: 120,
  message: 'Webhook rate limit exceeded.',
});
