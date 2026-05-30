import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

const SKIP_FOLDERS = ['node_modules/', '.git/', '.next/cache/', '.vercel/', '.netlify/', 'coverage/', '.cache/', '.parcel-cache/', '.turbo/', '.vite/', '__MACOSX/', '.idea/', '.vscode/', '.pnpm-store/', '.yarn/cache/'];
const SKIP_FILES = ['.DS_Store', 'Thumbs.db', 'npm-debug.log', 'yarn-error.log', '.env', '.env.local', '.env.production', '.env.development'];

export async function extractZipSafely(zipBuffer, destination, options = {}) {
  const maxFiles = Number(options.maxFiles || process.env.ZIP_UPLOAD_MAX_FILES || process.env.MAX_DEPLOYABLE_FILES || 5000);
  const maxEntryBytes = Number(options.maxEntryBytes || process.env.ZIP_UPLOAD_MAX_ENTRY_BYTES || process.env.MAX_ENTRY_BYTES || 25 * 1024 * 1024);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (!entries.length) throw badRequest('ZIP does not contain any files.', 'ZIP_NO_FILES', 'zip_validation');

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  const rootPrefix = detectRootPrefix(entries.map((entry) => entry.entryName));
  const root = path.resolve(destination);
  const files = [];
  const ignoredFiles = [];
  const ignoredFolderSet = new Set();

  for (const entry of entries) {
    const relativeName = cleanZipPath(rootPrefix ? entry.entryName.slice(rootPrefix.length) : entry.entryName);
    if (!relativeName) continue;

    const ignore = shouldSkip(relativeName);
    if (ignore.skip) {
      ignoredFiles.push({ path: relativeName, reason: ignore.reason });
      if (ignore.folder) ignoredFolderSet.add(ignore.folder);
      continue;
    }

    if (entry.header.size > maxEntryBytes) throw badRequest(`ZIP entry is too large: ${entry.entryName}. Max per file is ${maxEntryBytes} bytes.`, 'ZIP_ENTRY_TOO_LARGE', 'zip_validation');
    if (files.length >= maxFiles) throw badRequest(`ZIP has too many deployable files after cleanup. Max: ${maxFiles}.`, 'ZIP_TOO_MANY_DEPLOYABLE_FILES', 'zip_validation');

    const outputPath = path.resolve(root, relativeName);
    if (!isInside(root, outputPath)) throw badRequest(`ZIP entry path is not allowed: ${entry.entryName}`, 'ZIP_PATH_NOT_ALLOWED', 'zip_extract');

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, entry.getData());
    files.push(relativeName);
  }

  if (!hasDeployableRoot(files)) throw badRequest('ZIP does not look deployable. Expected package.json, index.html, dist/index.html, build/index.html, out/index.html, or public/index.html.', 'ZIP_NOT_DEPLOYABLE', 'project_detection');

  return { rawEntryCount: entries.length, files, ignoredFiles, ignoredFolderExamples: [...ignoredFolderSet].slice(0, 12), rootPrefix };
}

function shouldSkip(relativeName) {
  const normalized = cleanZipPath(relativeName);
  const lower = normalized.toLowerCase();
  for (const folder of SKIP_FOLDERS) {
    if (lower.startsWith(folder) || lower.includes(`/${folder}`)) return { skip: true, reason: `ignored-folder: ${folder}`, folder };
  }
  const baseName = lower.split('/').pop();
  for (const exact of SKIP_FILES) {
    if (baseName === exact.toLowerCase()) return { skip: true, reason: `ignored-file: ${exact}` };
  }
  return { skip: false, reason: '' };
}

function detectRootPrefix(names) {
  const firstParts = names.map((name) => cleanZipPath(name).split('/').filter(Boolean)[0]).filter(Boolean);
  const unique = new Set(firstParts);
  return unique.size === 1 ? `${[...unique][0]}/` : '';
}

function cleanZipPath(value) {
  const clean = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').includes('..')) return '';
  return clean;
}

function hasDeployableRoot(files) {
  const set = new Set(files);
  return set.has('package.json') || set.has('index.html') || set.has('dist/index.html') || set.has('build/index.html') || set.has('out/index.html') || set.has('public/index.html');
}

function isInside(root, child) {
  const relative = path.relative(root, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function badRequest(message, code = 'BAD_REQUEST', stage = 'zip_validation') {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  err.stage = stage;
  err.expose = true;
  return err;
}
