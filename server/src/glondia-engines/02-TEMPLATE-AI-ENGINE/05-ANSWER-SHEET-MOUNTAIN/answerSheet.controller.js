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
    // Deep-merge so partial updates (e.g. { hero: { title: "..." } } or
    // { business: { name: "..." } }) correctly patch the nested structure
    // without clobbering unrelated fields.
    const answerSheet = deepMergeAnswerSheet(base, incoming);

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

// ── Deep merge helper (for PUT answer-sheet) ──────────────────────────────────

function deepMergeAnswerSheet(base = {}, incoming = {}) {
  const now = nowIso();
  function mergeVal(orig, next) {
    if (next === undefined) return orig;
    if (next === null || next === '') return next; // allow clearing a field
    if (Array.isArray(orig) && Array.isArray(next)) {
      // Pages / sections: merge by id or name
      if (orig.length && orig[0] && typeof orig[0] === 'object' && (orig[0].id || orig[0].name)) {
        const merged = orig.map(item => {
          const match = next.find(n => (item.id && n.id === item.id) || (item.name && n.name === item.name));
          return match ? mergeObj(item, match) : item;
        });
        // Append any new items from next that weren't in orig
        next.forEach(n => {
          if (!merged.find(m => (n.id && m.id === n.id) || (n.name && m.name === n.name))) merged.push(n);
        });
        return merged;
      }
      return next; // replace primitive arrays
    }
    if (typeof orig === 'object' && !Array.isArray(orig) && typeof next === 'object' && !Array.isArray(next)) {
      return mergeObj(orig, next);
    }
    return next; // scalar: incoming wins
  }
  function mergeObj(o = {}, n = {}) {
    const result = { ...o };
    for (const k of Object.keys(n)) result[k] = mergeVal(o[k], n[k]);
    return result;
  }
  const merged = mergeObj(base, incoming);
  // Always preserve/update meta correctly
  merged.meta = {
    ...(base.meta || {}),
    ...(incoming.meta || {}),
    updatedAt: now,
    approvedAt: base.meta?.approvedAt || null,
  };
  return merged;
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
