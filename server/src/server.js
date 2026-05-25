import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { requestId } from './middleware/request-id.middleware.js';
import { responseHelper } from './middleware/response.middleware.js';

import publicRoutes from './routes/public.routes.js';
import authRoutes from './routes/auth.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import workspaceDetailRoutes from './routes/workspace-detail.routes.js';
import projectRoutes from './routes/project.routes.js';
import domainPublicRoutes from './routes/domain-public.routes.js';
import domainRoutes from './routes/domain.routes.js';
import siteRoutes from './routes/site.routes.js';
import publicSalesRoutes from './routes/public-sales.routes.js';
import commerceRoutes from './routes/commerce.routes.js';
import templateRoutes from './routes/template.routes.js';
import eventsRoutes from './routes/events.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import billingRoutes from './routes/billing.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import eventStreamRoutes from './routes/event-stream.routes.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const isProd = process.env.NODE_ENV === 'production';
// Render injects PORT automatically. Local dev defaults to 3001 (matches vite proxy).
const PORT = Number(process.env.PORT || (isProd ? 10000 : 3001));
const execFileAsync = promisify(execFile);

// ── Static file serving ─────────────────────────────────────────────────────
const rootDir = resolve(process.cwd());
const distDir = join(rootDir, 'dist');
const dataDir = resolveDataDir();
const sandboxRoot = join(dataDir, 'sandboxes');
mkdirSync(sandboxRoot, { recursive: true });
const sandboxProcesses = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const safePath = decodedPath.replace(/^\/+/, '');
  let filePath = resolve(distDir, safePath);

  if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

function resolveDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return join(rootDir, '.glondia-data');
  if (process.platform === 'win32' && configured.startsWith('/var/')) {
    return join(rootDir, '.glondia-data');
  }
  return resolve(configured);
}

// ── Global middleware ────────────────────────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : (isProd ? false : true); // allow all in dev, same-origin only in production

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(requestId);
app.use(responseHelper);

// ── Health check (must come before API and static routes) ───────────────────
app.get('/healthz', (req, res) => {
  res.type('text/plain').send('ok');
});

app.post('/api/builder/import-github', providerApiGuard, async (req, res, next) => {
  try {
    const result = await importGithubSandbox(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/render/deploy', providerApiGuard, async (req, res, next) => {
  try {
    const result = await triggerRenderDeploy(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/render/test-deploy', providerApiGuard, async (req, res, next) => {
  try {
    const result = await testRenderDeploy(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/render/activate-repo', providerApiGuard, async (req, res, next) => {
  try {
    const result = await activateRenderRepoService(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/render/settings', async (req, res, next) => {
  try {
    res.json(getRenderSettings());
  } catch (error) {
    next(error);
  }
});

app.get('/api/render/deploys', async (req, res, next) => {
  try {
    const result = await listRenderDeploys();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/render/services', async (req, res, next) => {
  try {
    const result = await listRenderServices();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use('/sandbox/:siteId', (req, res, next) => {
  const siteId = sanitizeId(req.params.siteId);
  const sandboxDist = resolve(sandboxRoot, siteId, 'dist');
  if (!siteId || !sandboxDist.startsWith(sandboxRoot)) return next();
  const runtime = sandboxProcesses.get(siteId);
  if (runtime?.port) return proxySandboxRuntime(req, res, next, runtime.port, siteId);
  if (!existsSync(sandboxDist)) return next();
  return express.static(sandboxDist, {
    index: 'index.html',
    fallthrough: true,
    setHeaders(response, filePath) {
      response.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=60');
    },
  })(req, res, next);
});

app.get('/sandbox/:siteId/*', (req, res, next) => {
  const siteId = sanitizeId(req.params.siteId);
  const indexPath = resolve(sandboxRoot, siteId, 'dist', 'index.html');
  if (!siteId || !indexPath.startsWith(sandboxRoot) || !existsSync(indexPath)) return next();
  res.type('html').sendFile(indexPath);
});

// ── API routes ───────────────────────────────────────────────────────────────

// Public (unauthenticated)
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/public/sites', publicSalesRoutes);
app.use('/api/v1/domains', domainPublicRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/events', eventsRoutes);

// Auth
app.use('/api/v1/auth', authRoutes);

// Workspace (authenticated)
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/workspaces/:workspaceId', workspaceDetailRoutes);
app.use('/api/v1/workspaces/:workspaceId/projects', projectRoutes);
app.use('/api/v1/workspaces/:workspaceId/domains', domainRoutes);
app.use('/api/v1/workspaces/:workspaceId/sites', siteRoutes);
app.use('/api/v1/workspaces/:workspaceId/commerce', commerceRoutes);
app.use('/api/v1/workspaces/:workspaceId/analytics', analyticsRoutes);
app.use('/api/v1/workspaces/:workspaceId/billing', billingRoutes);
app.use('/api/v1/workspaces/:workspaceId/settings', settingsRoutes);
app.use('/api/v1/workspaces/:workspaceId/events', eventStreamRoutes);

// ── SPA fallback — serve Vite dist for everything else ──────────────────────
app.use((req, res) => serveStatic(req, res));

function sanitizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

const providerRateWindowMs = Number(process.env.PROVIDER_RATE_WINDOW_MS || 60_000);
const providerRateLimit = Number(process.env.PROVIDER_RATE_LIMIT || 20);
const providerRateBuckets = new Map();

function providerApiGuard(req, res, next) {
  if (String(process.env.PROVIDER_API_ENABLED || 'true').toLowerCase() === 'false') {
    return res.status(503).json({ status: 'disabled', message: 'Provider API endpoints are disabled.' });
  }

  const token = process.env.PROVIDER_API_TOKEN;
  if (token) {
    const expected = `Bearer ${token}`;
    if (req.headers.authorization !== expected) {
      return res.status(401).json({ status: 'unauthorized', message: 'Provider API token is required.' });
    }
  }

  const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
  const now = Date.now();
  const bucket = providerRateBuckets.get(key) || { count: 0, resetAt: now + providerRateWindowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + providerRateWindowMs;
  }
  bucket.count += 1;
  providerRateBuckets.set(key, bucket);
  res.setHeader('X-RateLimit-Limit', String(providerRateLimit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, providerRateLimit - bucket.count)));
  if (bucket.count > providerRateLimit) {
    return res.status(429).json({ status: 'rate_limited', message: 'Too many provider API requests. Try again shortly.' });
  }

  return next();
}

function parseGithubRepo(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const ssh = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return normalizeGithubRepo(ssh[1], ssh[2]);
  const shorthand = raw.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand && !raw.includes('://')) return normalizeGithubRepo(shorthand[1], shorthand[2]);
  try {
    const url = new URL(raw);
    if (!/github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return null;
    return normalizeGithubRepo(parts[0], parts[1]);
  } catch {
    return null;
  }
}

function normalizeGithubRepo(owner, repo) {
  const cleanOwner = String(owner || '').trim();
  const cleanRepo = String(repo || '').trim().replace(/\.git$/i, '');
  if (!cleanOwner || !cleanRepo) return null;
  return {
    owner: cleanOwner,
    repo: cleanRepo,
    fullName: `${cleanOwner}/${cleanRepo}`,
    url: `https://github.com/${cleanOwner}/${cleanRepo}.git`,
  };
}

function assertRepoAllowed(repo) {
  const allowlist = String(process.env.GITHUB_REPO_ALLOWLIST || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.length) return;
  const fullName = repo.fullName.toLowerCase();
  const allowed = allowlist.some((item) => item === fullName || item === repo.owner.toLowerCase() || item === '*');
  if (!allowed) {
    const error = new Error(`Repository ${repo.fullName} is not allowed in this environment.`);
    error.status = 403;
    throw error;
  }
}

function safeBranchName(value) {
  const branch = String(value || 'main').trim() || 'main';
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
    const error = new Error('Branch contains unsupported characters.');
    error.status = 400;
    throw error;
  }
  return branch;
}

function safeRelativePath(value, fallback = 'dist') {
  const cleaned = String(value || fallback).replace(/^[/\\]+/, '').trim() || fallback;
  if (cleaned.includes('..') || resolve('/', cleaned) === '/') {
    const error = new Error('Path must be a non-root relative path.');
    error.status = 400;
    throw error;
  }
  return cleaned;
}

function childProcessEnv(extra = {}) {
  const allowed = [
    'PATH',
    'Path',
    'HOME',
    'USERPROFILE',
    'SYSTEMROOT',
    'SystemRoot',
    'TEMP',
    'TMP',
    'COMSPEC',
    'ComSpec',
    'PATHEXT',
    'NPM_CONFIG_CACHE',
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    CI: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    ...extra,
  };
}

async function runStep(command, args, options = {}) {
  const started = Date.now();
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      timeout: options.timeout || 120000,
      maxBuffer: 1024 * 1024 * 4,
      cwd: options.cwd,
      env: childProcessEnv(),
    });
    return {
      command: `${command} ${args.join(' ')}`,
      ok: true,
      durationMs: Date.now() - started,
      output: [stdout, stderr].filter(Boolean).join('\n').trim(),
    };
  } catch (error) {
    error.step = {
      command: `${command} ${args.join(' ')}`,
      ok: false,
      durationMs: Date.now() - started,
      output: [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim(),
    };
    throw error;
  }
}

async function importGithubSandbox(input) {
  const repo = parseGithubRepo(input.repoUrl);
  if (repo) assertRepoAllowed(repo);
  const branch = safeBranchName(input.branch);
  const fallbackName = repo ? `${repo.owner}-${repo.repo}`.toLowerCase() : 'invalid-repository';
  const siteId = sanitizeId(input.siteId || fallbackName);
  const sandboxDir = resolve(sandboxRoot, siteId);
  const repoDir = join(sandboxDir, 'repo');
  const outputDirectory = safeRelativePath(input.outputDirectory, 'dist');
  const distOut = resolve(sandboxDir, 'dist');
  const logs = [];

  try {
    if (!repo) {
      const error = new Error('Enter a valid GitHub repository URL.');
      error.status = 400;
      throw error;
    }

    await rm(sandboxDir, { recursive: true, force: true });
    mkdirSync(sandboxDir, { recursive: true });

    logs.push(await runStep('git', ['clone', '--depth', '1', '--branch', branch, repo.url, repoDir], { timeout: 180000 }));

    const packageJsonPath = join(repoDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      logs.push(await runStep('npm', ['install', '--include=dev', '--no-audit', '--no-fund'], { cwd: repoDir, timeout: 300000 }));
      if (packageJson.scripts?.build) {
        logs.push(await runStep('npm', ['run', 'build'], { cwd: repoDir, timeout: 300000 }));
      }
    }

    const packageJson = existsSync(packageJsonPath) ? JSON.parse(await readFile(packageJsonPath, 'utf8')) : null;
    const candidateOutput = resolve(repoDir, outputDirectory);
    const sourceDir = existsSync(join(candidateOutput, 'index.html')) ? candidateOutput : repoDir;
    if (!existsSync(join(sourceDir, 'index.html'))) {
      if (packageJson?.scripts?.start) {
        const runtimePort = 4100 + Math.floor(Math.random() * 1000);
        startSandboxRuntime(siteId, repoDir, runtimePort);
        logs.push({ command: `PORT=${runtimePort} npm start`, ok: true, durationMs: 0, output: 'Started repository server and attached it to the sandbox viewer.' });
        return {
          siteId,
          repo: repo.fullName,
          branch,
          previewUrl: `/sandbox/${siteId}/`,
          outputDirectory: 'runtime',
          status: 'ready',
          mode: 'runtime',
          files: await listSandboxFiles(repoDir),
          logs,
        };
      }
      const error = new Error(`No static index.html found in ${outputDirectory}, and package.json has no start script for runtime preview.`);
      error.status = 422;
      throw error;
    }

    await rm(distOut, { recursive: true, force: true });
    logs.push(await runStep('node', ['-e', `require('fs').cpSync(${JSON.stringify(sourceDir)}, ${JSON.stringify(distOut)}, { recursive: true })`], { timeout: 120000 }));

    return {
      siteId,
      repo: repo.fullName,
      branch,
      previewUrl: `/sandbox/${siteId}/`,
      outputDirectory: sourceDir === repoDir ? './' : outputDirectory,
      status: 'ready',
      files: await listSandboxFiles(repoDir),
      logs,
    };
  } catch (error) {
    return {
      siteId,
      repo: repo?.fullName || null,
      branch,
      previewUrl: null,
      outputDirectory,
      status: 'failed',
      files: existsSync(repoDir) ? await listSandboxFiles(repoDir).catch(() => []) : [],
      logs: [...logs, error.step || { ok: false, command: 'sandbox', output: error.message }],
      error: error.message,
    };
  }
}

async function listSandboxFiles(dir, prefix = '') {
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

function startSandboxRuntime(siteId, cwd, port) {
  const existing = sandboxProcesses.get(siteId);
  if (existing?.child) existing.child.kill();
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['start'], {
    cwd,
    env: childProcessEnv({
      PORT: String(port),
      NODE_ENV: 'development',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const runtime = { child, port, logs: [] };
  child.stdout?.on('data', (chunk) => runtime.logs.push(String(chunk).trim()));
  child.stderr?.on('data', (chunk) => runtime.logs.push(String(chunk).trim()));
  child.on('exit', (code, signal) => {
    runtime.exited = { code, signal };
  });
  sandboxProcesses.set(siteId, runtime);
  return runtime;
}

async function proxySandboxRuntime(req, res, next, port, siteId) {
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

async function triggerRenderDeploy(input = {}) {
  const deployHookUrl = process.env.RENDER_DEPLOY_HOOK_URL || input.deployHookUrl;
  const serviceId = await resolveRenderServiceId(input);
  const apiKey = process.env.RENDER_API_KEY;

  if (deployHookUrl) {
    const response = await fetch(deployHookUrl, { method: 'POST' });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`Render deploy hook failed with ${response.status}: ${text}`);
      error.status = 502;
      throw error;
    }
    return {
      status: 'triggered',
      provider: 'render',
      method: 'deploy_hook',
      serviceId: serviceId || null,
      message: text || 'Render deploy hook triggered.',
    };
  }

  if (!apiKey || !serviceId) {
    return {
      status: 'configuration_required',
      provider: 'render',
      serviceId: serviceId || null,
      missing: {
        RENDER_API_KEY: !apiKey,
        RENDER_SERVICE_ID: !serviceId,
      },
      message: 'Set RENDER_DEPLOY_HOOK_URL, or set both RENDER_API_KEY and RENDER_SERVICE_ID.',
    };
  }

  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      clearCache: input.clearCache === 'clear' || input.clearCache === true ? 'clear' : 'do_not_clear',
    }),
  });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }

  if (!response.ok) {
    const error = new Error(body?.message || bodyText || `Render deploy failed with ${response.status}.`);
    error.status = 502;
    throw error;
  }

  return {
    status: 'triggered',
    provider: 'render',
    method: 'api',
    serviceId,
    deploy: body,
  };
}

async function activateRenderRepoService(input = {}) {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) return { status: 'configuration_required', message: 'RENDER_API_KEY is required.' };
  const repo = parseGithubRepo(input.repoUrl || input.repo || input.repository);
  if (!repo) return { status: 'failed', message: 'A valid GitHub repository URL is required.' };
  assertRepoAllowed(repo);

  const services = await listRenderServices();
  const existing = services.find((service) => sameRepo(service.repo, repo.fullName, repo.url));
  if (existing?.id) {
    const deploy = await triggerRenderDeploy({ ...input, serviceId: existing.id });
    return { status: 'activated', action: 'reused', service: existing, deploy };
  }

  const ownerId = process.env.RENDER_OWNER_ID || input.ownerId || await getDefaultRenderOwnerId();
  if (!ownerId) return { status: 'configuration_required', message: 'RENDER_OWNER_ID is required to create a new Render service.' };

  const serviceType = input.serviceType || inferRenderServiceType(input);
  const body = {
    type: serviceType,
    name: renderSafeName(input.name || repo.repo),
    ownerId,
    repo: `https://github.com/${repo.fullName}`,
    branch: safeBranchName(input.branch),
    autoDeploy: 'no',
    rootDir: input.rootDirectory ? safeRelativePath(input.rootDirectory, '') : '',
    serviceDetails: serviceType === 'static_site'
      ? {
          buildCommand: input.buildCommand || 'npm install && npm run build',
          publishPath: input.outputDirectory || 'dist',
        }
      : {
          runtime: 'node',
          buildCommand: input.buildCommand || 'npm install',
          startCommand: input.startCommand || 'npm start',
          plan: input.plan || 'free',
        },
  };

  const response = await fetch('https://api.render.com/v1/services', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const created = await readRenderJson(response);
  if (!response.ok) {
    return { status: 'failed', action: 'create', error: created?.message || `Render create service failed with ${response.status}.`, response: created };
  }

  const service = created.service || created;
  const deploy = await triggerRenderDeploy({ ...input, serviceId: service.id });
  return { status: 'activated', action: 'created', service, deploy };
}

async function getDefaultRenderOwnerId() {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) return null;
  const response = await fetch('https://api.render.com/v1/owners?limit=20', {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const body = await readRenderJson(response);
  if (!response.ok) return null;
  const owners = Array.isArray(body) ? body : [body];
  return owners[0]?.owner?.id || owners[0]?.id || null;
}

function sameRepo(serviceRepo, fullName, cloneUrl) {
  const normalized = String(serviceRepo || '').toLowerCase().replace(/\.git$/, '');
  return normalized.includes(fullName.toLowerCase()) || normalized === String(cloneUrl || '').toLowerCase().replace(/\.git$/, '');
}

function renderSafeName(value) {
  return String(value || 'glondia-site').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'glondia-site';
}

function inferRenderServiceType(input = {}) {
  const hasStart = !!input.startCommand || input.framework === 'Node' || input.framework === 'Express';
  return hasStart ? 'web_service' : 'static_site';
}

async function testRenderDeploy(input = {}) {
  const serviceId = await resolveRenderServiceId(input);
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey || !serviceId) {
    return {
      status: 'configuration_required',
      settings: getRenderSettings({ ...input, serviceId }),
      message: 'Set RENDER_API_KEY and select or configure RENDER_SERVICE_ID before testing deploy.',
    };
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const deployResponse = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const deploy = await readRenderJson(deployResponse);
  if (!deployResponse.ok) {
    return {
      status: 'failed',
      phase: 'trigger',
      serviceId,
      error: deploy?.message || `Render deploy trigger failed with ${deployResponse.status}.`,
      response: deploy,
    };
  }

  const deployId = deploy.id;
  await delay(2000);
  const beforeCancel = await getRenderDeploy(serviceId, deployId, headers);
  const cancelResponse = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}/cancel`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const cancel = await readRenderJson(cancelResponse);
  await delay(2000);
  const afterCancel = await getRenderDeploy(serviceId, deployId, headers);

  return {
    status: afterCancel?.status === 'canceled' ? 'passed' : 'check',
    serviceId,
    deployId,
    triggerStatus: deploy.status,
    statusBeforeCancel: beforeCancel?.status || null,
    cancelResponseStatus: cancel?.status || null,
    statusAfterCancel: afterCancel?.status || null,
    trigger: afterCancel?.trigger || deploy.trigger || 'api',
  };
}

async function getRenderDeploy(serviceId, deployId, headers) {
  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`, {
    headers,
  });
  return readRenderJson(response);
}

async function readRenderJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function getRenderSettings(input = {}) {
  const serviceId = process.env.RENDER_SERVICE_ID || input.serviceId || input.renderServiceId || null;
  return {
    provider: 'render',
    configured: !!(process.env.RENDER_DEPLOY_HOOK_URL || (process.env.RENDER_API_KEY && serviceId)),
    apiKeyPresent: !!process.env.RENDER_API_KEY,
    deployHookPresent: !!process.env.RENDER_DEPLOY_HOOK_URL,
    serviceId,
    serviceUrl: serviceId ? `https://dashboard.render.com/web/${serviceId}` : null,
    required: process.env.RENDER_DEPLOY_HOOK_URL ? [] : ['RENDER_API_KEY', 'RENDER_SERVICE_ID'].filter((key) => key === 'RENDER_API_KEY' ? !process.env.RENDER_API_KEY : !serviceId),
  };
}

async function listRenderDeploys(input = {}) {
  const serviceId = await resolveRenderServiceId(input);
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey || !serviceId) {
    return { status: 'configuration_required', deploys: [], settings: getRenderSettings(input) };
  }

  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys?limit=5`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : []; } catch { body = []; }
  if (!response.ok) {
    return { status: 'failed', deploys: [], settings: getRenderSettings(input), error: body?.message || bodyText || `Render returned ${response.status}.` };
  }
  return { status: 'ok', deploys: Array.isArray(body) ? body : [], settings: getRenderSettings(input) };
}

async function resolveRenderServiceId(input = {}) {
  if (input.serviceId || input.renderServiceId) return input.serviceId || input.renderServiceId;
  if (process.env.RENDER_SERVICE_ID) return process.env.RENDER_SERVICE_ID;
  const services = await listRenderServices().catch(() => []);
  const repoNeedle = String(input.repo || input.repository || '').toLowerCase();
  const nameNeedle = String(input.name || '').toLowerCase();
  const match = services.find((service) => {
    const haystack = [
      service.id,
      service.name,
      service.slug,
      service.repo,
      service.url,
    ].filter(Boolean).join(' ').toLowerCase();
    return (repoNeedle && haystack.includes(repoNeedle.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')))
      || (nameNeedle && haystack.includes(nameNeedle));
  });
  return match?.id || services[0]?.id || null;
}

async function listRenderServices() {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) return [];
  const response = await fetch('https://api.render.com/v1/services?limit=100', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : []; } catch { body = []; }
  if (!response.ok) return [];
  const rows = Array.isArray(body) ? body : [];
  return rows.map((item) => {
    const svc = item.service || item;
    return {
      id: svc.id,
      name: svc.name,
      type: svc.type,
      slug: svc.slug,
      suspended: svc.suspended && svc.suspended !== 'not_suspended',
      url: svc.serviceDetails?.url || svc.url || null,
      region: svc.serviceDetails?.region || svc.region || null,
      env: svc.serviceDetails?.env || svc.env || null,
      repo: svc.repo || svc.repoUrl || svc.serviceDetails?.repo || null,
    };
  }).filter((service) => service.id);
}

// ── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[error] ${req.method} ${req.url} →`, err.message || err);
  res.status(status).json({
    error: { code: 'INTERNAL_ERROR', message: isProd ? 'An unexpected error occurred.' : (err.message || String(err)) },
    requestId: req.id,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[glondia] API + static server listening on port ${PORT}`);
  console.log(`[glondia] Serving Vite app from ${distDir}`);
});
