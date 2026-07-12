/**
 * builderStateMachine.js — central Builder project state machine.
 *
 * Every project status change goes through requestTransition()/transitionInTx()
 * so that illegal transitions fail with 409 instead of silently corrupting the
 * lifecycle, and every transition is audited in builder_state_transitions.
 *
 * Controllers and repositories must not assign arbitrary statuses.
 */

import { randomUUID } from 'node:crypto';

export const PROJECT_STATES = Object.freeze([
  'DRAFT',
  'TEMPLATE_SELECTED',
  'SOURCE_PENDING',   // zip/github intake created, source not validated yet
  'SOURCE_SCANNING',  // zip/github durable scan job running
  'SOURCE_READY',     // zip/github source validated and importable
  'PLANNING',
  'PLAN_READY',
  'ANSWER_SHEET_REVIEW',
  'GENERATION_QUEUED',
  'GENERATING',
  'PREVIEW_READY',
  'REVISION_REQUESTED',
  'APPROVED',
  'DEPLOYMENT_QUEUED',
  'BUILDING',
  'LIVE',
  'GENERATION_FAILED',
  'DEPLOYMENT_FAILED',
  'BILLING_SETUP_FAILED',
  'SUSPENDED',
  'ARCHIVED',
]);

/**
 * from → set of legal targets. Self-transitions are always legal (no-op
 * refresh, e.g. repeated plan saves while PLANNING).
 */
const LEGAL = {
  DRAFT:                 ['TEMPLATE_SELECTED', 'SOURCE_PENDING', 'PLANNING', 'ARCHIVED'],
  TEMPLATE_SELECTED:     ['PLANNING', 'ANSWER_SHEET_REVIEW', 'ARCHIVED'],
  SOURCE_PENDING:        ['SOURCE_SCANNING', 'ARCHIVED'],
  SOURCE_SCANNING:       ['SOURCE_READY', 'SOURCE_PENDING', 'ARCHIVED'],
  SOURCE_READY:          ['APPROVED', 'SOURCE_SCANNING', 'ARCHIVED'],
  PLANNING:              ['PLAN_READY', 'ANSWER_SHEET_REVIEW', 'GENERATION_QUEUED', 'ARCHIVED'],
  PLAN_READY:            ['PLANNING', 'ANSWER_SHEET_REVIEW', 'GENERATION_QUEUED', 'ARCHIVED'],
  ANSWER_SHEET_REVIEW:   ['PLANNING', 'PLAN_READY', 'GENERATION_QUEUED', 'ARCHIVED'],
  GENERATION_QUEUED:     ['GENERATING', 'GENERATION_FAILED', 'ARCHIVED'],
  GENERATING:            ['PREVIEW_READY', 'GENERATION_FAILED'],
  PREVIEW_READY:         ['REVISION_REQUESTED', 'APPROVED', 'GENERATION_QUEUED', 'PLANNING', 'ANSWER_SHEET_REVIEW', 'ARCHIVED'],
  REVISION_REQUESTED:    ['GENERATION_QUEUED', 'PREVIEW_READY', 'ARCHIVED'],
  APPROVED:              ['DEPLOYMENT_QUEUED', 'GENERATION_QUEUED', 'REVISION_REQUESTED', 'ARCHIVED'],
  DEPLOYMENT_QUEUED:     ['BUILDING', 'DEPLOYMENT_FAILED', 'ARCHIVED'],
  BUILDING:              ['LIVE', 'DEPLOYMENT_FAILED', 'BILLING_SETUP_FAILED'],
  LIVE:                  ['DEPLOYMENT_QUEUED', 'GENERATION_QUEUED', 'SUSPENDED', 'ARCHIVED'],
  GENERATION_FAILED:     ['GENERATION_QUEUED', 'PLANNING', 'ANSWER_SHEET_REVIEW', 'ARCHIVED'],
  DEPLOYMENT_FAILED:     ['DEPLOYMENT_QUEUED', 'APPROVED', 'ARCHIVED'],
  BILLING_SETUP_FAILED:  ['DEPLOYMENT_QUEUED', 'LIVE', 'SUSPENDED', 'ARCHIVED'],
  SUSPENDED:             ['LIVE', 'ARCHIVED'],
  ARCHIVED:              [],
};

export function isKnownState(state) {
  return PROJECT_STATES.includes(state);
}

export function isLegalTransition(from, to) {
  if (!isKnownState(from) || !isKnownState(to)) return false;
  if (from === to) return true;
  return (LEGAL[from] || []).includes(to);
}

export function legalTargets(from) {
  return LEGAL[from] ? [...LEGAL[from]] : [];
}

export function assertTransition(from, to) {
  if (isLegalTransition(from, to)) return;
  const err = new Error(`Illegal builder project transition ${from} -> ${to}.`);
  err.status = 409;
  err.code = 'BUILDER_ILLEGAL_TRANSITION';
  err.details = { from, to, legal: legalTargets(from) };
  throw err;
}

/**
 * Perform an audited, guarded status transition inside an existing
 * transaction/client. The UPDATE is guarded by the expected `from` status so a
 * concurrent transition loses instead of overwriting.
 *
 * Returns true when the row transitioned, false when the guard did not match
 * (caller decides whether that is a 409 or a benign race).
 */
export async function transitionInTx(tx, {
  projectId,
  from,
  to,
  actorType = 'system',   // user | worker | system
  actorId = null,
  reason = null,
  requestId = null,
  jobId = null,
}) {
  assertTransition(from, to);
  const changed = await tx.$executeRawUnsafe(
    `UPDATE "builder_projects"
     SET "status" = ?, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "status" = ? AND "deleted_at" IS NULL`,
    to, projectId, from,
  );
  if (Number(changed) !== 1) return false;
  await tx.$executeRawUnsafe(
    `INSERT INTO "builder_state_transitions" (
      "id", "project_id", "from_status", "to_status", "actor_type", "actor_id",
      "reason", "request_id", "job_id", "created_at")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    randomUUID(), projectId, from, to, actorType, actorId, reason, requestId, jobId,
  );
  return true;
}
