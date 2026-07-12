import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../services/db.js';
import { transitionInTx, assertTransition, isLegalTransition } from '../builder/builderStateMachine.js';

export function jsonText(value) {
  if (value == null) return '{}';
  if (typeof value === 'string') return value || '{}';
  return JSON.stringify(value);
}

export function parseJsonText(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function stableHash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function slugify(input, fallback = 'site') {
  const slug = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

export async function ensureBuilderUser(user) {
  const id = user?.id || 'local-user';
  const existing = await prisma.user.findUnique({ where: { id } }).catch(() => null);
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id,
      email: user?.email || `${id}@glondia.local`,
      passwordHash: '',
      name: user?.name || id,
      role: user?.role || 'owner',
    },
  });
}

/**
 * Create a project. Template integrity metadata (`templatePin`) is computed
 * server-side by the service layer — customer-supplied integrity fields are
 * never written.
 */
export async function createProject({ user, data, templatePin = null }) {
  await ensureBuilderUser(user);
  const id = randomUUID();
  const sourceType = validateSourceType(data.sourceType);
  const baseSlug = slugify(data.slug || data.name || data.templateId || sourceType);
  const slug = await uniqueProjectSlug(user.id, baseSlug);
  const name = String(data.name || data.templateId || 'New website').trim().slice(0, 120);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "builder_projects" (
      "id", "user_id", "client_project_id", "source_type", "template_id", "template_version",
      "template_source_commit", "template_manifest_hash", "name", "slug", "status",
      "plan_json", "answer_sheet_json", "metadata", "created_at", "updated_at")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    user.id,
    nullable(data.clientProjectId),
    sourceType,
    templatePin ? templatePin.templateId : null,
    templatePin ? nullable(templatePin.templateVersion) : null,
    templatePin ? nullable(templatePin.templateSourceCommit) : null,
    templatePin ? nullable(templatePin.templateManifestHash) : null,
    name,
    slug,
    sourceType === 'template' ? 'TEMPLATE_SELECTED' : 'SOURCE_PENDING',
    jsonText(normalizeDoc(data.plan || {})),
    jsonText(normalizeDoc(data.answerSheet || {})),
    jsonText({ schemaVersion: 1, data: data.metadata || {} }),
  );
  return getProjectForUser(id, user.id);
}

export async function listProjectsForUser(userId, { status, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = status
    ? await prisma.$queryRawUnsafe(
        `SELECT * FROM "builder_projects" WHERE "user_id" = ? AND "status" = ? AND "deleted_at" IS NULL ORDER BY "updated_at" DESC LIMIT ?`,
        userId, String(status), safeLimit,
      )
    : await prisma.$queryRawUnsafe(
        `SELECT * FROM "builder_projects" WHERE "user_id" = ? AND "deleted_at" IS NULL ORDER BY "updated_at" DESC LIMIT ?`,
        userId, safeLimit,
      );
  return rows.map(mapProjectRow);
}

export async function getProjectForUser(projectId, userId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "builder_projects" WHERE "id" = ? AND "user_id" = ? AND "deleted_at" IS NULL LIMIT 1`,
    projectId, userId,
  );
  return rows[0] ? mapProjectRow(rows[0]) : null;
}

/**
 * Optimistically update a versioned project document (plan / answer sheet)
 * and move the project to `targetStatus` through the state machine.
 *
 * Returns:  { project }             on success
 *           { conflict: true, ... } when expectedVersion is stale
 *           { illegal: true, ... }  when the status transition is not legal
 *           null                    when the project does not exist for the user
 */
async function updateProjectDocument({
  projectId, userId, expectedVersion, column, doc, targetStatus,
  actorId, requestId, reason,
}) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `SELECT * FROM "builder_projects" WHERE "id" = ? AND "user_id" = ? AND "deleted_at" IS NULL LIMIT 1`,
      projectId, userId,
    );
    if (!rows[0]) return null;
    const current = mapProjectRow(rows[0]);

    if (!isLegalTransition(current.status, targetStatus)) {
      return { illegal: true, status: current.status, target: targetStatus };
    }
    const result = await tx.$executeRawUnsafe(
      `UPDATE "builder_projects"
       SET "${column}" = ?, "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "user_id" = ? AND "version" = ? AND "deleted_at" IS NULL`,
      jsonText(doc), projectId, userId, Number(expectedVersion),
    );
    if (Number(result) !== 1) return { conflict: true, currentVersion: current.version };

    if (current.status !== targetStatus) {
      await transitionInTx(tx, {
        projectId,
        from: current.status,
        to: targetStatus,
        actorType: 'user',
        actorId,
        reason,
        requestId,
      });
    }
    const updated = await tx.$queryRawUnsafe(
      `SELECT * FROM "builder_projects" WHERE "id" = ? LIMIT 1`, projectId,
    );
    return { project: mapProjectRow(updated[0]) };
  });
}

export async function updateProjectPlan({ projectId, userId, expectedVersion, plan, requestId }) {
  return updateProjectDocument({
    projectId, userId, expectedVersion,
    column: 'plan_json',
    doc: normalizeDoc(plan),
    targetStatus: 'PLANNING',
    actorId: userId,
    requestId,
    reason: 'plan_saved',
  });
}

export async function updateProjectAnswerSheet({ projectId, userId, expectedVersion, answerSheet, requestId }) {
  return updateProjectDocument({
    projectId, userId, expectedVersion,
    column: 'answer_sheet_json',
    doc: normalizeDoc(answerSheet),
    targetStatus: 'ANSWER_SHEET_REVIEW',
    actorId: userId,
    requestId,
    reason: 'answer_sheet_saved',
  });
}

export async function startGenerationJob({ project, userId, idempotencyKey, requestHash, payload, requestId }) {
  return prisma.$transaction(async (tx) => {
    const existing = await findJobByIdempotencyKey(tx, idempotencyKey);
    if (existing) return { reused: true, conflict: existing.request_hash !== requestHash, job: mapJobRow(existing) };

    if (!isLegalTransition(project.status, 'GENERATION_QUEUED')) {
      return { illegal: true, status: project.status, target: 'GENERATION_QUEUED' };
    }

    const nextRows = await tx.$queryRawUnsafe(
      `SELECT COALESCE(MAX("revision_number"), 0) + 1 AS "next" FROM "builder_revisions" WHERE "project_id" = ?`,
      project.id,
    );
    const revisionNumber = Number(nextRows[0]?.next || 1);
    const revisionId = randomUUID();
    const jobId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "builder_revisions" (
        "id", "project_id", "revision_number", "status", "plan_snapshot_json", "answer_sheet_json",
        "change_request_json", "created_by_user_id", "created_at", "updated_at")
       VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      revisionId,
      project.id,
      revisionNumber,
      jsonText(project.plan),
      jsonText(project.answerSheet),
      jsonText(normalizeDoc(payload.changeRequest || {})),
      userId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "builder_jobs" (
        "id", "project_id", "revision_id", "job_type", "status", "stage", "idempotency_key",
        "request_hash", "payload_json", "progress_json", "created_at", "updated_at")
       VALUES (?, ?, ?, 'BUILDER_GENERATE_REVISION', 'QUEUED', 'queued', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      jobId,
      project.id,
      revisionId,
      idempotencyKey,
      requestHash,
      jsonText(payload),
      jsonText({ schemaVersion: 1, data: { stage: 'queued', percent: 0 } }),
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "builder_job_events" ("id", "job_id", "sequence", "stage", "message", "details_json")
       VALUES (?, ?, 1, 'queued', 'Generation job queued.', ?)`,
      randomUUID(), jobId, jsonText({ schemaVersion: 1, data: { revisionId } }),
    );
    await tx.$executeRawUnsafe(
      `UPDATE "builder_projects" SET "current_revision_id" = ?, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      revisionId, project.id,
    );
    if (project.status !== 'GENERATION_QUEUED') {
      const moved = await transitionInTx(tx, {
        projectId: project.id,
        from: project.status,
        to: 'GENERATION_QUEUED',
        actorType: 'user',
        actorId: userId,
        reason: 'generation_requested',
        requestId,
        jobId,
      });
      if (!moved) {
        // Status changed underneath us — abort so the revision/job rows roll back.
        const err = new Error('Project status changed while queuing generation.');
        err.status = 409;
        err.code = 'BUILDER_STATUS_RACE';
        throw err;
      }
    }
    return { reused: false, conflict: false, job: mapJobRow({ id: jobId, project_id: project.id, revision_id: revisionId, job_type: 'BUILDER_GENERATE_REVISION', status: 'QUEUED', stage: 'queued', idempotency_key: idempotencyKey, request_hash: requestHash, payload_json: jsonText(payload), result_json: '{}', progress_json: jsonText({ schemaVersion: 1, data: { stage: 'queued', percent: 0 } }), attempt: 0, max_attempts: 3 }) };
  });
}

export async function getJobForUser(jobId, userId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT j.* FROM "builder_jobs" j
     JOIN "builder_projects" p ON p."id" = j."project_id"
     WHERE j."id" = ? AND p."user_id" = ? AND p."deleted_at" IS NULL LIMIT 1`,
    jobId, userId,
  );
  return rows[0] ? mapJobRow(rows[0]) : null;
}

export async function listRevisions(projectId, userId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT r.* FROM "builder_revisions" r
     JOIN "builder_projects" p ON p."id" = r."project_id"
     WHERE r."project_id" = ? AND p."user_id" = ?
     ORDER BY r."revision_number" DESC`,
    projectId, userId,
  );
  return rows.map(mapRevisionRow);
}

export async function getRevision(projectId, revisionId, userId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT r.* FROM "builder_revisions" r
     JOIN "builder_projects" p ON p."id" = r."project_id"
     WHERE r."project_id" = ? AND r."id" = ? AND p."user_id" = ? LIMIT 1`,
    projectId, revisionId, userId,
  );
  return rows[0] ? mapRevisionRow(rows[0]) : null;
}

export async function approveRevision({ projectId, revisionId, userId }) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `SELECT r.* FROM "builder_revisions" r
       JOIN "builder_projects" p ON p."id" = r."project_id"
       WHERE r."project_id" = ? AND r."id" = ? AND p."user_id" = ? LIMIT 1`,
      projectId, revisionId, userId,
    );
    const revision = rows[0];
    if (!revision) return { missing: true };
    if (revision.status !== 'READY') return { invalid: true, revision: mapRevisionRow(revision) };

    const projectRows = await tx.$queryRawUnsafe(
      `SELECT "status" FROM "builder_projects" WHERE "id" = ? LIMIT 1`, projectId,
    );
    const projectStatus = projectRows[0]?.status;
    if (!isLegalTransition(projectStatus, 'APPROVED')) {
      return { illegal: true, status: projectStatus, target: 'APPROVED' };
    }

    await tx.$executeRawUnsafe(
      `UPDATE "builder_revisions"
       SET "status" = 'APPROVED', "approved_by_user_id" = ?, "approved_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = ?`,
      userId, revisionId,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "builder_projects"
       SET "approved_revision_id" = ?, "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = ?`,
      revisionId, projectId,
    );
    if (projectStatus !== 'APPROVED') {
      await transitionInTx(tx, {
        projectId,
        from: projectStatus,
        to: 'APPROVED',
        actorType: 'user',
        actorId: userId,
        reason: 'revision_approved',
      });
    }
    return { revision: { ...mapRevisionRow(revision), status: 'APPROVED' } };
  });
}

export async function createPreviewGrant({ projectId, revisionId, userId, tokenHash, expiresAt }) {
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "builder_preview_grants" (
      "id", "project_id", "revision_id", "token_hash", "expires_at", "created_by_user_id", "created_at")
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    id, projectId, revisionId, tokenHash, expiresAt, userId,
  );
  return { id, projectId, revisionId, tokenHash, expiresAt };
}

export async function createDeploymentLink({ projectId, revisionId, deploymentId, idempotencyKey }) {
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `UPDATE "builder_deployment_links" SET "is_current" = 0 WHERE "project_id" = ?`,
    projectId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "builder_deployment_links" (
      "id", "project_id", "revision_id", "deployment_id", "idempotency_key", "status", "is_current", "created_at", "updated_at")
     VALUES (?, ?, ?, ?, ?, 'QUEUED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id, projectId, revisionId, deploymentId, idempotencyKey,
  );
  return { id, projectId, revisionId, deploymentId, idempotencyKey, status: 'QUEUED', isCurrent: true };
}

export async function findDeploymentByIdempotencyKey(idempotencyKey) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "builder_deployment_links" WHERE "idempotency_key" = ? LIMIT 1`,
    idempotencyKey,
  );
  return rows[0] ? mapDeploymentRow(rows[0]) : null;
}

// ── Durable worker: timestamps ───────────────────────────────────────────────
// SQLite CURRENT_TIMESTAMP produces 'YYYY-MM-DD HH:MM:SS' (UTC, no zone
// suffix). Every timestamp we write for lease/backoff/heartbeat comparisons
// must use the same shape or lexicographic comparison silently breaks — and
// Prisma's raw-query deserializer only accepts this shape without millis.
export function sqliteTimestamp(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// ── Durable worker: heartbeats ───────────────────────────────────────────────

export async function upsertWorkerHeartbeat({ workerId, info = {} }) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "builder_worker_heartbeats" ("worker_id", "info_json", "started_at", "last_seen_at")
     VALUES (?, ?, ?, ?)
     ON CONFLICT("worker_id") DO UPDATE SET "last_seen_at" = excluded."last_seen_at"`,
    workerId, jsonText({ schemaVersion: 1, data: info }), sqliteTimestamp(), sqliteTimestamp(),
  );
}

export async function deleteWorkerHeartbeat(workerId) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "builder_worker_heartbeats" WHERE "worker_id" = ?`, workerId,
  );
}

export async function hasFreshHeartbeat(maxAgeMs) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "worker_id" FROM "builder_worker_heartbeats" WHERE "last_seen_at" >= ? LIMIT 1`,
    sqliteTimestamp(-Math.abs(maxAgeMs)),
  );
  return rows.length > 0;
}

// ── Durable worker: job leasing ──────────────────────────────────────────────

/**
 * Atomically claim the next eligible job for this worker. Eligible:
 * status QUEUED/RETRY, availableAt due, no live lease, attempts remaining.
 * Returns the claimed job (mapped) or null.
 */
export async function claimNextJob({ workerId, jobTypes, leaseMs }) {
  const typeList = jobTypes.map(() => '?').join(', ');
  return prisma.$transaction(async (tx) => {
    const now = sqliteTimestamp();
    const candidates = await tx.$queryRawUnsafe(
      `SELECT "id", "status" FROM "builder_jobs"
       WHERE "status" IN ('QUEUED', 'RETRY')
         AND "available_at" <= ?
         AND ("lease_expires_at" IS NULL OR "lease_expires_at" <= ?)
         AND "attempt" < "max_attempts"
         AND "job_type" IN (${typeList})
       ORDER BY "available_at" ASC, "created_at" ASC
       LIMIT 1`,
      now, now, ...jobTypes,
    );
    if (!candidates[0]) return null;
    const changed = await tx.$executeRawUnsafe(
      `UPDATE "builder_jobs"
       SET "status" = 'RUNNING', "attempt" = "attempt" + 1,
           "lease_owner" = ?, "lease_expires_at" = ?,
           "started_at" = COALESCE("started_at", CURRENT_TIMESTAMP),
           "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "status" = ?
         AND ("lease_expires_at" IS NULL OR "lease_expires_at" <= ?)`,
      workerId, sqliteTimestamp(leaseMs), candidates[0].id, candidates[0].status, now,
    );
    if (Number(changed) !== 1) return null; // lost the race — caller polls again
    const rows = await tx.$queryRawUnsafe(
      `SELECT * FROM "builder_jobs" WHERE "id" = ? LIMIT 1`, candidates[0].id,
    );
    return mapJobRow(rows[0]);
  });
}

/** Renew the lease mid-run. Returns false when the lease was lost. */
export async function renewJobLease({ jobId, workerId, leaseMs }) {
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs"
     SET "lease_expires_at" = ?, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "lease_owner" = ? AND "status" = 'RUNNING'`,
    sqliteTimestamp(leaseMs), jobId, workerId,
  );
  return Number(changed) === 1;
}

export async function completeJob({ jobId, workerId, result = {} }) {
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs"
     SET "status" = 'SUCCEEDED', "stage" = 'complete', "result_json" = ?,
         "finished_at" = CURRENT_TIMESTAMP, "lease_owner" = NULL, "lease_expires_at" = NULL,
         "error_code" = NULL, "error_message" = NULL, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "lease_owner" = ? AND "status" = 'RUNNING'`,
    jsonText({ schemaVersion: 1, data: result }), jobId, workerId,
  );
  return Number(changed) === 1;
}

export async function retryJob({ jobId, workerId, errorCode, errorMessage, backoffMs }) {
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs"
     SET "status" = 'RETRY', "available_at" = ?, "error_code" = ?, "error_message" = ?,
         "lease_owner" = NULL, "lease_expires_at" = NULL, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "lease_owner" = ? AND "status" = 'RUNNING'`,
    sqliteTimestamp(backoffMs), errorCode || 'RETRYABLE_ERROR', truncate(errorMessage, 500), jobId, workerId,
  );
  return Number(changed) === 1;
}

export async function failJob({ jobId, workerId, errorCode, errorMessage }) {
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs"
     SET "status" = 'FAILED', "error_code" = ?, "error_message" = ?,
         "finished_at" = CURRENT_TIMESTAMP, "lease_owner" = NULL, "lease_expires_at" = NULL,
         "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "lease_owner" = ? AND "status" = 'RUNNING'`,
    errorCode || 'JOB_FAILED', truncate(errorMessage, 500), jobId, workerId,
  );
  return Number(changed) === 1;
}

export async function updateJobStage({ jobId, workerId, stage, percent = null, details = {} }) {
  const progress = { schemaVersion: 1, data: { stage, ...(percent != null ? { percent } : {}), ...details } };
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs"
     SET "stage" = ?, "progress_json" = ?, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "lease_owner" = ? AND "status" = 'RUNNING'`,
    stage, jsonText(progress), jobId, workerId,
  );
  return Number(changed) === 1;
}

/**
 * Recover jobs whose worker died: RUNNING with an expired lease becomes RETRY
 * (attempts remaining) or FAILED (attempts exhausted). Safe to run at startup
 * and on an interval from any worker.
 */
export async function recoverExpiredLeases() {
  const now = sqliteTimestamp();
  const retried = await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs"
     SET "status" = 'RETRY', "available_at" = CURRENT_TIMESTAMP,
         "lease_owner" = NULL, "lease_expires_at" = NULL,
         "error_code" = COALESCE("error_code", 'LEASE_EXPIRED'),
         "updated_at" = CURRENT_TIMESTAMP
     WHERE "status" = 'RUNNING' AND "lease_expires_at" IS NOT NULL AND "lease_expires_at" <= ?
       AND "attempt" < "max_attempts"`,
    now,
  );
  const failed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_jobs"
     SET "status" = 'FAILED', "error_code" = 'LEASE_EXPIRED', "error_message" = 'Worker lease expired with no attempts remaining.',
         "finished_at" = CURRENT_TIMESTAMP, "lease_owner" = NULL, "lease_expires_at" = NULL,
         "updated_at" = CURRENT_TIMESTAMP
     WHERE "status" = 'RUNNING' AND "lease_expires_at" IS NOT NULL AND "lease_expires_at" <= ?`,
    now,
  );
  return { retried: Number(retried), failed: Number(failed) };
}

export async function appendJobEvent({ jobId, stage = null, level = 'info', message, details = {} }) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `SELECT COALESCE(MAX("sequence"), 0) + 1 AS "next" FROM "builder_job_events" WHERE "job_id" = ?`,
      jobId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "builder_job_events" ("id", "job_id", "sequence", "stage", "level", "message", "details_json")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(), jobId, Number(rows[0]?.next || 1), stage, level, truncate(message, 500),
      jsonText({ schemaVersion: 1, data: details }),
    );
  });
}

export async function listJobEventsForUser(jobId, userId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.* FROM "builder_job_events" e
     JOIN "builder_jobs" j ON j."id" = e."job_id"
     JOIN "builder_projects" p ON p."id" = j."project_id"
     WHERE e."job_id" = ? AND p."user_id" = ?
     ORDER BY e."sequence" ASC`,
    jobId, userId,
  );
  return rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    sequence: Number(row.sequence),
    stage: row.stage,
    level: row.level,
    message: row.message,
    details: parseJsonText(row.details_json),
    createdAt: row.created_at,
  }));
}

// ── Worker-side (unscoped) reads and writes ──────────────────────────────────

export async function getJobById(jobId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "builder_jobs" WHERE "id" = ? LIMIT 1`, jobId,
  );
  return rows[0] ? mapJobRow(rows[0]) : null;
}

export async function getProjectById(projectId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "builder_projects" WHERE "id" = ? AND "deleted_at" IS NULL LIMIT 1`, projectId,
  );
  return rows[0] ? mapProjectRow(rows[0]) : null;
}

export async function getRevisionById(revisionId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "builder_revisions" WHERE "id" = ? LIMIT 1`, revisionId,
  );
  return rows[0] ? mapRevisionRow(rows[0]) : null;
}

/** Worker: audited project transition. Returns false when the guard misses. */
export async function transitionProject({ projectId, from, to, actorType = 'worker', actorId = null, reason = null, jobId = null }) {
  return prisma.$transaction((tx) => transitionInTx(tx, {
    projectId, from, to, actorType, actorId, reason, jobId,
  }));
}

/** Worker: mark a revision GENERATING while its job runs. */
export async function markRevisionGenerating(revisionId) {
  await prisma.$executeRawUnsafe(
    `UPDATE "builder_revisions" SET "status" = 'GENERATING', "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "status" IN ('DRAFT', 'GENERATING')`,
    revisionId,
  );
}

/**
 * Worker: finalize a successful generation. Refuses to touch APPROVED
 * revisions — approved artifacts are immutable.
 */
export async function markRevisionReady({
  revisionId, artifactLocation, artifactChecksum, sourceCommit = null,
  generatedSite = {}, generationModel = null, generationUsage = {}, validation = {},
}) {
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_revisions"
     SET "status" = 'READY', "artifact_location" = ?, "artifact_checksum" = ?, "source_commit" = ?,
         "generated_site_json" = ?, "generation_model" = ?, "generation_usage_json" = ?, "validation_json" = ?,
         "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "status" NOT IN ('APPROVED')`,
    artifactLocation, artifactChecksum, sourceCommit,
    jsonText({ schemaVersion: 1, data: generatedSite }),
    generationModel,
    jsonText({ schemaVersion: 1, data: generationUsage }),
    jsonText({ schemaVersion: 1, data: validation }),
    revisionId,
  );
  return Number(changed) === 1;
}

export async function markRevisionFailed({ revisionId, validation = {} }) {
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_revisions"
     SET "status" = 'FAILED', "validation_json" = ?, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "status" NOT IN ('APPROVED')`,
    jsonText({ schemaVersion: 1, data: validation }), revisionId,
  );
  return Number(changed) === 1;
}

// ── Preview grants ───────────────────────────────────────────────────────────

export async function findPreviewGrantByTokenHash(tokenHash) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "builder_preview_grants" WHERE "token_hash" = ? LIMIT 1`, tokenHash,
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: row.id,
    projectId: row.project_id,
    revisionId: row.revision_id,
    tokenHash: row.token_hash,
    audience: row.audience,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export async function touchPreviewGrant(grantId) {
  await prisma.$executeRawUnsafe(
    `UPDATE "builder_preview_grants" SET "last_used_at" = CURRENT_TIMESTAMP WHERE "id" = ?`, grantId,
  );
}

/** Revoke a grant the calling user owns (via project ownership). */
export async function revokePreviewGrant({ grantId, userId }) {
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE "builder_preview_grants" SET "revoked_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "revoked_at" IS NULL
       AND "project_id" IN (SELECT "id" FROM "builder_projects" WHERE "user_id" = ?)`,
    grantId, userId,
  );
  return Number(changed) === 1;
}

export async function deleteExpiredPreviewGrants() {
  const removed = await prisma.$executeRawUnsafe(
    `DELETE FROM "builder_preview_grants" WHERE "expires_at" <= ?`,
    sqliteTimestamp(),
  );
  return Number(removed);
}

/** Worker-side AI usage/audit record (route-level usage uses middleware). */
export async function recordAiUsageEvent({
  userId = null, projectId = null, jobId = null, provider, model, operation,
  promptTokens = 0, completionTokens = 0, estimatedCostMicros = 0, status, requestId = null, metadata = {},
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ai_usage_events" (
      "id", "user_id", "project_id", "job_id", "provider", "model", "operation",
      "prompt_tokens", "completion_tokens", "estimated_cost_micros", "status", "request_id", "metadata")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(), userId, projectId, jobId, provider, model, operation,
    Number(promptTokens) || 0, Number(completionTokens) || 0, Number(estimatedCostMicros) || 0,
    status, requestId, jsonText({ schemaVersion: 1, data: metadata }),
  );
}

function truncate(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function findJobByIdempotencyKey(tx, idempotencyKey) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT * FROM "builder_jobs" WHERE "idempotency_key" = ? LIMIT 1`,
    idempotencyKey,
  );
  return rows[0] || null;
}

async function uniqueProjectSlug(userId, base) {
  for (let i = 0; i < 100; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "builder_projects" WHERE "user_id" = ? AND "slug" = ? LIMIT 1`,
      userId, slug,
    );
    if (!rows.length) return slug;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function validateSourceType(sourceType) {
  const value = String(sourceType || 'template').toLowerCase();
  if (!['template', 'github', 'zip'].includes(value)) {
    const err = new Error('Unsupported builder source type.');
    err.status = 400;
    err.code = 'BUILDER_INVALID_SOURCE_TYPE';
    throw err;
  }
  return value;
}

function normalizeDoc(doc) {
  if (doc && typeof doc === 'object' && !Array.isArray(doc) && doc.schemaVersion) return doc;
  return { schemaVersion: 1, data: doc && typeof doc === 'object' ? doc : {} };
}

function nullable(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function mapProjectRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    clientProjectId: row.client_project_id,
    sourceType: row.source_type,
    templateId: row.template_id,
    templateVersion: row.template_version,
    templateSourceCommit: row.template_source_commit,
    templateManifestHash: row.template_manifest_hash,
    name: row.name,
    slug: row.slug,
    status: row.status,
    version: Number(row.version || 1),
    currentRevisionId: row.current_revision_id,
    approvedRevisionId: row.approved_revision_id,
    plan: parseJsonText(row.plan_json),
    answerSheet: parseJsonText(row.answer_sheet_json),
    metadata: parseJsonText(row.metadata),
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRevisionRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    revisionNumber: Number(row.revision_number || 0),
    parentRevisionId: row.parent_revision_id,
    status: row.status,
    planSnapshot: parseJsonText(row.plan_snapshot_json),
    answerSheet: parseJsonText(row.answer_sheet_json),
    generatedSite: parseJsonText(row.generated_site_json),
    artifactLocation: row.artifact_location,
    artifactChecksum: row.artifact_checksum,
    sourceCommit: row.source_commit,
    generationModel: row.generation_model,
    generationUsage: parseJsonText(row.generation_usage_json),
    validation: parseJsonText(row.validation_json),
    changeRequest: parseJsonText(row.change_request_json),
    createdByUserId: row.created_by_user_id,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapJobRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    revisionId: row.revision_id,
    jobType: row.job_type,
    status: row.status,
    stage: row.stage,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    payload: parseJsonText(row.payload_json),
    result: parseJsonText(row.result_json),
    progress: parseJsonText(row.progress_json),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempt: Number(row.attempt || 0),
    maxAttempts: Number(row.max_attempts || 3),
    availableAt: row.available_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDeploymentRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    revisionId: row.revision_id,
    deploymentId: row.deployment_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    isCurrent: Boolean(row.is_current),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
