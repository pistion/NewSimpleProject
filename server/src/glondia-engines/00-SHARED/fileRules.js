/**
 * fileRules.js — 00-SHARED
 *
 * All rules for what is safe to extract, accept, or deploy from a ZIP.
 * Single source of truth — both ZIP services import from here.
 *
 * Previously duplicated across:
 *   services/zipExtractor.js
 *   services/zipSiteDeployment.service.js
 */

// ── Folders always ignored ────────────────────────────────────────────────────
export const IGNORED_FOLDER_PREFIXES = [
  'node_modules/',
  '.git/',
  '.next/cache/',
  '.next/server/cache/',
  '.vercel/',
  '.netlify/',
  'coverage/',
  '.cache/',
  '.parcel-cache/',
  '.turbo/',
  '.vite/',
  'dist/.vite/',
  '__MACOSX/',
  '.idea/',
  '.vscode/',
  '.pnpm-store/',
  '.yarn/cache/',
];

// ── Individual files always ignored ──────────────────────────────────────────
export const IGNORED_EXACT_FILES = [
  '.DS_Store',
  'Thumbs.db',
  'npm-debug.log',
  'yarn-error.log',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
];

// ── Untrusted executable extensions ──────────────────────────────────────────
// Never deploy user-uploaded scripts.
// Exception: the generated backend shell file is always kept.
export const UNTRUSTED_SCRIPT_EXTENSIONS = ['.sh', '.bat', '.cmd', '.ps1'];
export const GENERATED_SHELL_FILE = 'glondia-render-build.sh';

// ── Size limits ───────────────────────────────────────────────────────────────
export const MAX_ZIP_BYTES       = Number(process.env.ZIP_UPLOAD_MAX_BYTES       || 100 * 1024 * 1024);
export const MAX_EXTRACTED_FILES = Number(process.env.ZIP_UPLOAD_MAX_FILES       || 5000);
export const MAX_ENTRY_BYTES     = Number(process.env.ZIP_UPLOAD_MAX_ENTRY_BYTES || 25 * 1024 * 1024);

// ── Check helpers ─────────────────────────────────────────────────────────────

/**
 * Returns { ignore: true, reason } if the relative path should be skipped.
 */
export function shouldIgnoreEntry(relativeName) {
  const normalized = cleanZipPath(relativeName);
  const lower = normalized.toLowerCase();

  for (const prefix of IGNORED_FOLDER_PREFIXES) {
    if (lower.startsWith(prefix) || lower.includes(`/${prefix}`)) {
      return { ignore: true, reason: `ignored-folder: ${prefix}`, folder: prefix };
    }
  }

  const baseName = lower.split('/').pop();
  for (const exact of IGNORED_EXACT_FILES) {
    if (baseName === exact.toLowerCase()) {
      return { ignore: true, reason: `ignored-file: ${exact}` };
    }
  }

  if (isUnsafeExecutable(relativeName)) {
    return { ignore: true, reason: 'untrusted-script' };
  }

  return { ignore: false, reason: '' };
}

/**
 * Returns true if a file is an untrusted executable that should never be deployed.
 * Exception: the Glondia-generated build script is always allowed.
 */
export function isUnsafeExecutable(relativeName) {
  const normalized = cleanZipPath(relativeName);
  const baseName = normalized.split('/').pop().toLowerCase();
  if (baseName === GENERATED_SHELL_FILE) return false;
  const ext = baseName.substring(baseName.lastIndexOf('.')).toLowerCase();
  return UNTRUSTED_SCRIPT_EXTENSIONS.includes(ext);
}

/**
 * Returns true if the extracted file list contains at least one deployable root entry.
 */
export function hasDeployableEntry(files) {
  const set = new Set(files);
  return (
    set.has('package.json')    ||
    set.has('index.html')      ||
    set.has('dist/index.html') ||
    set.has('build/index.html')||
    set.has('out/index.html')  ||
    set.has('public/index.html')
  );
}

/**
 * Normalise a ZIP entry path: forward slashes, no leading slash.
 */
export function cleanZipPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

/**
 * Detect a common root folder prefix (e.g. when the ZIP has one top-level folder).
 * Only strips the prefix when ALL entries are nested inside a subdirectory.
 */
export function detectRootPrefix(names) {
  const firstParts = names
    .map((name) => cleanZipPath(name).split('/').filter(Boolean)[0])
    .filter(Boolean);
  const unique = new Set(firstParts);
  if (unique.size !== 1) return '';
  const candidate = [...unique][0];
  // Only treat it as a folder prefix if every entry has a '/' separator
  const allNested = names.every((name) => cleanZipPath(name).includes('/'));
  return allNested ? `${candidate}/` : '';
}
