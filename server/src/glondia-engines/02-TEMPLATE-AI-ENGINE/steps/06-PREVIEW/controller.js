import { getTemplateSite } from '../../store/templateSiteStore.js';
import { buildPreview } from '../../../../services/templatePreview.service.js';
import { issuePreviewGrant } from '../../../../services/previewGrantService.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Owner (or admin) check — mirrors the template-source access rule. */
function canAccess(user, site) {
  if (user?.role === 'admin') return true;
  const owner = site?.userId || site?.ownerUserId || site?.answers?.userId || null;
  return Boolean(user?.id && owner && user.id === owner);
}

/**
 * Containment headers for untrusted generated HTML (hardening plan Phase 1).
 * `CSP: sandbox allow-scripts` (without allow-same-origin) runs the document
 * in an opaque origin: scripts execute for the preview but cannot read the
 * dashboard's cookies, localStorage, or same-origin APIs. Full isolated-origin
 * hosting replaces this in Phase 7 (BUILDER_ISOLATED_PREVIEW).
 */
function setPreviewSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts; frame-ancestors 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cache-Control', 'no-store');
}

async function previewSite(req, res, next) {
  try {
    const { siteId } = req.params;
    const site = await getTemplateSite(siteId);
    if (!site) {
      setPreviewSecurityHeaders(res);
      return res.status(404).send('<!doctype html><html><body><h1>Preview not found</h1></body></html>');
    }

    // Without a signed grant, only the owning (or admin) account may view.
    if (!req.previewGrant && !canAccess(req.user, site)) {
      return res.status(403).json({
        error: { code: 'PREVIEW_ACCESS_DENIED', message: 'You do not have access to this preview.' },
        requestId: req.id,
      });
    }

    const pageIndex = Math.max(0, Number(req.query.page || 0) || 0);
    const preview = buildPreview(site, pageIndex);

    if (!preview.html && site.generatedSite?.siteDir) {
      const indexPath = join(site.generatedSite.siteDir, 'index.html');
      if (existsSync(indexPath)) {
        setPreviewSecurityHeaders(res);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(await readFile(indexPath, 'utf8'));
      }
    }

    if (!preview.html) {
      setPreviewSecurityHeaders(res);
      return res.status(404).send('<!doctype html><html><body><h1>No generated preview available</h1></body></html>');
    }

    setPreviewSecurityHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(preview.html);
  } catch (err) { next(err); }
}

/**
 * Mint a short-lived signed preview URL for the owning account. The token is
 * scoped to this site and expires; iframes load the URL without needing auth
 * headers.
 */
async function createPreviewGrant(req, res, next) {
  try {
    const { siteId } = req.params;
    const site = await getTemplateSite(siteId);
    if (!site) {
      return res.status(404).json({ error: { code: 'SITE_NOT_FOUND', message: 'Site not found.' }, requestId: req.id });
    }
    if (!canAccess(req.user, site)) {
      return res.status(403).json({
        error: { code: 'PREVIEW_ACCESS_DENIED', message: 'You do not have access to this preview.' },
        requestId: req.id,
      });
    }
    const { token, expiresAt } = issuePreviewGrant(siteId);
    const page = Math.max(0, Number(req.body?.page || 0) || 0);
    res.status(201).json({
      data: {
        url: `/api/template-ai/sites/${encodeURIComponent(siteId)}/preview?page=${page}&grant=${encodeURIComponent(token)}`,
        token,
        expiresAt,
      },
      requestId: req.id,
    });
  } catch (err) { next(err); }
}

export const previewController = { previewSite, createPreviewGrant };
