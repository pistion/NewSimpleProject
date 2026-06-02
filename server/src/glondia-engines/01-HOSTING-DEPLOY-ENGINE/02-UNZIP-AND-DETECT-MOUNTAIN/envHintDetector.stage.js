/**
 * envHintDetector.stage.js — 02-UNZIP-AND-DETECT-MOUNTAIN
 *
 * Inspects an extracted project for environment-variable requirements so the
 * deploy preview can warn users before a server app fails at runtime because
 * DATABASE_URL / JWT_SECRET / API keys are missing.
 *
 * This is advisory only — it never blocks a deploy. It returns hint lists plus
 * a coarse risk level and human-readable messages.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// Source files we scan for process.env.X / import.meta.env.VITE_X references.
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const MAX_FILES_SCANNED = 400;
const MAX_FILE_BYTES = 512 * 1024;

// Env names that almost always must be supplied for the app to run.
const REQUIRED_KEYWORDS = [
  'DATABASE_URL', 'MONGODB_URI', 'MONGO_URI', 'JWT_SECRET', 'SESSION_SECRET',
];
// Sensitive third-party credentials — required if referenced.
const SECRET_KEYWORDS = [
  'API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'SENDGRID_API_KEY',
  'TWILIO_AUTH_TOKEN', 'REDIS_URL', 'SUPABASE_KEY', 'SUPABASE_URL',
];
// DB libraries that imply a connection string is needed.
const DB_PACKAGES = ['prisma', '@prisma/client', 'mongoose', 'pg', 'mysql2', 'mysql', 'sqlite3', 'better-sqlite3', 'sequelize', 'knex', 'typeorm', 'redis', 'ioredis'];

const PROCESS_ENV_RE = /process\.env\.([A-Z0-9_]+)/g;
const PROCESS_ENV_BRACKET_RE = /process\.env\[\s*['"`]([A-Z0-9_]+)['"`]\s*\]/g;
const IMPORT_META_ENV_RE = /import\.meta\.env\.([A-Z0-9_]+)/g;
const DOTENV_LINE_RE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/;

/**
 * @param {string}   siteDir Absolute path to extracted directory.
 * @param {string[]} files   Relative file paths from extraction.
 * @returns {{ requiredEnv: string[], optionalEnv: string[], publicEnv: string[],
 *            databaseHints: string[], riskLevel: 'low'|'medium'|'high', messages: string[] }}
 */
export async function detectEnvHints(siteDir, files = []) {
  const required = new Set();
  const optional = new Set();
  const publicEnv = new Set();
  const databaseHints = new Set();
  const messages = [];

  const fileSet = new Set(files);

  // 1. package.json dependency scan for DB/auth libraries.
  let pkg = null;
  if (fileSet.has('package.json')) {
    pkg = await readJson(path.join(siteDir, 'package.json'));
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  for (const dbPkg of DB_PACKAGES) {
    if (deps[dbPkg]) {
      databaseHints.add(dbPkg);
    }
  }
  if (databaseHints.size) {
    // Map common DB libs to the connection-string env they conventionally read.
    if (deps['mongoose']) required.add('MONGODB_URI');
    if (deps['pg'] || deps['sequelize'] || deps['knex'] || deps['typeorm'] || deps['prisma'] || deps['@prisma/client'] || deps['mysql2'] || deps['mysql']) required.add('DATABASE_URL');
    if (deps['redis'] || deps['ioredis']) optional.add('REDIS_URL');
  }

  // 2. .env example/sample/template files — explicit declarations.
  for (const candidate of ['.env.example', '.env.sample', '.env.template', '.env.defaults']) {
    if (fileSet.has(candidate)) {
      const text = await readText(path.join(siteDir, candidate));
      if (text) {
        for (const line of text.split(/\r?\n/)) {
          const m = line.match(DOTENV_LINE_RE);
          if (!m) continue;
          classify(m[1], { required, optional, publicEnv });
        }
        messages.push(`Found ${candidate} — its keys are listed as environment hints.`);
      }
    }
  }

  // 3. README env sections (lightweight — only when an "environment" heading exists).
  for (const readme of ['README.md', 'readme.md', 'README.txt']) {
    if (fileSet.has(readme)) {
      const text = await readText(path.join(siteDir, readme));
      if (text && /##?\s*.*env(ironment)?/i.test(text)) {
        for (const name of text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || []) {
          if (isInterestingEnvName(name)) classify(name, { required, optional, publicEnv });
        }
      }
      break;
    }
  }

  // 4. Source-code scan for process.env.X and import.meta.env.VITE_X.
  let scanned = 0;
  for (const rel of files) {
    if (scanned >= MAX_FILES_SCANNED) break;
    const ext = path.extname(rel).toLowerCase();
    if (!CODE_EXTENSIONS.has(ext)) continue;
    scanned += 1;
    const text = await readText(path.join(siteDir, rel), MAX_FILE_BYTES);
    if (!text) continue;
    collect(text, PROCESS_ENV_RE, (name) => classify(name, { required, optional, publicEnv }));
    collect(text, PROCESS_ENV_BRACKET_RE, (name) => classify(name, { required, optional, publicEnv }));
    collect(text, IMPORT_META_ENV_RE, (name) => publicEnv.add(name));
  }

  // Public env (VITE_/NEXT_PUBLIC_/REACT_APP_) is never "required" for runtime.
  for (const name of publicEnv) {
    required.delete(name);
    optional.delete(name);
  }

  const requiredEnv = [...required].sort();
  const optionalEnv = [...optional].filter((n) => !required.has(n)).sort();

  let riskLevel = 'low';
  if (requiredEnv.length >= 3 || (databaseHints.size && requiredEnv.length)) riskLevel = 'high';
  else if (requiredEnv.length || databaseHints.size) riskLevel = 'medium';

  if (requiredEnv.length) {
    messages.push(`Detected required env hints: ${requiredEnv.join(', ')}.`);
  }
  if (databaseHints.size) {
    messages.push(`Database library detected (${[...databaseHints].join(', ')}). A connection string is likely required.`);
  }

  return {
    requiredEnv,
    optionalEnv,
    publicEnv: [...publicEnv].sort(),
    databaseHints: [...databaseHints].sort(),
    riskLevel,
    messages,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classify(name, { required, optional, publicEnv }) {
  if (!isInterestingEnvName(name)) return;
  if (/^(VITE_|NEXT_PUBLIC_|REACT_APP_|PUBLIC_)/.test(name)) {
    publicEnv.add(name);
    return;
  }
  if (REQUIRED_KEYWORDS.some((k) => name === k) || SECRET_KEYWORDS.some((k) => name === k || name.endsWith(`_${k}`))) {
    required.add(name);
    return;
  }
  // Heuristic: secret/url-ish names lean required, everything else optional.
  if (/(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|_URI|_URL|API_KEY)$/.test(name)) {
    required.add(name);
  } else {
    optional.add(name);
  }
}

// Skip Node/runtime built-ins and noise.
const IGNORED_ENV = new Set([
  'NODE_ENV', 'PORT', 'HOST', 'PWD', 'HOME', 'PATH', 'TZ', 'CI', 'DEBUG',
  'NODE_VERSION', 'npm_config_loglevel', 'RENDER', 'RENDER_EXTERNAL_URL',
]);

function isInterestingEnvName(name) {
  if (!name || name.length < 3) return false;
  if (IGNORED_ENV.has(name)) return false;
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return false;
  return true;
}

function collect(text, regex, onMatch) {
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    onMatch(m[1]);
  }
}

async function readText(filePath, maxBytes = MAX_FILE_BYTES) {
  try {
    const buf = await fs.readFile(filePath);
    return buf.subarray(0, maxBytes).toString('utf8');
  } catch {
    return null;
  }
}

async function readJson(filePath) {
  const text = await readText(filePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default { detectEnvHints };
