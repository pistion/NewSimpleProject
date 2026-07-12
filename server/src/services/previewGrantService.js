/**
 * previewGrantService.js — signed, expiring access grants for generated previews.
 *
 * SiteBuilder hardening plan, Phase 1. Generated HTML previews must never be
 * reachable anonymously: iframes cannot send Bearer headers, so the dashboard
 * first asks the authenticated API for a grant, then loads the preview URL
 * with `?grant=<token>`.
 *
 * Tokens are stateless HMAC-SHA256 signatures scoped to one site and an
 * expiry — nothing secret is stored in them and they cannot be forged without
 * the server key. Database-backed grants with per-token revocation replace
 * this in Phase 7 (BuilderPreviewGrant).
 *
 * Fail-closed: in production a signing secret must exist (PREVIEW_SIGNING_SECRET
 * or the JWT secret); getJwtSecret() already throws there when unconfigured.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from './authService.js';

const DEFAULT_TTL_SECONDS = Number(process.env.PREVIEW_GRANT_TTL_SECONDS || 900);

function signingSecret() {
  return process.env.PREVIEW_SIGNING_SECRET || getJwtSecret();
}

function sign(payload) {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

/**
 * Issue a grant for one site. Returns { token, expiresAt }.
 * Token format: <expiryEpochSeconds>.<signature over "siteId|expiry">
 */
export function issuePreviewGrant(siteId, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  if (!siteId) throw Object.assign(new Error('siteId is required.'), { status: 400, expose: true });
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const token = `${exp}.${sign(`${siteId}|${exp}`)}`;
  return { token, expiresAt: new Date(exp * 1000) };
}

/** True when the token is a valid, unexpired grant for this site. */
export function verifyPreviewGrant(siteId, token) {
  try {
    if (!siteId || !token) return false;
    const dot = String(token).indexOf('.');
    if (dot <= 0) return false;
    const exp = Number(token.slice(0, dot));
    const givenSig = token.slice(dot + 1);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    const expected = sign(`${siteId}|${exp}`);
    const a = Buffer.from(givenSig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false; // unsigned/misconfigured environments deny access
  }
}
