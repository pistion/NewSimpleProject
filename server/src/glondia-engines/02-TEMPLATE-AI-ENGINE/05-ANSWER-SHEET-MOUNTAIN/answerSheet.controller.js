/**
 * answerSheet.controller.js
 *
 * HTTP handlers for the answer-sheet layer.
 * All business logic lives in the service files — this is wiring only.
 */

import { getSitePlan, updateSitePlan } from '../store/sitePlanStore.js';
import { buildAnswerSheetFromPlan } from './answerSheetBuilder.service.js';
import { completeAnswerSheetWithAi } from './answerSheetAi.service.js';
import { validateAnswerSheet } from './answerSheetValidator.service.js';

function nowIso() { return new Date().toISOString(); }
function httpErr(msg, status = 400) { return Object.assign(new Error(msg), { status, expose: true }); }

function canAccess(user, plan) {
  if (user?.role === 'admin') return true;
  const owner = plan.userId || plan.ownerUserId || null;
  return Boolean(user?.id && owner && user.id === owner);
}

// GET /plans/:planId/answer-sheet
async function getAnswerSheet(req, res, next) {
  try {
    const plan = await getSitePlan(req.params.planId);
    if (!plan) throw httpErr('Plan not found.', 404);
    if (!canAccess(req.user, plan)) throw httpErr('Access denied.', 403);

    if (!plan.answerSheet) {
      return res.json({ answerSheet: null, status: 'missing', planId: plan.planId });
    }
    res.json({
      answerSheet: plan.answerSheet,
      status: plan.answerSheetStatus || 'draft',
      planId: plan.planId,
    });
  } catch (e) { next(e); }
}

// POST /plans/:planId/answer-sheet/build
async function buildAnswerSheet(req, res, next) {
  try {
    const plan = await getSitePlan(req.params.planId);
    if (!plan) throw httpErr('Plan not found.', 404);
    if (!canAccess(req.user, plan)) throw httpErr('Access denied.', 403);

    const answerSheet = buildAnswerSheetFromPlan(plan);
    const validation = validateAnswerSheet(answerSheet);
    const status = resolveStatus(validation, 'built');

    await updateSitePlan(plan.planId, {
      answerSheet,
      answerSheetStatus: status,
      answerSheetUpdatedAt: nowIso(),
    });

    res.json({ answerSheet, validation, status, planId: plan.planId });
  } catch (e) { next(e); }
}

// POST /plans/:planId/answer-sheet/generate  (build + AI complete)
async function completeAnswerSheet(req, res, next) {
  try {
    const plan = await getSitePlan(req.params.planId);
    if (!plan) throw httpErr('Plan not found.', 404);
    if (!canAccess(req.user, plan)) throw httpErr('Access denied.', 403);

    const base = plan.answerSheet || buildAnswerSheetFromPlan(plan);
    let answerSheet = base;

    try {
      answerSheet = await completeAnswerSheetWithAi(base, req.body || {});
    } catch (aiError) {
      // If OpenAI is unavailable, fall back to the built sheet with a warning
      const warnings = Array.isArray(base.meta?.warnings) ? base.meta.warnings : [];
      answerSheet = {
        ...base,
        meta: { ...base.meta, warnings: [...warnings, `AI completion skipped: ${aiError.message}`] },
      };
    }

    const validation = validateAnswerSheet(answerSheet);
    const status = resolveStatus(validation, 'ai_generated');

    await updateSitePlan(plan.planId, {
      answerSheet,
      answerSheetStatus: status,
      answerSheetUpdatedAt: nowIso(),
    });

    res.json({ answerSheet, validation, status, planId: plan.planId });
  } catch (e) { next(e); }
}

// PUT /plans/:planId/answer-sheet  (manual edit)
async function updateAnswerSheet(req, res, next) {
  try {
    const plan = await getSitePlan(req.params.planId);
    if (!plan) throw httpErr('Plan not found.', 404);
    if (!canAccess(req.user, plan)) throw httpErr('Access denied.', 403);

    const incoming = req.body?.answerSheet || req.body;
    if (!incoming || typeof incoming !== 'object') throw httpErr('answerSheet body is required.', 400);

    const base = plan.answerSheet || buildAnswerSheetFromPlan(plan);
    const answerSheet = {
      ...base,
      ...incoming,
      meta: {
        ...(base.meta || {}),
        ...(incoming.meta || {}),
        updatedAt: nowIso(),
        approvedAt: base.meta?.approvedAt || null, // preserve existing approval
      },
    };

    const validation = validateAnswerSheet(answerSheet);
    const status = resolveStatus(validation, plan.answerSheetStatus || 'built');

    await updateSitePlan(plan.planId, {
      answerSheet,
      answerSheetStatus: status,
      answerSheetUpdatedAt: nowIso(),
    });

    res.json({ answerSheet, validation, status, planId: plan.planId });
  } catch (e) { next(e); }
}

// POST /plans/:planId/answer-sheet/approve
async function approveAnswerSheet(req, res, next) {
  try {
    const plan = await getSitePlan(req.params.planId);
    if (!plan) throw httpErr('Plan not found.', 404);
    if (!canAccess(req.user, plan)) throw httpErr('Access denied.', 403);

    const answerSheet = plan.answerSheet || buildAnswerSheetFromPlan(plan);
    const validation = validateAnswerSheet(answerSheet);

    if (!validation.valid) {
      return res.status(422).json({
        error: 'Answer sheet is incomplete and cannot be approved.',
        code: 'ANSWER_SHEET_INCOMPLETE',
        missing: validation.missing,
        warnings: validation.warnings,
        planId: plan.planId,
      });
    }

    const now = nowIso();
    const approved = {
      ...answerSheet,
      status: 'approved',
      meta: { ...(answerSheet.meta || {}), updatedAt: now, approvedAt: now },
    };

    await updateSitePlan(plan.planId, {
      answerSheet: approved,
      answerSheetStatus: 'approved',
      answerSheetUpdatedAt: now,
      answerSheetApprovedAt: now,
    });

    res.json({ answerSheet: approved, validation, status: 'approved', planId: plan.planId });
  } catch (e) { next(e); }
}

// ── Status helper ─────────────────────────────────────────────────────────────

function resolveStatus(validation, baseStatus = 'built') {
  if (!validation.valid) return 'incomplete';
  if (validation.warnings.length > 0) return 'needs_review';
  // Preserve approved status through manual edits if it was already approved
  if (baseStatus === 'approved') return 'needs_review'; // edit invalidates approval
  return 'ready';
}

export const answerSheetController = {
  getAnswerSheet,
  buildAnswerSheet,
  completeAnswerSheet,
  updateAnswerSheet,
  approveAnswerSheet,
};

export default answerSheetController;
