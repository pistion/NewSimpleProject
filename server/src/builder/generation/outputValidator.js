/**
 * outputValidator.js — blocking validation of generated site output.
 *
 * Generated output is treated as untrusted until proven safe: secrets,
 * unsafe file types, traversal-shaped paths, or a missing deployable entry
 * fail the generation permanently. Secret VALUES are never logged or
 * returned — findings carry file + pattern name only.
 */

import { readFile, readdir, lstat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt',
  '.svg', '.yml', '.yaml', '.env', '.xml', '.cjs', '.mjs',
]);

const BLOCKED_FILENAMES = [
  /^\.env(\..*)?$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
];

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.ps1', '.msi', '.com', '.scr',
  '.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.jar',
]);

// name → detector. Values are never captured, only the match location.
const SECRET_PATTERNS = [
  ['private_key_block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/],
  ['openai_key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['github_token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/],
  ['github_pat', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ['render_key', /\brnd_[A-Za-z0-9]{20,}\b/],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/],
  ['slack_token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['stripe_key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ['database_url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"@]{1,64}:[^\s'"@]{1,128}@/i],
  ['paypal_client_secret', /\bE[A-Za-z0-9_-]{40,}\b(?=.{0,40}(secret|paypal))/i],
  ['jwt_secret_assignment', /\b(?:JWT_SECRET|SESSION_SECRET|SIGNING_SECRET)\s*[:=]\s*['"][^'"]{12,}['"]/i],
  ['generic_high_entropy', /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"][A-Za-z0-9+/_=-]{32,}['"]/i],
];

async function walk(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const stats = await lstat(full);
    const rel = full.slice(base.length + 1).split(sep).join('/');
    if (stats.isSymbolicLink()) {
      files.push({ rel, symlink: true });
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...await walk(full, base));
    } else if (entry.isFile()) {
      files.push({ rel, size: stats.size });
    }
  }
  return files;
}

/**
 * Scan a generated workspace. Returns a validation report:
 * { ok, errors: [{code, file, detail}], warnings, fileCount, totalBytes }
 */
export async function validateWorkspace(workspaceDir, { requireEntry = 'index.html' } = {}) {
  const errors = [];
  const warnings = [];
  const files = await walk(workspaceDir);
  let totalBytes = 0;
  let hasEntry = false;

  for (const file of files) {
    if (file.symlink) {
      errors.push({ code: 'SYMLINK_IN_OUTPUT', file: file.rel });
      continue;
    }
    totalBytes += file.size || 0;
    const rel = file.rel;
    const lower = rel.toLowerCase();
    const base = lower.split('/').pop();

    if (rel.split('/').some((part) => part === '..' || part.includes('\0'))) {
      errors.push({ code: 'UNSAFE_PATH', file: rel });
      continue;
    }
    if (BLOCKED_FILENAMES.some((re) => re.test(base) || re.test(lower))) {
      errors.push({ code: 'BLOCKED_FILE', file: rel });
      continue;
    }
    const ext = extname(lower);
    if (BLOCKED_EXTENSIONS.has(ext)) {
      errors.push({ code: 'BLOCKED_FILE_TYPE', file: rel });
      continue;
    }
    if (rel === requireEntry) hasEntry = true;

    if (TEXT_EXTENSIONS.has(ext) && (file.size || 0) <= 2 * 1024 * 1024) {
      const text = await readFile(join(workspaceDir, ...rel.split('/')), 'utf8').catch(() => '');
      for (const [name, pattern] of SECRET_PATTERNS) {
        if (pattern.test(text)) {
          errors.push({ code: 'SECRET_DETECTED', file: rel, detail: name });
          break; // one finding per file is enough to block
        }
      }
    }
  }

  if (!hasEntry) {
    errors.push({ code: 'MISSING_DEPLOYABLE_ENTRY', file: requireEntry });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    fileCount: files.filter((f) => !f.symlink).length,
    totalBytes,
    scannedAt: new Date().toISOString(),
  };
}

export { SECRET_PATTERNS };
