/**
 * templateLoader.js — authoritative, server-side template loading and pinning.
 *
 * Templates ship with the application under TEMPLATE_LOCAL_ROOT (default
 * `<cwd>/templates/<templateId>`). At project creation we pin the template's
 * identity (id, version, source commit, manifest hash) computed HERE — never
 * from customer input — and at generation time we verify the loaded template
 * still matches the pinned manifest hash before any file is used.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;

export function templateRoot() {
  return resolve(process.env.TEMPLATE_LOCAL_ROOT || join(process.cwd(), 'templates'));
}

export function templateError(code, message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.expose = true;
  return err;
}

export function assertTemplateId(templateId) {
  const id = String(templateId || '').trim();
  if (!id || id.length > 100 || !TEMPLATE_ID_RE.test(id) || id.includes('..')) {
    throw templateError('BUILDER_TEMPLATE_ID_INVALID', 'templateId contains unsupported characters.');
  }
  return id;
}

export function templateDir(templateId) {
  const id = assertTemplateId(templateId);
  const dir = resolve(templateRoot(), id);
  if (!dir.startsWith(templateRoot() + sep)) {
    throw templateError('BUILDER_TEMPLATE_ID_INVALID', 'templateId resolves outside the template root.');
  }
  return dir;
}

export function templateExists(templateId) {
  try {
    return existsSync(templateDir(templateId));
  } catch {
    return false;
  }
}

/** Recursively list template files (relative paths, POSIX separators). Rejects symlinks. */
async function listTemplateFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const stats = await lstat(full);
    if (stats.isSymbolicLink()) {
      throw templateError('BUILDER_TEMPLATE_UNSAFE', `Template contains a symlink: ${entry.name}`, 500);
    }
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      files.push(...await listTemplateFiles(full, base));
    } else if (entry.isFile()) {
      const rel = full.slice(base.length + 1).split(sep).join('/');
      files.push(rel);
    }
  }
  return files.sort();
}

/**
 * Load a template from disk: metadata (template.json), file list, per-file
 * SHA-256, and a deterministic manifest hash over (path, size, sha256).
 */
export async function loadTemplate(templateId) {
  const id = assertTemplateId(templateId);
  const dir = templateDir(id);
  if (!existsSync(dir)) {
    throw templateError('BUILDER_TEMPLATE_NOT_FOUND', `Template "${id}" was not found on this server.`, 404);
  }

  let metadata = { templateId: id, name: id, version: 'v1' };
  const metadataPath = join(dir, 'template.json');
  if (existsSync(metadataPath)) {
    try {
      metadata = { ...metadata, ...JSON.parse(await readFile(metadataPath, 'utf8')) };
    } catch {
      throw templateError('BUILDER_TEMPLATE_METADATA_INVALID', `Template "${id}" has invalid template.json.`, 500);
    }
  }

  const relativePaths = await listTemplateFiles(dir);
  const files = [];
  const manifestHasher = createHash('sha256');
  for (const rel of relativePaths) {
    const content = await readFile(join(dir, rel));
    const sha256 = createHash('sha256').update(content).digest('hex');
    files.push({ path: rel, size: content.length, sha256 });
    manifestHasher.update(`${rel}\n${content.length}\n${sha256}\n`);
  }

  return {
    templateId: id,
    dir,
    metadata,
    version: String(metadata.version || 'v1'),
    sourceCommit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
    files,
    manifestHash: manifestHasher.digest('hex'),
  };
}

/**
 * Server-side pin used at project creation. Client-provided template integrity
 * fields are ignored by the caller in favor of this.
 */
export async function pinTemplate(templateId) {
  const template = await loadTemplate(templateId);
  return {
    templateId: template.templateId,
    templateVersion: template.version,
    templateSourceCommit: template.sourceCommit,
    templateManifestHash: template.manifestHash,
  };
}
