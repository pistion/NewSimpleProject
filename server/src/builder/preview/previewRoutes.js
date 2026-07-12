/**
 * previewRoutes.js — canonical isolated preview serving.
 *
 *   GET /p/:revisionId          → entry (index.html)
 *   GET /p/:revisionId/*        → artifact asset
 *
 * In production this router is reached through the dedicated preview origin
 * (BUILDER_PREVIEW_ORIGIN, e.g. https://preview.glondia.app) so generated code
 * never executes on the authenticated dashboard origin. The route itself is
 * unauthenticated by design: access is controlled entirely by hashed,
 * expiring, revocable database grants.
 *
 * Token flow: the entry request carries ?grant=<token>; a preview-scoped
 * cookie (Path=/p/<revisionId>, HttpOnly) carries it for asset requests.
 * Dashboard cookies are never read here and must not be scoped to the
 * preview host.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import * as repo from '../../repositories/builder.repository.js';
import { artifactDirForRevision } from '../generation/artifactWriter.js';
import { isolatedPreviewEnabled } from '../builderFlags.js';
import { resolveArtifactFile, resolverError } from './previewResolver.js';

const router = express.Router();

const COOKIE_PREFIX = 'glondia_preview_';
const REVISION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function previewCsp() {
  const dashboardOrigin = process.env.DASHBOARD_ORIGIN || '';
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${dashboardOrigin || "'self'"}`,
  ].join('; ');
}

function setSecurityHeaders(res) {
  res.set({
    'Content-Security-Policy': previewCsp(),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'SAMEORIGIN',
  });
}

function deny(res, status = 401) {
  setSecurityHeaders(res);
  // One uniform response for every denial: no token/grant state oracle.
  res.status(status).type('text/plain').send(status === 404 ? 'Not found.' : 'Preview access denied.');
}

function readCookieToken(req, revisionId) {
  const header = String(req.headers.cookie || '');
  const name = `${COOKIE_PREFIX}${revisionId}=`;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name)) return decodeURIComponent(trimmed.slice(name.length));
  }
  return null;
}

function parseGrantExpiry(value) {
  if (!value) return 0;
  const text = String(value);
  const iso = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function constantTimeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  return bufA.length > 0 && bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Validate the grant chain: token → hash → grant row → revision → artifact.
 * Returns { revision, manifest } or throws a resolver error.
 */
async function authorizePreview({ revisionId, token }) {
  if (!REVISION_ID_RE.test(String(revisionId || ''))) throw resolverError('PREVIEW_DENIED', 404);
  if (!token || String(token).length > 512) throw resolverError('PREVIEW_DENIED', 401);

  const tokenHash = createHash('sha256').update(String(token)).digest('hex');
  const grant = await repo.findPreviewGrantByTokenHash(tokenHash);
  if (!grant) throw resolverError('PREVIEW_DENIED', 401);
  if (!constantTimeEqualHex(grant.tokenHash, tokenHash)) throw resolverError('PREVIEW_DENIED', 401);
  if (grant.revisionId !== revisionId) throw resolverError('PREVIEW_DENIED', 401);
  if (grant.revokedAt) throw resolverError('PREVIEW_DENIED', 401);
  if (parseGrantExpiry(grant.expiresAt) <= Date.now()) throw resolverError('PREVIEW_DENIED', 401);

  const revision = await repo.getRevisionById(revisionId);
  if (!revision || !['READY', 'APPROVED'].includes(revision.status)) throw resolverError('PREVIEW_DENIED', 401);
  if (!revision.artifactChecksum) throw resolverError('PREVIEW_DENIED', 401);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(artifactDirForRevision(revisionId), 'artifact-manifest.json'), 'utf8'));
  } catch {
    throw resolverError('PREVIEW_DENIED', 404);
  }
  if (manifest.checksum !== revision.artifactChecksum) throw resolverError('PREVIEW_DENIED', 409);

  repo.touchPreviewGrant(grant.id).catch(() => {});
  return { revision, manifest };
}

async function servePreview(req, res, requestPath) {
  if (!isolatedPreviewEnabled()) return deny(res, 404);
  const { revisionId } = req.params;
  const queryToken = typeof req.query.grant === 'string' ? req.query.grant : null;
  const token = queryToken || readCookieToken(req, revisionId);

  try {
    const { manifest } = await authorizePreview({ revisionId, token });
    const file = await resolveArtifactFile({ revisionId, requestPath, manifest });
    setSecurityHeaders(res);
    if (queryToken) {
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.append('Set-Cookie',
        `${COOKIE_PREFIX}${revisionId}=${encodeURIComponent(queryToken)}; Path=/p/${revisionId}; HttpOnly; SameSite=None${secure}; Max-Age=1800`);
    }
    res.status(200).type(file.contentType).send(file.content);
  } catch (err) {
    deny(res, Number(err.status) === 404 ? 404 : (Number(err.status) || 401));
  }
}

router.get('/:revisionId', (req, res) => servePreview(req, res, 'index.html'));
router.get('/:revisionId/*', (req, res) => servePreview(req, res, req.params[0]));

export default router;
