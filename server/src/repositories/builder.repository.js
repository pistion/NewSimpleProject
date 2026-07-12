import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../services/db.js';

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

export async function createProject({ user, data }) {
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
    nullable(data.templateId),
    nullable(data.templateVersion || 'v1'),
    nullable(data.templateSourceCommit),
    nullable(data.templateManifestHash),
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

export async function updateProjectPlan({ projectId, userId, expectedVersion, plan }) {
  const normalized = normalizeDoc(plan);
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "builder_projects"
     SET "plan_json" = ?, "version" = "version" + 1, "status" = 'PLANNING', "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "user_id" = ? AND "version" = ? AND "deleted_at" IS NULL`,
    jsonText(normalized), projectId, userId, Number(expectedVersion),
  );
  return Number(result) === 1 ? getProjectForUser(projectId, userId) : null;
}

export async function updateProjectAnswerSheet({ projectId, userId, answerSheet }) {
  const normalized = normalizeDoc(answerSheet);
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "builder_projects"
     SET "answer_sheet_json" = ?, "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "user_id" = ? AND "deleted_at" IS NULL`,
    jsonText(normalized), projectId, userId,
  );
  return Number(result) === 1 ? getProjectForUser(projectId, userId) : null;
}

export async function startGenerationJob({ project, userId, idempotencyKey, requestHash, payload }) {
  return prisma.$transaction(async (tx) => {
    const existing = await findJobByIdempotencyKey(tx, idempotencyKey);
    if (existing) return { reused: true, conflict: existing.request_hash !== requestHash, job: mapJobRow(existing) };

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
      `UPDATE "builder_projects" SET "status" = 'GENERATION_QUEUED', "current_revision_id" = ?, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      revisionId, project.id,
    );
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
    await tx.$executeRawUnsafe(
      `UPDATE "builder_revisions"
       SET "status" = 'APPROVED', "approved_by_user_id" = ?, "approved_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = ?`,
      userId, revisionId,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "builder_projects"
       SET "status" = 'APPROVED', "approved_revision_id" = ?, "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = ?`,
      revisionId, projectId,
    );
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
