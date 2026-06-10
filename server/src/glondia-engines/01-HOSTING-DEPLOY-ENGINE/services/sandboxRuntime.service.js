/**
 * sandboxRuntime.service.js
 *
 * Sandbox process lifecycle: start, proxy, list files.
 * The sandbox root is derived from DATA_DIR at startup.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

// ── Data / sandbox root resolution ───────────────────────────────────────────

const rootDir = resolve(process.cwd());

function resolveDataDir() {
  const configured = process.env.DATA_DIR;
  const fallback = join(rootDir, '.glondia-data');
  if (!configured) return ensureDataDir(fallback);
  if (process.platform === 'win32' && configured.startsWith('/var/')) {
    return ensureDataDir(fallback);
  }
  const configuredDir = resolve(configured);
  try {
    return ensureDataDir(configuredDir);
  } catch (err) {
    console.warn(`[sandbox] DATA_DIR "${configuredDir}" is not writable (${err.code || err.message}); using "${fallback}" instead.`);
    return ensureDataDir(fallback);
  }
}

function ensureDataDir(dir) {
  mkdirSync(join(dir, 'sandboxes'), { recursive: true });
  return dir;
}

const dataDir = resolveDataDir();
const sandboxRoot = join(dataDir, 'sandboxes');

// In-memory map of running sandbox processes
const sandboxProcesses = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

export function sanitizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function childProcessEnv(extra = {}) {
  const allowed = [
    'PATH', 'Path', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'SystemRoot',
    'TEMP', 'TMP', 'COMSPEC', 'ComSpec', 'PATHEXT', 'NPM_CONFIG_CACHE',
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, CI: 'true', npm_config_audit: 'false', npm_config_fund: 'false', ...extra };
}

export async function listSandboxFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (files.length >= 500) break;
    if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
    const absolute = join(dir, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listSandboxFiles(absolute, relative));
    else files.push({ path: relative });
  }
  return files;
}

export function startSandboxRuntime(siteId, cwd, port) {
  const existing = sandboxProcesses.get(siteId);
  if (existing?.child) existing.child.kill();
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['start'], {
    cwd,
    env: childProcessEnv({ PORT: String(port), NODE_ENV: 'development' }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const runtime = { child, port, logs: [] };
  child.stdout?.on('data', (chunk) => runtime.logs.push(String(chunk).trim()));
  child.stderr?.on('data', (chunk) => runtime.logs.push(String(chunk).trim()));
  child.on('exit', (code, signal) => { runtime.exited = { code, signal }; });
  sandboxProcesses.set(siteId, runtime);
  return runtime;
}

export async function proxySandboxRuntime(req, res, next, port, siteId) {
  try {
    const prefix = `/sandbox/${siteId}`;
    const original = req.originalUrl || req.url || '/';
    const targetPath = original.startsWith(prefix) ? original.slice(prefix.length) || '/' : req.url || '/';
    const target = `http://127.0.0.1:${port}${targetPath}`;
    const response = await fetch(target, {
      method: req.method,
      headers: {
        accept: req.headers.accept || '*/*',
        'user-agent': req.headers['user-agent'] || 'GlondiaSandbox',
      },
      redirect: 'manual',
    });
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export function getSandboxRoot() {
  return sandboxRoot;
}

export function getDataDir() {
  return dataDir;
}

export function getSandboxProcesses() {
  return sandboxProcesses;
}

// Named export object for use by providerRender.service.js
export const sandboxRuntimeService = {
  sanitizeId,
  listSandboxFiles,
  startSandboxRuntime,
  proxySandboxRuntime,
  getSandboxRoot,
  getDataDir,
  getSandboxProcesses,
};

export default sandboxRuntimeService;
