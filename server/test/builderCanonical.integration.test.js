import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3985;
const BASE = `http://127.0.0.1:${PORT}/api/v1/builder`;

let proc;
let tempDir;

function api(path, { method = 'GET', user = 'builder-user', body, headers = {} } = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': user,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'glondia-builder-canonical-'));
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
      BUILDER_WORKER_POLL_MS: '250',
      OPENAI_API_KEY: '',            // deterministic generation in tests
      DATA_DIR: join(tempDir, 'data'),
    },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      // /readyz (not /healthz): generation needs the worker heartbeat too.
      const res = await fetch(`http://127.0.0.1:${PORT}/readyz`);
      if (res.ok) break;
    } catch { /* server still starting */ }
    if (Date.now() > deadline) throw new Error('Server did not become ready in 30s');
    await new Promise((r) => setTimeout(r, 400));
  }
}, { timeout: 120000 });

after(() => {
  if (proc) proc.kill();
  if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows file locks */ } }
});

test('project lifecycle saves with optimistic concurrency and queues idempotent generation', async () => {
  const create = await api('/projects', {
    method: 'POST',
    body: { sourceType: 'template', templateId: 'pulse-works', name: 'Acme Site' },
  });
  assert.equal(create.status, 201);
  const created = (await create.json()).data;
  assert.equal(created.status, 'TEMPLATE_SELECTED');
  assert.equal(created.version, 1);

  const save = await api(`/projects/${created.id}/plan`, {
    method: 'PATCH',
    body: { expectedVersion: 1, plan: { brief: { businessName: 'Acme' }, sitemap: { pages: [{ title: 'Home' }] } } },
  });
  assert.equal(save.status, 200);
  const saved = (await save.json()).data;
  assert.equal(saved.version, 2);

  const stale = await api(`/projects/${created.id}/plan`, {
    method: 'PATCH',
    body: { expectedVersion: 1, plan: { brief: { businessName: 'Old' } } },
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'BUILDER_VERSION_CONFLICT');

  const sheet = await api(`/projects/${created.id}/answer-sheet/build`, { method: 'POST' });
  assert.equal(sheet.status, 200);
  assert.equal((await sheet.json()).data.answerSheet.schemaVersion, 1);

  const headers = { 'Idempotency-Key': 'generate-acme-1' };
  const gen1 = await api(`/projects/${created.id}/generations`, { method: 'POST', body: { mode: 'full' }, headers });
  assert.equal(gen1.status, 202);
  const queued = (await gen1.json()).data;
  assert.equal(queued.status, 'QUEUED');
  assert.ok(queued.jobId);
  assert.ok(queued.revisionId);

  const gen2 = await api(`/projects/${created.id}/generations`, { method: 'POST', body: { mode: 'full' }, headers });
  assert.equal(gen2.status, 200);
  const reused = (await gen2.json()).data;
  assert.equal(reused.jobId, queued.jobId);
  assert.equal(reused.reused, true);

  const conflict = await api(`/projects/${created.id}/generations`, {
    method: 'POST',
    body: { mode: 'change_request', changeRequest: { message: 'Different' } },
    headers,
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'IDEMPOTENCY_KEY_REUSED');

  const job = await api(`/jobs/${queued.jobId}`);
  assert.equal(job.status, 200);
  assert.equal((await job.json()).data.revisionId, queued.revisionId);
});

test('builder projects are isolated by authenticated user', async () => {
  const create = await api('/projects', {
    user: 'owner-a',
    method: 'POST',
    body: { sourceType: 'template', templateId: 'pulse-works', name: 'Owner A' },
  });
  const project = (await create.json()).data;

  const denied = await api(`/projects/${project.id}`, { user: 'owner-b' });
  assert.equal(denied.status, 404);

  const listA = await api('/projects', { user: 'owner-a' });
  const listB = await api('/projects', { user: 'owner-b' });
  assert.equal((await listA.json()).data.length, 1);
  assert.equal((await listB.json()).data.length, 0);
});
