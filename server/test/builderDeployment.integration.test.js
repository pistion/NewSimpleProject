/**
 * Canonical deployment: approving a revision and deploying creates a durable
 * BUILDER_DEPLOY_REVISION job (not just a link), the job invokes the Hosting
 * Deploy Engine, provider identity is persisted for idempotent retries, and a
 * blocked handoff fails VISIBLY (project DEPLOYMENT_FAILED) instead of
 * pretending success. Providers are unconfigured here by design.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3991;
const BASE = `http://127.0.0.1:${PORT}`;

let proc;
let tempDir;

function api(path, { method = 'GET', user = 'deploy-user', body, headers = {} } = {}) {
  return fetch(`${BASE}/api/v1/builder${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user-id': user, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function waitForJob(jobId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = (await (await api(`/jobs/${jobId}`)).json()).data;
    if (['SUCCEEDED', 'FAILED'].includes(job.status)) return job;
    if (Date.now() > deadline) throw new Error(`Job ${jobId} stuck in ${job.status} (${job.stage})`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'glondia-builder-deploy-'));
  const dbPath = join(tempDir, 'test.db');
  closeSync(openSync(dbPath, 'w'));
  const dbUrl = `file:${dbPath.replaceAll('\\', '/')}`;

  execSync('npx prisma db push --skip-generate', {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'ignore',
  });

  proc = spawn(process.execPath, ['server/src/server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PORT: String(PORT),
      NODE_ENV: 'development',
      AUTH_DEV_FALLBACK: 'true',
      FEATURE_SITE_BUILDER: 'true',
      FEATURE_BUILDER_PROJECT_FLOW: 'true',
      FEATURE_BUILDER_DB_STORAGE: 'true',
      FEATURE_BUILDER_DURABLE_JOBS: 'true',
      BUILDER_WORKER_POLL_MS: '200',
      OPENAI_API_KEY: '',
      // No provider credentials: publish/deploy handoff must BLOCK, never
      // silently succeed and never touch real GitHub/Render.
      GITHUB_TOKEN: '',
      GITHUB_GENERATED_SITES_TOKEN: '',
      GENERATED_SITES_GITHUB_TOKEN: '',
      RENDER_API_KEY: '',
      RENDER_OWNER_ID: '',
      RENDER_API_DISABLED: 'true',
      DATA_DIR: join(tempDir, 'data'),
      GLONDIA_VITE_MIDDLEWARE: 'false',
    },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/readyz`);
      if (res.ok) break;
    } catch { /* starting */ }
    if (Date.now() > deadline) throw new Error('Server did not become ready in 30s');
    await new Promise((r) => setTimeout(r, 400));
  }
}, { timeout: 120000 });

after(() => {
  if (proc) proc.kill();
  if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows */ } }
});

async function approvedProject(name) {
  const create = await api('/projects', {
    method: 'POST', body: { sourceType: 'template', templateId: 'pulse-works', name },
  });
  const project = (await create.json()).data;
  await api(`/projects/${project.id}/plan`, {
    method: 'PATCH',
    body: { expectedVersion: project.version, plan: { brief: { businessName: name }, sitemap: { pages: [] } } },
  });
  await api(`/projects/${project.id}/answer-sheet/build`, { method: 'POST' });
  const gen = await api(`/projects/${project.id}/generations`, {
    method: 'POST', body: { mode: 'full' }, headers: { 'Idempotency-Key': `${name}-gen` },
  });
  const queued = (await gen.json()).data;
  const job = await waitForJob(queued.jobId);
  assert.equal(job.status, 'SUCCEEDED', `generation failed: ${job.errorCode}`);
  const approve = await api(`/projects/${project.id}/revisions/${queued.revisionId}/approve`, { method: 'POST' });
  assert.equal(approve.status, 200);
  return { project, revisionId: queued.revisionId };
}

test('deployment creates a durable job and fails visibly when the handoff is blocked', async () => {
  const { project, revisionId } = await approvedProject('deploy-blocked');

  const res = await api(`/projects/${project.id}/deployments`, {
    method: 'POST', body: {}, headers: { 'Idempotency-Key': 'deploy-1' },
  });
  assert.equal(res.status, 202);
  const queued = (await res.json()).data;
  assert.ok(queued.jobId, 'deployment must create a durable job');
  assert.ok(queued.deployment?.deploymentId, 'deployment identity must be reserved');

  // Project moved to DEPLOYMENT_QUEUED by the request.
  const afterQueue = (await (await api(`/projects/${project.id}`)).json()).data;
  assert.ok(['DEPLOYMENT_QUEUED', 'BUILDING', 'DEPLOYMENT_FAILED'].includes(afterQueue.status));

  // Worker runs the job; with no provider credentials the handoff blocks and
  // the failure is visible, never a fake success.
  const job = await waitForJob(queued.jobId);
  assert.equal(job.status, 'FAILED');
  assert.equal(job.errorCode, 'DEPLOY_HANDOFF_BLOCKED');

  const settled = (await (await api(`/projects/${project.id}`)).json()).data;
  assert.equal(settled.status, 'DEPLOYMENT_FAILED');

  // The link preserved the hosting record identity for later retries.
  const links = (await (await api(`/projects/${project.id}/deployments`)).json()).data;
  assert.equal(links.length, 1);
  assert.equal(links[0].status, 'FAILED');
  assert.ok(links[0].hostingDeploymentId, 'hosting deployment id must be persisted');
  assert.ok(links[0].errorMessage, 'blocked reason must be preserved');
  assert.equal(links[0].revisionId, revisionId, 'deployment must pin the exact revision');
  assert.equal(links[0].metadata?.data?.artifactChecksum?.length, 64, 'deployment must pin the artifact checksum');
});

test('duplicate deploy with the same idempotency key is reused, changed payload conflicts', async () => {
  const { project } = await approvedProject('deploy-idem');

  const first = await api(`/projects/${project.id}/deployments`, {
    method: 'POST', body: {}, headers: { 'Idempotency-Key': 'idem-1' },
  });
  assert.equal(first.status, 202);
  const a = (await first.json()).data;

  const second = await api(`/projects/${project.id}/deployments`, {
    method: 'POST', body: {}, headers: { 'Idempotency-Key': 'idem-1' },
  });
  assert.equal(second.status, 200);
  const b = (await second.json()).data;
  assert.equal(b.reused, true);
  assert.equal(b.jobId, a.jobId);

  // Let the (blocked) deploy job settle so the project can iterate again.
  await waitForJob(a.jobId);

  // Same key, different payload → 409 (needs a second approved revision).
  const change = await api(`/projects/${project.id}/revisions/${a.deployment.revisionId}/change-request`, {
    method: 'POST', body: { changeRequest: { message: 'tweak' } }, headers: { 'Idempotency-Key': 'idem-cr' },
  });
  const cr = (await change.json()).data;
  const crJob = await waitForJob(cr.jobId);
  assert.equal(crJob.status, 'SUCCEEDED');
  await api(`/projects/${project.id}/revisions/${cr.revisionId}/approve`, { method: 'POST' });

  const conflicting = await api(`/projects/${project.id}/deployments`, {
    method: 'POST', body: { revisionId: cr.revisionId }, headers: { 'Idempotency-Key': 'idem-1' },
  });
  assert.equal(conflicting.status, 409);
  assert.equal((await conflicting.json()).error.code, 'IDEMPOTENCY_KEY_REUSED');
});

test('unapproved revision cannot be deployed', async () => {
  const create = await api('/projects', {
    method: 'POST', body: { sourceType: 'template', templateId: 'pulse-works', name: 'no-approval' },
  });
  const project = (await create.json()).data;
  const res = await api(`/projects/${project.id}/deployments`, {
    method: 'POST', body: {}, headers: { 'Idempotency-Key': 'nope-1' },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'BUILDER_APPROVED_REVISION_REQUIRED');
});
