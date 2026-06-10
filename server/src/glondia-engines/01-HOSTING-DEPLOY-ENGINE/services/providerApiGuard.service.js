/**
 * providerApiGuard.service.js
 *
 * Middleware: gates all provider (Render / Spaceship) API endpoints.
 * Checks PROVIDER_API_ENABLED, bearer token, and per-IP/per-path rate limit.
 */

const providerRateWindowMs = Number(process.env.PROVIDER_RATE_WINDOW_MS || 60_000);
const providerRateLimit = Number(process.env.PROVIDER_RATE_LIMIT || 20);
const providerRateBuckets = new Map();

export function providerApiGuard(req, res, next) {
  if (String(process.env.PROVIDER_API_ENABLED || 'true').toLowerCase() === 'false') {
    return res.status(503).json({ status: 'disabled', message: 'Provider API endpoints are disabled.' });
  }

  const token = process.env.PROVIDER_API_TOKEN;
  if (token) {
    const expected = `Bearer ${token}`;
    if (req.headers.authorization !== expected) {
      return res.status(401).json({ status: 'unauthorized', message: 'Provider API token is required.' });
    }
  }

  const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:${req.path}`;
  const now = Date.now();
  const bucket = providerRateBuckets.get(key) || { count: 0, resetAt: now + providerRateWindowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + providerRateWindowMs;
  }
  bucket.count += 1;
  providerRateBuckets.set(key, bucket);
  res.setHeader('X-RateLimit-Limit', String(providerRateLimit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, providerRateLimit - bucket.count)));
  if (bucket.count > providerRateLimit) {
    return res.status(429).json({ status: 'rate_limited', message: 'Too many provider API requests. Try again shortly.' });
  }

  return next();
}
