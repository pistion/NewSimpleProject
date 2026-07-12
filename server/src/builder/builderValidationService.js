/**
 * builderValidationService.js — request/document validation for the Builder
 * domain. Keeps controllers/services free of ad-hoc checks and guarantees
 * customer input never reaches shell commands, provider plans, or file paths.
 */

export const DOC_SCHEMA_VERSION = 1;
const MAX_DOC_BYTES = 512 * 1024; // hard cap on plan/answer-sheet payloads

export function validationError(code, message, details = undefined) {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  err.details = details;
  err.expose = true;
  return err;
}

/** Normalize a plan/answer-sheet document into { schemaVersion, data }. */
export function normalizeDoc(doc) {
  if (doc && typeof doc === 'object' && !Array.isArray(doc) && doc.schemaVersion) return doc;
  return { schemaVersion: DOC_SCHEMA_VERSION, data: doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {} };
}

export function assertDocSize(doc, label = 'document') {
  const bytes = Buffer.byteLength(JSON.stringify(doc ?? {}), 'utf8');
  if (bytes > MAX_DOC_BYTES) {
    throw validationError('BUILDER_DOC_TOO_LARGE', `The ${label} exceeds the ${Math.floor(MAX_DOC_BYTES / 1024)} kB limit.`, { bytes });
  }
}

export function requireExpectedVersion(body, label = 'update') {
  const value = Number(body?.expectedVersion);
  if (!Number.isInteger(value) || value < 1) {
    throw validationError(
      'BUILDER_EXPECTED_VERSION_REQUIRED',
      `expectedVersion is required for safe ${label}s.`,
    );
  }
  return value;
}

/** Only these keys are honored on project creation — everything else (notably
 * template integrity metadata) is server-assigned. */
export function sanitizeCreateProjectInput(body = {}) {
  return {
    sourceType: String(body.sourceType || 'template').toLowerCase(),
    templateId: strOrNull(body.templateId),
    name: strOrNull(body.name),
    slug: strOrNull(body.slug),
    clientProjectId: strOrNull(body.clientProjectId),
    plan: body.plan,
    answerSheet: body.answerSheet,
    metadata: body.metadata,
  };
}

function strOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

/** Answer sheets must be a JSON object document without functions/prototype tricks. */
export function validateAnswerSheet(answerSheet) {
  const doc = normalizeDoc(answerSheet);
  if (!doc.data || typeof doc.data !== 'object' || Array.isArray(doc.data)) {
    throw validationError('BUILDER_ANSWER_SHEET_INVALID', 'answerSheet must be a JSON object.');
  }
  assertDocSize(doc, 'answer sheet');
  return doc;
}

export function validatePlan(plan) {
  const doc = normalizeDoc(plan);
  if (!doc.data || typeof doc.data !== 'object' || Array.isArray(doc.data)) {
    throw validationError('BUILDER_PLAN_INVALID', 'plan must be a JSON object.');
  }
  assertDocSize(doc, 'plan');
  return doc;
}

/** Slugs are used in provider resource names — keep them strictly safe. */
export function assertSafeSlug(slug) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(String(slug || ''))) {
    throw validationError('BUILDER_SLUG_INVALID', 'Slug may only contain lowercase letters, numbers, and hyphens.');
  }
  return slug;
}
