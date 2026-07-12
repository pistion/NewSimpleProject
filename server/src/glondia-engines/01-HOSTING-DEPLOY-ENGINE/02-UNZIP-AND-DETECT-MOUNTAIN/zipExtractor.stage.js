/**
 * zipExtractor.stage.js — 02-UNZIP-AND-DETECT-MOUNTAIN
 *
 * Safely extracts a ZIP buffer to a destination directory.
 * Filters ignored folders/files and unsafe scripts.
 * Enforces size and file-count limits.
 * Uses shared fileRules from 00-SHARED.
 *
 * Moved from: server/src/services/zipExtractor.js
 * Original kept as a thin re-export for backward compatibility.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  shouldIgnoreEntry,
  hasDeployableEntry,
  detectRootPrefix,
  cleanZipPath,
  MAX_EXTRACTED_FILES,
  MAX_ENTRY_BYTES,
} from '../../00-SHARED/fileRules.js';
import {
  assertActualBytes,
  assertEntrySafe,
  hasZipMagic,
  newGuardState,
  zipError,
  zipLimits,
} from '../../../builder/security/zipGuard.js';
import { validateWorkspace } from '../../../builder/generation/outputValidator.js';
import { stageFail, stageStart, stageSuccess } from '../../00-SHARED/stageLogger.js';

export async function runStage(context) {
  const stageName = 'zip_extract';
  stageStart(context, stageName, context.source?.localDir || null);
  try {
    const file = context.input?.file;
    const zipBuffer = file?.buffer || file?.path || context.input?.zipBuffer;
    if (!zipBuffer) throw badRequest('A ZIP buffer is required before extraction.', 'ZIP_BUFFER_REQUIRED', stageName);
    const extracted = await extractZipSafely(zipBuffer, context.source.localDir, context.input?.extractOptions || {});
    context.source.files = extracted.files;
    context.source.ignoredFiles = extracted.ignoredFiles;
    context.source.extracted = extracted;
    stageSuccess(context, stageName, `${extracted.files.length} deployable files`);
    return context;
  } catch (error) {
    stageFail(context, stageName, error);
    throw error;
  }
}

/**
 * Extract a ZIP safely to the destination directory.
 *
 * Hostile-archive defense (builder/security/zipGuard): magic bytes, encrypted
 * entries, symlinks/devices, traversal + null bytes + absolute paths, path
 * depth/length, duplicate/case-colliding paths, nested-archive abuse,
 * per-entry and aggregate size limits, compression-ratio limits — all checked
 * on entry METADATA before any data is decompressed, then re-verified against
 * actual decompressed bytes. After extraction the tree is secret-scanned and
 * blocked if credentials are found.
 *
 * @param {Buffer|string} zipSource  ZIP buffer or path to a quarantined file
 * @param {string} destination       Absolute path to extract into
 * @param {object} [options]         Override limits: { maxFiles, maxEntryBytes, skipSecretScan }
 * @returns {{ rawEntryCount, files, ignoredFiles, ignoredFolderExamples, rootPrefix, secretScan }}
 */
export async function extractZipSafely(zipSource, destination, options = {}) {
  const limits = zipLimits();
  const maxFiles      = Number(options.maxFiles      || Math.min(MAX_EXTRACTED_FILES, limits.maxFiles));
  const maxEntryBytes = Number(options.maxEntryBytes || Math.min(MAX_ENTRY_BYTES, limits.maxEntryBytes));
  const effectiveLimits = { ...limits, maxEntryBytes };

  if (Buffer.isBuffer(zipSource)) {
    if (!hasZipMagic(zipSource)) {
      throw zipError('ZIP_INVALID_SIGNATURE', 'The uploaded file is not a ZIP archive.');
    }
    if (zipSource.length > limits.maxCompressedBytes) {
      throw zipError('ZIP_FILE_TOO_LARGE', `ZIP exceeds the ${limits.maxCompressedBytes}-byte upload limit.`);
    }
  } else if (typeof zipSource === 'string') {
    const head = Buffer.alloc(4);
    const handle = await fs.open(zipSource, 'r');
    try { await handle.read(head, 0, 4, 0); } finally { await handle.close(); }
    if (!hasZipMagic(head)) {
      throw zipError('ZIP_INVALID_SIGNATURE', 'The uploaded file is not a ZIP archive.');
    }
    const stats = await fs.stat(zipSource);
    if (stats.size > limits.maxCompressedBytes) {
      throw zipError('ZIP_FILE_TOO_LARGE', `ZIP exceeds the ${limits.maxCompressedBytes}-byte upload limit.`);
    }
  }

  let zip;
  try {
    zip = new AdmZip(zipSource);
  } catch {
    throw zipError('ZIP_INVALID_SIGNATURE', 'The uploaded file could not be read as a ZIP archive.');
  }
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  if (!entries.length) throw badRequest('ZIP does not contain any files.', 'ZIP_NO_FILES', 'zip_validation');

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  const rootPrefix       = detectRootPrefix(entries.map((e) => e.entryName));
  const root             = path.resolve(destination);
  const files            = [];
  const ignoredFiles     = [];
  const ignoredFolderSet = new Set();
  const guardState       = newGuardState();

  // Pass 1 — metadata only. Reject the whole archive before touching data.
  const accepted = [];
  for (const entry of entries) {
    const relativeName = cleanZipPath(
      rootPrefix ? entry.entryName.slice(rootPrefix.length) : entry.entryName,
    );
    if (!relativeName) continue;

    assertEntrySafe(entry, relativeName, effectiveLimits, guardState);

    const ignore = shouldIgnoreEntry(relativeName);
    if (ignore.ignore) {
      ignoredFiles.push({ path: relativeName, reason: ignore.reason });
      if (ignore.folder) ignoredFolderSet.add(ignore.folder);
      continue;
    }
    accepted.push({ entry, relativeName });
    if (accepted.length > maxFiles) {
      throw badRequest(
        `ZIP has too many deployable files after cleanup. Max: ${maxFiles}.`,
        'ZIP_TOO_MANY_DEPLOYABLE_FILES',
        'zip_validation',
      );
    }
  }

  // Pass 2 — extraction with actual-size enforcement.
  for (const { entry, relativeName } of accepted) {
    const outputPath = path.resolve(root, relativeName);
    if (!isInside(root, outputPath)) {
      throw badRequest(`ZIP entry path is not allowed: ${entry.entryName}`, 'ZIP_PATH_NOT_ALLOWED', 'zip_extract');
    }
    const data = entry.getData();
    assertActualBytes(guardState, effectiveLimits, data.length, relativeName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, data);
    files.push(relativeName);
  }

  if (!hasDeployableEntry(files)) {
    throw badRequest(
      'ZIP does not look deployable. Expected package.json, index.html, dist/index.html, build/index.html, out/index.html, or public/index.html.',
      'ZIP_NOT_DEPLOYABLE',
      'project_detection',
    );
  }

  // Pass 3 — secret scan of the extracted tree. Credentials block the import;
  // the finding never includes the secret value.
  let secretScan = { ok: true, skipped: true };
  if (options.skipSecretScan !== true) {
    const report = await validateWorkspace(root, { requireEntry: null });
    const blocking = report.errors.filter((e) => ['SECRET_DETECTED', 'BLOCKED_FILE', 'SYMLINK_IN_OUTPUT'].includes(e.code));
    secretScan = { ok: blocking.length === 0, findings: blocking.map((e) => ({ code: e.code, file: e.file, detail: e.detail })) };
    if (!secretScan.ok) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
      throw zipError(
        'ZIP_SECRETS_DETECTED',
        `The ZIP contains credentials or blocked files (${secretScan.findings.map((f) => f.file).slice(0, 5).join(', ')}). Remove them and upload again.`,
      );
    }
  }

  return {
    rawEntryCount:        entries.length,
    files,
    ignoredFiles,
    ignoredFolderExamples: [...ignoredFolderSet].slice(0, 12),
    rootPrefix,
    secretScan,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInside(root, child) {
  const relative = path.relative(root, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function badRequest(message, code = 'BAD_REQUEST', stage = 'zip_validation') {
  const err    = new Error(message);
  err.status   = 400;
  err.code     = code;
  err.stage    = stage;
  err.expose   = true;
  return err;
}
