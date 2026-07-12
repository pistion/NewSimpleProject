/**
 * End-to-end durable generation: queued job actually executes, produces an
 * immutable artifact with a checksum, moves the revision to READY and the
 * project to PREVIEW_READY, and the whole flow enforces the state machine.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;

let proc;
let tempDir;

function api(path, { method = 'GET', user = 'worker-user', body, headers = {} } = {}) {
  return fetch(`${BASE}/api/v1/builder${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user-id': user, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'glondia-builder-worker-'));
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
      OPENAI_API_KEY: '',            // force deterministic generation
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

async function createReadyProject(user, name) {
  const create = await api('/projects', {
    user, method: 'POST',
    body: { sourceType: 'template', templateId: 'pulse-works', name },
  });
  assert.equal(create.status, 201);
  const project = (await create.json()).data;

  const save = await api(`/projects/${project.id}/plan`, {
    user, method: 'PATCH',
    body: {
      expectedVersion: project.version,
      plan: {
        brief: { businessName: name, industry: 'Fashion', description: 'Streetwear drops.' },
        sitemap: { pages: [{ title: 'Home' }] },
      },
    },
  });
  assert.equal(save.status, 200);

  const sheet = await api(`/projects/${project.id}/answer-sheet/build`, { user, method: 'POST' });
  assert.equal(sheet.status, 200);
  return project;
}

async function waitForJob(user, jobId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await api(`/jobs/${jobId}`, { user });
    assert.equal(res.status, 200);
    const job = (await res.json()).data;
    if (['SUCCEEDED', 'FAILED'].includes(job.status)) return job;
    if (Date.now() > deadline) throw new Error(`Job ${jobId} stuck in ${job.status} (stage ${job.stage})`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

test('readyz reports ready with worker heartbeat', async () => {
  const deadline = Date.now() + 20000;
  for (;;) {
    const res = await fetch(`${BASE}/readyz`);
    const body = await res.json();
    if (res.status === 200 && body.ready) {
      assert.equal(body.checks.worker.ok, true);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`readyz never became ready: ${JSON.stringify(body)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
});

test('queued generation executes and produces a READY revision with a checksummed artifact', async () => {
  const project = await createReadyProject('worker-user', 'Acme Drops');

  const gen = await api(`/projects/${project.id}/generations`, {
    method: 'POST', body: { mode: 'full' }, headers: { 'Idempotency-Key': 'worker-gen-1' },
  });
  assert.equal(gen.status, 202);
  const queued = (await gen.json()).data;

  const job = await waitForJob('worker-user', queued.jobId);
  assert.equal(job.status, 'SUCCEEDED', `job failed: ${job.errorCode} ${job.errorMessage}`);

  // Revision is READY with artifact + checksum.
  const revRes = await api(`/projects/${project.id}/revisions/${queued.revisionId}`);
  const revision = (await revRes.json()).data;
  assert.equal(revision.status, 'READY');
  assert.ok(revision.artifactChecksum, 'artifact checksum missing');
  assert.ok(revision.artifactLocation, 'artifact location missing');
  assert.equal(revision.generationModel, 'template-content-merge:v1');

  // The artifact on disk matches the recorded checksum and layout.
  assert.ok(existsSync(revision.artifactLocation), 'artifact directory missing');
  const manifest = JSON.parse(readFileSync(join(revision.artifactLocation, 'artifact-manifest.json'), 'utf8'));
  assert.equal(manifest.checksum, revision.artifactChecksum);
  assert.ok(manifest.files.length > 0);
  assert.ok(existsSync(join(revision.artifactLocation, 'files', 'index.html')));
  assert.ok(existsSync(join(revision.artifactLocation, 'validation-report.json')));

  // Content was actually applied — not an unchanged template.
  const siteData = JSON.parse(readFileSync(join(revision.artifactLocation, 'files', 'glondia-site-data.json'), 'utf8'));
  assert.equal(siteData.userInput?.answers?.businessName, 'Acme Drops');

  // Project reached PREVIEW_READY.
  const projRes = await api(`/projects/${project.id}`);
  assert.equal((await projRes.json()).data.status, 'PREVIEW_READY');

  // Job events recorded real stages.
  const eventsRes = await api(`/jobs/${queued.jobId}/events`);
  const events = (await eventsRes.json()).data;
  const stages = events.map((e) => e.stage).filter(Boolean);
  for (const expected of ['VALIDATE_PROJECT', 'LOAD_TEMPLATE', 'CREATE_ARTIFACT', 'complete']) {
    assert.ok(stages.includes(expected), `missing stage event ${expected} in ${stages.join(',')}`);
  }

  // Approval works and the project moves to APPROVED.
  const approve = await api(`/projects/${project.id}/revisions/${queued.revisionId}/approve`, { method: 'POST' });
  assert.equal(approve.status, 200);
  const approvedProject = (await (await api(`/projects/${project.id}`)).json()).data;
  assert.equal(approvedProject.status, 'APPROVED');
  assert.equal(approvedProject.approvedRevisionId, queued.revisionId);
});

test('state machine blocks edits and approvals in the wrong state', async () => {
  const project = await createReadyProject('worker-user', 'Machine Guard');

  // Missing expectedVersion → 400, not silent overwrite.
  const noVersion = await api(`/projects/${project.id}/answer-sheet`, {
    method: 'PATCH', body: { answerSheet: { businessName: 'X' } },
  });
  assert.equal(noVersion.status, 400);
  assert.equal((await noVersion.json()).error.code, 'BUILDER_EXPECTED_VERSION_REQUIRED');

  // Approving a revision that is not READY → 409.
  const gen = await api(`/projects/${project.id}/generations`, {
    method: 'POST', body: { mode: 'full' }, headers: { 'Idempotency-Key': 'guard-gen-1' },
  });
  const queued = (await gen.json()).data;
  const early = await api(`/projects/${project.id}/revisions/${queued.revisionId}/approve`, { method: 'POST' });
  const earlyBody = await early.json();
  assert.equal(early.status, 409);
  assert.ok(['BUILDER_REVISION_NOT_READY', 'BUILDER_ILLEGAL_TRANSITION'].includes(earlyBody.error.code));

  await waitForJob('worker-user', queued.jobId);
});

test('change request produces a second revision generated by the worker', async () => {
  const project = await createReadyProject('worker-user', 'Iteration Co');
  const gen = await api(`/projects/${project.id}/generations`, {
    method: 'POST', body: { mode: 'full' }, headers: { 'Idempotency-Key': 'iter-gen-1' },
  });
  const first = (await gen.json()).data;
  await waitForJob('worker-user', first.jobId);

  const change = await api(`/projects/${project.id}/revisions/${first.revisionId}/change-request`, {
    method: 'POST',
    body: { changeRequest: { message: 'Make the hero copy about winter drops.' } },
    headers: { 'Idempotency-Key': 'iter-change-1' },
  });
  assert.equal(change.status, 202);
  const second = (await change.json()).data;
  assert.notEqual(second.revisionId, first.revisionId);

  const job = await waitForJob('worker-user', second.jobId);
  assert.equal(job.status, 'SUCCEEDED');

  const revisions = (await (await api(`/projects/${project.id}/revisions`)).json()).data;
  assert.equal(revisions.length, 2);
  assert.ok(revisions.every((r) => ['READY', 'APPROVED'].includes(r.status)));
});

test('server-side template pinning ignores client integrity fields', async () => {
  const create = await api('/projects', {
    method: 'POST',
    body: {
      sourceType: 'template',
      templateId: 'pulse-works',
      name: 'Pin Check',
      templateManifestHash: 'attacker-controlled',
      templateVersion: 'evil-v99',
      templateSourceCommit: 'deadbeef',
    },
  });
  assert.equal(create.status, 201);
  const project = (await create.json()).data;
  assert.notEqual(project.templateManifestHash, 'attacker-controlled');
  assert.notEqual(project.templateVersion, 'evil-v99');
  assert.ok(project.templateManifestHash, 'server must pin a manifest hash');
  assert.match(project.templateManifestHash, /^[a-f0-9]{64}$/);
});

test('unknown template is rejected at creation', async () => {
  const create = await api('/projects', {
    method: 'POST',
    body: { sourceType: 'template', templateId: 'does-not-exist', name: 'Nope' },
  });
  assert.equal(create.status, 404);
  assert.equal((await create.json()).error.code, 'BUILDER_TEMPLATE_NOT_FOUND');
});
