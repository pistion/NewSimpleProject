/**
 * Durable job leasing, retry classification, artifact determinism, and output
 * validation — exercised directly against a throwaway SQLite database.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempDir = mkdtempSync(join(tmpdir(), 'glondia-builder-lease-'));
const dbPath = join(tempDir, 'lease.db');
closeSync(openSync(dbPath, 'w'));
process.env.DATABASE_URL = `file:${dbPath.replaceAll('\\', '/')}`;
process.env.DATA_DIR = join(tempDir, 'data');

execSync('npx prisma db push --skip-generate', {
  cwd: projectRoot,
  env: { ...process.env },
  stdio: 'ignore',
});

const { prisma } = await import('../src/services/db.js');
const repo = await import('../src/repositories/builder.repository.js');
const { isRetryableError, backoffMs } = await import('../src/builder/jobs/builderWorker.js');
const { hashDirectory, writeArtifact } = await import('../src/builder/generation/artifactWriter.js');
const { validateWorkspace } = await import('../src/builder/generation/outputValidator.js');

let project;

before(async () => {
  project = await repo.createProject({
    user: { id: 'lease-user', email: 'lease@test.local' },
    data: { sourceType: 'template', templateId: 'pulse-works', name: 'Lease Test' },
    templatePin: {
      templateId: 'pulse-works', templateVersion: 'v1',
      templateSourceCommit: null, templateManifestHash: 'x'.repeat(64),
    },
  });
});

after(async () => {
  await prisma.$disconnect();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows */ }
});

async function insertJob({ status = 'QUEUED', attempt = 0, maxAttempts = 3, leaseExpiresAt = null, availableAt = null } = {}) {
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "builder_jobs" (
      "id", "project_id", "job_type", "status", "idempotency_key", "attempt", "max_attempts",
      "available_at", "lease_expires_at", "created_at", "updated_at")
     VALUES (?, ?, 'BUILDER_GENERATE_REVISION', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id, project.id, status, `lease-${id}`, attempt, maxAttempts,
    availableAt || repo.sqliteTimestamp(), leaseExpiresAt,
  );
  return id;
}

const TYPES = ['BUILDER_GENERATE_REVISION'];

test('two workers race for one job — exactly one wins', async () => {
  const jobId = await insertJob();
  const [a, b] = await Promise.all([
    repo.claimNextJob({ workerId: 'worker-a', jobTypes: TYPES, leaseMs: 60000 }),
    repo.claimNextJob({ workerId: 'worker-b', jobTypes: TYPES, leaseMs: 60000 }),
  ]);
  const claims = [a, b].filter(Boolean);
  assert.equal(claims.length, 1, 'exactly one worker must claim the job');
  assert.equal(claims[0].id, jobId);
  assert.equal(claims[0].status, 'RUNNING');
  assert.equal(claims[0].attempt, 1);
  // Cleanup: finish it so later claims don't see it.
  await repo.completeJob({ jobId, workerId: claims[0].leaseOwner, result: {} });
});

test('lease renewal works for the owner only', async () => {
  const jobId = await insertJob();
  const job = await repo.claimNextJob({ workerId: 'worker-a', jobTypes: TYPES, leaseMs: 60000 });
  assert.equal(job.id, jobId);
  assert.equal(await repo.renewJobLease({ jobId, workerId: 'worker-a', leaseMs: 60000 }), true);
  assert.equal(await repo.renewJobLease({ jobId, workerId: 'worker-b', leaseMs: 60000 }), false);
  await repo.completeJob({ jobId, workerId: 'worker-a', result: {} });
});

test('retry backoff keeps the job unavailable until availableAt', async () => {
  const jobId = await insertJob();
  await repo.claimNextJob({ workerId: 'worker-a', jobTypes: TYPES, leaseMs: 60000 });
  await repo.retryJob({ jobId, workerId: 'worker-a', errorCode: 'AI_RATE_LIMITED', errorMessage: '429', backoffMs: 60_000 });

  const again = await repo.claimNextJob({ workerId: 'worker-b', jobTypes: TYPES, leaseMs: 60000 });
  assert.equal(again, null, 'job must stay unavailable during backoff');

  const job = await repo.getJobById(jobId);
  assert.equal(job.status, 'RETRY');
  assert.equal(job.errorCode, 'AI_RATE_LIMITED');
  // Make it available now and confirm it can be claimed again.
  await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs" SET "available_at" = ? WHERE "id" = ?`, repo.sqliteTimestamp(-1000), jobId,
  );
  const reclaimed = await repo.claimNextJob({ workerId: 'worker-b', jobTypes: TYPES, leaseMs: 60000 });
  assert.equal(reclaimed.id, jobId);
  assert.equal(reclaimed.attempt, 2);
  await repo.completeJob({ jobId, workerId: 'worker-b', result: {} });
});

test('expired lease is recovered to RETRY; exhausted attempts become FAILED', async () => {
  const recoverable = await insertJob({ status: 'RUNNING', attempt: 1, leaseExpiresAt: repo.sqliteTimestamp(-5000) });
  const exhausted = await insertJob({ status: 'RUNNING', attempt: 3, maxAttempts: 3, leaseExpiresAt: repo.sqliteTimestamp(-5000) });

  const { retried, failed } = await repo.recoverExpiredLeases();
  assert.ok(retried >= 1, 'recoverable job must be retried');
  assert.ok(failed >= 1, 'exhausted job must fail');

  assert.equal((await repo.getJobById(recoverable)).status, 'RETRY');
  const dead = await repo.getJobById(exhausted);
  assert.equal(dead.status, 'FAILED');
  assert.equal(dead.errorCode, 'LEASE_EXPIRED');

  const claimed = await repo.claimNextJob({ workerId: 'worker-c', jobTypes: TYPES, leaseMs: 60000 });
  assert.equal(claimed.id, recoverable, 'recovered job must be claimable');
  await repo.completeJob({ jobId: recoverable, workerId: 'worker-c', result: {} });
});

test('live leases are not stolen', async () => {
  const jobId = await insertJob();
  await repo.claimNextJob({ workerId: 'worker-a', jobTypes: TYPES, leaseMs: 60000 });
  const { retried } = await repo.recoverExpiredLeases();
  const job = await repo.getJobById(jobId);
  assert.equal(job.status, 'RUNNING', 'live lease must survive recovery');
  const thief = await repo.claimNextJob({ workerId: 'worker-b', jobTypes: TYPES, leaseMs: 60000 });
  assert.equal(thief, null);
  await repo.completeJob({ jobId, workerId: 'worker-a', result: {} });
});

test('retry classification distinguishes transient from permanent errors', () => {
  assert.equal(isRetryableError(Object.assign(new Error('rate limited'), { status: 429 })), true);
  assert.equal(isRetryableError(Object.assign(new Error('bad gateway'), { status: 502 })), true);
  assert.equal(isRetryableError(new Error('connect ETIMEDOUT 1.2.3.4:443')), true);
  assert.equal(isRetryableError(new Error('SQLITE_BUSY: database is locked')), true);
  assert.equal(isRetryableError(Object.assign(new Error('bad input'), { status: 400 })), false);
  assert.equal(isRetryableError(Object.assign(new Error('nope'), { retryable: false, status: 503 })), false);
  assert.equal(isRetryableError(Object.assign(new Error('unsafe output'), { code: 'BUILDER_OUTPUT_UNSAFE' })), false);
});

test('backoff grows exponentially and stays bounded', () => {
  const b1 = backoffMs(1, 1000);
  const b2 = backoffMs(2, 1000);
  const b4 = backoffMs(4, 1000);
  assert.ok(b1 >= 1000 && b1 < 1500);
  assert.ok(b2 >= 2000 && b2 < 2500);
  assert.ok(b4 >= 8000 && b4 < 8500);
  assert.ok(backoffMs(50, 1000) <= 32_000 * 1.25, 'backoff must be capped');
});

test('artifact checksum is deterministic and layout is complete', async () => {
  const siteDir = join(tempDir, 'site-src');
  await mkdir(siteDir, { recursive: true });
  await writeFile(join(siteDir, 'index.html'), '<html><body>Hello</body></html>');
  await mkdir(join(siteDir, 'assets'), { recursive: true });
  await writeFile(join(siteDir, 'assets', 'a.css'), 'body{color:red}');

  const one = await hashDirectory(siteDir);
  const two = await hashDirectory(siteDir);
  assert.equal(one.checksum, two.checksum);

  const revisionId = randomUUID();
  const artifact = await writeArtifact({
    workspaceDir: siteDir,
    revisionId,
    projectId: project.id,
    template: { templateId: 'pulse-works' },
    planSnapshot: { schemaVersion: 1, data: {} },
    answerSheet: { schemaVersion: 1, data: {} },
    validationReport: { ok: true },
    generation: { model: 'test', mode: 'deterministic' },
  });
  assert.match(artifact.checksum, /^[a-f0-9]{64}$/);
  assert.equal(artifact.manifest.fileCount, 2);
  const again = await hashDirectory(join(artifact.artifactLocation, 'files'));
  assert.equal(again.checksum, artifact.checksum, 'artifact files must hash to the manifest checksum');
});

test('output validation blocks secrets, blocked files, and missing entry', async () => {
  const badDir = join(tempDir, 'bad-site');
  await mkdir(badDir, { recursive: true });
  await writeFile(join(badDir, 'index.html'), '<html/>');
  await writeFile(join(badDir, 'config.js'), 'const OPENAI = "sk-' + 'a'.repeat(32) + '";');
  await writeFile(join(badDir, '.env'), 'DATABASE_URL=postgres://u:p@h/db');

  const report = await validateWorkspace(badDir);
  assert.equal(report.ok, false);
  const codes = report.errors.map((e) => e.code);
  assert.ok(codes.includes('SECRET_DETECTED'), `expected SECRET_DETECTED in ${codes.join(',')}`);
  assert.ok(codes.includes('BLOCKED_FILE'), `expected BLOCKED_FILE in ${codes.join(',')}`);
  for (const finding of report.errors) {
    assert.ok(!JSON.stringify(finding).includes('sk-' + 'a'.repeat(32)), 'secret value must never appear in findings');
  }

  const emptyDir = join(tempDir, 'empty-site');
  await mkdir(emptyDir, { recursive: true });
  await writeFile(join(emptyDir, 'about.html'), '<html/>');
  const noEntry = await validateWorkspace(emptyDir);
  assert.ok(noEntry.errors.some((e) => e.code === 'MISSING_DEPLOYABLE_ENTRY'));
});
