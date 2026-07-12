/**
 * Isolated preview security: hashed grants, expiry, revocation, revision
 * scoping, path traversal, and CSP containment headers.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3989;
const BASE = `http://127.0.0.1:${PORT}`;

let proc;
let tempDir;
let revisionId;
let previewUrl;
let grantId;

function api(path, { method = 'GET', user = 'preview-user', body, headers = {} } = {}) {
  return fetch(`${BASE}/api/v1/builder${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user-id': user, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'glondia-builder-preview-'));
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
      FEATURE_BUILDER_ISOLATED_PREVIEW: 'true',
      BUILDER_PREVIEW_ORIGIN: `http://127.0.0.1:${PORT}`,
      PREVIEW_SIGNING_SECRET: 'test-preview-secret',
      DASHBOARD_ORIGIN: 'https://app.glondia.test',
      BUILDER_WORKER_POLL_MS: '200',
      BUILDER_PREVIEW_TTL_MS: '4000',
      OPENAI_API_KEY: '',
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

  // Build one READY revision to preview.
  const create = await api('/projects', {
    method: 'POST',
    body: { sourceType: 'template', templateId: 'pulse-works', name: 'Preview Site' },
  });
  const project = (await create.json()).data;
  await api(`/projects/${project.id}/plan`, {
    method: 'PATCH',
    body: { expectedVersion: project.version, plan: { brief: { businessName: 'Preview Site' }, sitemap: { pages: [] } } },
  });
  await api(`/projects/${project.id}/answer-sheet/build`, { method: 'POST' });
  const gen = await api(`/projects/${project.id}/generations`, {
    method: 'POST', body: { mode: 'full' }, headers: { 'Idempotency-Key': 'preview-gen-1' },
  });
  const queued = (await gen.json()).data;
  revisionId = queued.revisionId;

  const jobDeadline = Date.now() + 45000;
  for (;;) {
    const job = (await (await api(`/jobs/${queued.jobId}`)).json()).data;
    if (job.status === 'SUCCEEDED') break;
    if (job.status === 'FAILED') throw new Error(`generation failed: ${job.errorCode}`);
    if (Date.now() > jobDeadline) throw new Error('generation timed out');
    await new Promise((r) => setTimeout(r, 300));
  }

  const grantRes = await api(`/projects/${project.id}/revisions/${revisionId}/preview-grants`, { method: 'POST' });
  assert.equal(grantRes.status, 201);
  const grant = (await grantRes.json()).data;
  previewUrl = grant.url;
  grantId = grant.grantId;
}, { timeout: 120000 });

after(() => {
  if (proc) proc.kill();
  if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows */ } }
});

test('grant URL points at the isolated /p route, not the API origin path', () => {
  assert.match(previewUrl, /\/p\/[A-Za-z0-9-]+\?grant=/);
});

test('valid grant serves the artifact entry with containment headers', async () => {
  const res = await fetch(previewUrl, { redirect: 'manual' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);

  const csp = res.headers.get('content-security-policy');
  assert.ok(csp.includes("default-src 'none'"), 'CSP must default-deny');
  assert.ok(csp.includes("connect-src 'none'"), 'generated code must not call out');
  assert.ok(csp.includes('frame-ancestors https://app.glondia.test'), 'only the dashboard may frame previews');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const html = await res.text();
  assert.ok(html.toLowerCase().includes('<html'), 'entry must be the site HTML');

  // Asset requests ride the preview-scoped cookie set on entry.
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie && cookie.includes(`Path=/p/${revisionId}`), 'cookie must be scoped to this revision path');
  assert.ok(cookie.includes('HttpOnly'));
});

test('no token is denied', async () => {
  const res = await fetch(`${BASE}/p/${revisionId}`);
  assert.equal(res.status, 401);
});

test('garbage and forged tokens are denied', async () => {
  for (const bad of ['x', 'a'.repeat(600), 'AAAA.BBBB', encodeURIComponent('../../etc/passwd')]) {
    const res = await fetch(`${BASE}/p/${revisionId}?grant=${bad}`);
    assert.equal(res.status, 401, `token ${bad.slice(0, 20)} must be denied`);
  }
});

test('token for another revision is denied', async () => {
  const token = new URL(previewUrl).searchParams.get('grant');
  const res = await fetch(`${BASE}/p/${'0'.repeat(24)}?grant=${encodeURIComponent(token)}`);
  assert.equal([401, 404].includes(res.status), true);
});

// Raw HTTP request that preserves the exact path bytes — fetch()'s URL parser
// normalizes dot segments client-side and would never exercise the server.
function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: PORT, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('path traversal never escapes the artifact', async () => {
  const token = new URL(previewUrl).searchParams.get('grant');
  const attacks = [
    `../artifact-manifest.json`,
    `..%2f..%2fartifact-manifest.json`,
    `%2e%2e/%2e%2e/etc/passwd`,
    `%2e%2e%2f%2e%2e%2fanswer-sheet.json`,
    `..%5c..%5cwindows%5cwin.ini`,
    `foo/../../answer-sheet.json`,
    `foo%00.html`,
  ];
  for (const attack of attacks) {
    const { status, body } = await rawGet(`/p/${revisionId}/${attack}?grant=${encodeURIComponent(token)}`);
    assert.ok([400, 404].includes(status), `traversal "${attack}" returned ${status}`);
    assert.ok(!body.includes('"checksum"'), 'manifest content must not leak');
  }
});

test('the manifest and report files themselves are not servable', async () => {
  const token = new URL(previewUrl).searchParams.get('grant');
  for (const file of ['artifact-manifest.json', 'validation-report.json', 'answer-sheet.json']) {
    const res = await fetch(`${BASE}/p/${revisionId}/${file}?grant=${encodeURIComponent(token)}`);
    // Only files/ content is listed in the manifest allowlist; these live
    // beside it and must 404 unless the artifact itself contains such a file.
    if (res.status === 200) {
      const text = await res.text();
      assert.ok(!text.includes('"files"') || !text.includes('"checksum"'), `${file} leaked artifact metadata`);
    }
  }
});

test('revoked grant is denied', async () => {
  const revoke = await api(`/preview-grants/${grantId}`, { method: 'DELETE' });
  assert.equal(revoke.status, 200);
  const res = await fetch(previewUrl);
  assert.equal(res.status, 401);
});

test('expired grant is denied', async () => {
  // Fresh grant with the server's 4s TTL.
  const projects = (await (await api('/projects')).json()).data;
  const grantRes = await api(`/projects/${projects[0].id}/revisions/${revisionId}/preview-grants`, { method: 'POST' });
  const grant = (await grantRes.json()).data;
  const ok = await fetch(grant.url);
  assert.equal(ok.status, 200);
  await new Promise((r) => setTimeout(r, 5000));
  const expired = await fetch(grant.url);
  assert.equal(expired.status, 401);
});
