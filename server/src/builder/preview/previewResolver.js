/**
 * previewResolver.js — safe resolution of artifact files for preview serving.
 *
 * Only files listed in the revision's artifact manifest are servable (a
 * database/manifest allowlist, not a filesystem walk), the resolved path must
 * stay inside the artifact's files/ root, and the file content must still
 * match its manifest SHA-256 before a single byte is served.
 */

import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { artifactDirForRevision } from '../generation/artifactWriter.js';

const MIME_ALLOWLIST = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.jsx':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

export function resolverError(code, status) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

/**
 * Normalize and validate a requested preview path. Returns the clean relative
 * path (POSIX) or throws. Never trusts URL input: rejects traversal (raw and
 * encoded — callers must pass the DECODED path), null bytes, absolute paths,
 * backslashes, and empty segments.
 */
export function normalizeRequestPath(rawPath) {
  const text = String(rawPath || '');
  if (text.includes('\0') || text.includes('%00')) throw resolverError('PREVIEW_PATH_INVALID', 400);
  if (/%2e|%2f|%5c/i.test(text)) throw resolverError('PREVIEW_PATH_INVALID', 400); // double-encoded traversal
  if (text.includes('\\')) throw resolverError('PREVIEW_PATH_INVALID', 400);
  if (/^[a-zA-Z]:/.test(text) || text.startsWith('//')) throw resolverError('PREVIEW_PATH_INVALID', 400);
  const segments = text.split('/').filter((part) => part.length > 0);
  if (segments.some((part) => part === '.' || part === '..')) throw resolverError('PREVIEW_PATH_INVALID', 400);
  return segments.join('/');
}

/**
 * Resolve a manifest-listed artifact file. Returns { content, contentType }.
 * Falls back to index.html for extension-less paths (SPA routes).
 */
export async function resolveArtifactFile({ revisionId, requestPath, manifest }) {
  let rel = normalizeRequestPath(requestPath) || 'index.html';

  const listed = new Map(manifest.files.map((f) => [f.path, f]));
  let entry = listed.get(rel);
  if (!entry && !rel.includes('.')) {
    rel = 'index.html';
    entry = listed.get(rel);
  }
  if (!entry) throw resolverError('PREVIEW_FILE_NOT_FOUND', 404);

  const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase();
  const contentType = MIME_ALLOWLIST[ext];
  if (!contentType) throw resolverError('PREVIEW_TYPE_NOT_ALLOWED', 404);

  const filesRoot = join(artifactDirForRevision(revisionId), 'files');
  const absolute = resolve(filesRoot, ...rel.split('/'));
  if (absolute !== filesRoot && !absolute.startsWith(filesRoot + sep)) {
    throw resolverError('PREVIEW_PATH_INVALID', 400);
  }

  const stats = await lstat(absolute).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) {
    throw resolverError('PREVIEW_FILE_NOT_FOUND', 404);
  }

  const content = await readFile(absolute);
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (sha256 !== entry.sha256) throw resolverError('PREVIEW_ARTIFACT_TAMPERED', 409);

  return { content, contentType, path: rel };
}
