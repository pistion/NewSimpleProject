/**
 * providerRender.service.js
 *
 * All Render provider business logic: GitHub import, Render deploy/activate/settings,
 * plus GitHub repo parsing helpers used by the import and sandbox flows.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { sandboxRuntimeService } from './sandboxRuntime.service.js';

const execFileAsync = promisify(execFile);

// ── GitHub helpers ────────────────────────────────────────────────────────────

export function parseGithubRepo(value) {
  const raw = extractGithubRepoInput(value);
  if (!raw) return null;
  const ssh = raw.match(/^git@github\.com:([^/]+)\/(.+)$/i);
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

export function normalizeGithubRepo(owner, repo) {
  const cleanOwner = String(owner || '').trim().replace(/^@/, '');
  const cleanRepo = String(repo || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/https?:.*$/i, '')
    .replace(/\.git.*$/i, '')
    .replace(/[/\\].*$/, '');
  if (!/^[A-Za-z0-9-]+$/.test(cleanOwner) || !/^[A-Za-z0-9._-]+$/.test(cleanRepo)) return null;
  return {
    owner: cleanOwner,
    repo: cleanRepo,
    fullName: `${cleanOwner}/${cleanRepo}`,
    url: `https://github.com/${cleanOwner}/${cleanRepo}`,
  };
}

export function extractGithubRepoInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const urlMatch = raw.match(/https?:\/\/github\.com\/[^\s]+/i);
  if (urlMatch) return urlMatch[0];
  const sshMatch = raw.match(/git@github\.com:[^\s]+/i);
  if (sshMatch) return sshMatch[0];
  return raw.split(/\s+/)[0];
}

export function assertRepoAllowed(repo) {
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

export function safeBranchName(value) {
  const branch = String(value || 'main').trim() || 'main';
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
    const error = new Error('Branch contains unsupported characters.');
    error.status = 400;
    throw error;
  }
  return branch;
}

export function safeRelativePath(value, fallback = 'dist') {
  const cleaned = String(value || fallback).replace(/^[/\\]+/, '').trim() || fallback;
  if (cleaned.includes('..') || resolve('/', cleaned) === '/') {
    const error = new Error('Path must be a non-root relative path.');
    error.status = 400;
    throw error;
  }
  return cleaned;
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

export async function runStep(command, args, options = {}) {
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

// ── Render helpers ────────────────────────────────────────────────────────────

export async function readRenderJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

export function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export function getRenderSettings(input = {}) {
  const serviceId = input.serviceId || input.renderServiceId || null;
  return {
    provider: 'render',
    configured: !!process.env.RENDER_API_KEY && !!process.env.RENDER_OWNER_ID,
    customerServiceReady: !!serviceId,
    required: ['RENDER_API_KEY', 'RENDER_OWNER_ID'].filter((key) => !process.env[key]),
  };
}

export function isPlatformRenderService(serviceId) {
  return !!serviceId && !!process.env.RENDER_SERVICE_ID && serviceId === process.env.RENDER_SERVICE_ID;
}

export async function listRenderServices() {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) return [];
  const response = await fetch('https://api.render.com/v1/services?limit=100', {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
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
      isPlatform: isPlatformRenderService(svc.id),
    };
  }).filter((service) => service.id);
}

export async function resolveRenderServiceId(input = {}) {
  if (input.serviceId || input.renderServiceId) return input.serviceId || input.renderServiceId;
  const services = await listRenderServices().catch(() => []);
  const repoNeedle = String(input.repo || input.repository || '').toLowerCase();
  const nameNeedle = String(input.name || '').toLowerCase();
  const match = services.find((service) => {
    const haystack = [service.id, service.name, service.slug, service.repo, service.url]
      .filter(Boolean).join(' ').toLowerCase();
    return (repoNeedle && haystack.includes(repoNeedle.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')))
      || (nameNeedle && haystack.includes(nameNeedle));
  });
  if (match?.id) return match.id;
  if (input.allowPlatformService === true || input.useDefaultService === true) return process.env.RENDER_SERVICE_ID || services[0]?.id || null;
  return null;
}

export async function resolveRenderLiveUrl(serviceId, input = {}) {
  if (input.liveUrl) return String(input.liveUrl).replace(/\/+$/, '');
  const configured = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (!serviceId) return null;
  const services = await listRenderServices().catch(() => []);
  const service = services.find((item) => item.id === serviceId);
  return service?.url ? String(service.url).replace(/\/+$/, '') : null;
}

export function buildPublishedSiteUrl(liveUrl, input = {}) {
  if (!liveUrl) return null;
  const sitePath = input.sitePath || input.publishedPath;
  if (sitePath) return `${liveUrl}/${String(sitePath).replace(/^\/+/, '')}`;
  return liveUrl;
}

export function sameRepo(serviceRepo, fullName, cloneUrl) {
  const normalized = String(serviceRepo || '').toLowerCase().replace(/\.git$/, '');
  return normalized.includes(fullName.toLowerCase()) || normalized === String(cloneUrl || '').toLowerCase().replace(/\.git$/, '');
}

export function renderSafeName(value) {
  return String(value || 'glondia-site').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'glondia-site';
}

export function inferRenderServiceType(input = {}) {
  const hasStart = !!input.startCommand || input.framework === 'Node' || input.framework === 'Express';
  return hasStart ? 'web_service' : 'static_site';
}

export async function getDefaultRenderOwnerId() {
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

export async function triggerRenderDeploy(input = {}) {
  const allowPlatformService = input.allowPlatformService === true || input.useDefaultService === true;
  const deployHookUrl = input.deployHookUrl || (allowPlatformService ? process.env.RENDER_DEPLOY_HOOK_URL : null);
  const serviceId = await resolveRenderServiceId(input);
  const apiKey = process.env.RENDER_API_KEY;
  const liveUrl = await resolveRenderLiveUrl(serviceId, input);
  const siteUrl = buildPublishedSiteUrl(liveUrl, input);

  if (isPlatformRenderService(serviceId) && !allowPlatformService) {
    return {
      status: 'blocked',
      provider: 'render',
      serviceId,
      message: 'This is the Glondiasites platform service. Customer deploys must use a separate Render service.',
    };
  }

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
      liveUrl,
      siteUrl,
      message: text || 'Render deploy hook triggered.',
    };
  }

  if (!apiKey || !serviceId) {
    return {
      status: 'configuration_required',
      provider: 'render',
      serviceId: serviceId || null,
      missing: { RENDER_API_KEY: !apiKey, RENDER_CUSTOMER_SERVICE_ID: !serviceId },
      message: 'Select an existing customer Render service or activate the imported repo to create one.',
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
    liveUrl,
    siteUrl,
    deploy: body,
    message: isPlatformRenderService(serviceId) ? 'Glondiasites deployment started.' : 'Customer deployment started.',
  };
}

export async function testRenderDeploy(input = {}) {
  const serviceId = await resolveRenderServiceId(input);
  const apiKey = process.env.RENDER_API_KEY;
  if (isPlatformRenderService(serviceId) && input.allowPlatformService !== true && input.useDefaultService !== true) {
    return {
      status: 'blocked',
      serviceId,
      message: 'This is the Glondiasites platform service. Customer test deploys must use a separate Render service.',
    };
  }
  if (!apiKey || !serviceId) {
    return {
      status: 'configuration_required',
      settings: getRenderSettings({ ...input, serviceId }),
      message: 'Set RENDER_API_KEY and select or activate a customer Render service before testing deploy.',
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
  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`, { headers });
  return readRenderJson(response);
}

export async function listRenderDeploys(input = {}) {
  if (!input.serviceId && !input.renderServiceId && !input.repo && !input.repository && !input.name) {
    return { status: 'customer_service_required', deploys: [], settings: getRenderSettings(input) };
  }
  const serviceId = await resolveRenderServiceId(input);
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey || !serviceId) {
    return { status: 'configuration_required', deploys: [], settings: getRenderSettings(input) };
  }

  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys?limit=5`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : []; } catch { body = []; }
  if (!response.ok) {
    return { status: 'failed', deploys: [], settings: getRenderSettings(input), error: body?.message || bodyText || `Render returned ${response.status}.` };
  }
  return { status: 'ok', deploys: Array.isArray(body) ? body : [], settings: getRenderSettings(input) };
}

export async function activateRenderRepoService(input = {}) {
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
  const payload = {
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
          plan: input.plan || 'starter',
          region: input.region || 'oregon',
          env: input.runtime || input.env || 'node',
          envSpecificDetails: {
            buildCommand: input.buildCommand || 'npm install && npm run build',
            startCommand: input.startCommand || 'npm start',
          },
        },
  };

  const response = await fetch('https://api.render.com/v1/services', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const created = await readRenderJson(response);
  if (!response.ok) {
    return { status: 'failed', action: 'create', error: created?.message || `Render create service failed with ${response.status}.`, response: created };
  }

  const service = created.service || created;
  const deploy = await triggerRenderDeploy({ ...input, serviceId: service.id });
  return { status: 'activated', action: 'created', service, deploy };
}

// ── GitHub sandbox import ─────────────────────────────────────────────────────

export async function importGithubSandbox(input) {
  function sanitizeId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  const sandboxRoot = sandboxRuntimeService.getSandboxRoot();

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
        sandboxRuntimeService.startSandboxRuntime(siteId, repoDir, runtimePort);
        logs.push({ command: `PORT=${runtimePort} npm start`, ok: true, durationMs: 0, output: 'Started repository server and attached it to the sandbox viewer.' });
        return {
          siteId,
          repo: repo.fullName,
          branch,
          previewUrl: `/sandbox/${siteId}/`,
          outputDirectory: 'runtime',
          status: 'ready',
          mode: 'runtime',
          files: await sandboxRuntimeService.listSandboxFiles(repoDir),
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
      files: await sandboxRuntimeService.listSandboxFiles(repoDir),
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
      files: existsSync(repoDir) ? await sandboxRuntimeService.listSandboxFiles(repoDir).catch(() => []) : [],
      logs: [...logs, error.step || { ok: false, command: 'sandbox', output: error.message }],
      error: error.message,
    };
  }
}
