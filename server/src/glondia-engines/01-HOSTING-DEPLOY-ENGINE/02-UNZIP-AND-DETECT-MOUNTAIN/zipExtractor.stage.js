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
import { stageFail, stageStart, stageSuccess } from '../../00-SHARED/stageLogger.js';

export async function runStage(context) {
  const stageName = 'zip_extract';
  stageStart(context, stageName, context.source?.localDir || null);
  try {
    const file = context.input?.file;
    const zipBuffer = file?.buffer || context.input?.zipBuffer;
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
 * Extract a ZIP buffer safely to the destination directory.
 *
 * @param {Buffer} zipBuffer
 * @param {string} destination  Absolute path to extract into
 * @param {object} [options]    Override limits: { maxFiles, maxEntryBytes }
 * @returns {{ rawEntryCount, files, ignoredFiles, ignoredFolderExamples, rootPrefix }}
 */
export async function extractZipSafely(zipBuffer, destination, options = {}) {
  const maxFiles      = Number(options.maxFiles      || MAX_EXTRACTED_FILES);
  const maxEntryBytes = Number(options.maxEntryBytes || MAX_ENTRY_BYTES);

  const zip     = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  if (!entries.length) throw badRequest('ZIP does not contain any files.', 'ZIP_NO_FILES', 'zip_validation');

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  const rootPrefix       = detectRootPrefix(entries.map((e) => e.entryName));
  const root             = path.resolve(destination);
  const files            = [];
  const ignoredFiles     = [];
  const ignoredFolderSet = new Set();

  for (const entry of entries) {
    const relativeName = cleanZipPath(
      rootPrefix ? entry.entryName.slice(rootPrefix.length) : entry.entryName,
    );
    if (!relativeName) continue;

    const ignore = shouldIgnoreEntry(relativeName);
    if (ignore.ignore) {
      ignoredFiles.push({ path: relativeName, reason: ignore.reason });
      if (ignore.folder) ignoredFolderSet.add(ignore.folder);
      continue;
    }

    if (entry.header.size > maxEntryBytes) {
      throw badRequest(
        `ZIP entry is too large: ${entry.entryName}. Max per file is ${maxEntryBytes} bytes.`,
        'ZIP_ENTRY_TOO_LARGE',
        'zip_validation',
      );
    }
    if (files.length >= maxFiles) {
      throw badRequest(
        `ZIP has too many deployable files after cleanup. Max: ${maxFiles}.`,
        'ZIP_TOO_MANY_DEPLOYABLE_FILES',
        'zip_validation',
      );
    }

    const outputPath = path.resolve(root, relativeName);
    if (!isInside(root, outputPath)) {
      throw badRequest(`ZIP entry path is not allowed: ${entry.entryName}`, 'ZIP_PATH_NOT_ALLOWED', 'zip_extract');
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, entry.getData());
    files.push(relativeName);
  }

  if (!hasDeployableEntry(files)) {
    throw badRequest(
      'ZIP does not look deployable. Expected package.json, index.html, dist/index.html, build/index.html, out/index.html, or public/index.html.',
      'ZIP_NOT_DEPLOYABLE',
      'project_detection',
    );
  }

  return {
    rawEntryCount:        entries.length,
    files,
    ignoredFiles,
    ignoredFolderExamples: [...ignoredFolderSet].slice(0, 12),
    rootPrefix,
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
