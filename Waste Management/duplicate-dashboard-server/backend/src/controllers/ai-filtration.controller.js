const {
  ApplicantStatus,
  createFiltrationRun,
  createAISuggestion,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const { ok, created, fail, notFound } = require('../http/api-response');

const DEFAULT_MODEL_VERSION = 'deterministic-heya-fit-v1';

function asNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function lower(value = '') {
  return String(value || '').trim().toLowerCase();
}

function tokenize(value = '') {
  return lower(value)
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function positionTerms(position = {}) {
  return new Set([
    ...tokenize(position.title),
    ...tokenize(position.department),
    ...tokenize(position.location),
    ...tokenize(position.description),
    ...tokenize(position.requirements),
    ...tokenize(position.responsibilities),
    ...(position.skills || []).flatMap(tokenize)
  ]);
}

function applicantTerms(applicant = {}) {
  const screeningNotes = applicant.screening && applicant.screening.scores
    ? Object.values(applicant.screening.scores).flatMap((score) => tokenize(score.notes))
    : [];

  return new Set([
    ...tokenize(applicant.name),
    ...tokenize(applicant.email),
    ...tokenize(applicant.phone),
    ...tokenize(applicant.cvName),
    ...tokenize(applicant.coverLetterName),
    ...screeningNotes
  ]);
}

function calculateExistingScreeningAverage(applicant = {}) {
  const scores = applicant.screening && applicant.screening.scores
    ? Object.values(applicant.screening.scores)
    : [];
  if (!scores.length) return null;
  const total = scores.reduce((sum, score) => sum + asNumber(score.score), 0);
  return Math.round(total / scores.length);
}

function calculateMatchScore(applicant, position) {
  const pTerms = positionTerms(position);
  const aTerms = applicantTerms(applicant);
  const overlap = [...pTerms].filter((term) => aTerms.has(term)).length;
  const overlapScore = Math.min(35, overlap * 5);
  const completenessScore = (applicant.email ? 12 : 0)
    + (applicant.phone ? 8 : 0)
    + (applicant.cvComplete ? 20 : 0)
    + (applicant.cvName ? 15 : 0)
    + (applicant.coverLetterName ? 5 : 0);
  const existingAverage = calculateExistingScreeningAverage(applicant);
  const existingScore = existingAverage === null ? 0 : Math.min(20, existingAverage * 2);
  return Math.max(0, Math.min(100, Math.round(completenessScore + overlapScore + existingScore)));
}

function recommendationFor(score, applicant) {
  if (!applicant.email || !applicant.phone || !applicant.cvName) return 'needs-more-info';
  if (score >= 80) return 'strong-match';
  if (score >= 65) return 'match';
  if (score >= 45) return 'needs-review';
  return 'weak-match';
}

function tagFor(score, applicant) {
  if (!applicant.email || !applicant.phone || !applicant.cvName) return 'missing-information';
  if (score >= 80) return 'top-fit';
  if (score >= 65) return 'good-fit';
  if (score >= 45) return 'review';
  return 'low-fit';
}

function reasonFor(score, applicant, position) {
  const reasons = [];
  if (applicant.cvComplete && applicant.cvName) reasons.push('resume is complete');
  if (applicant.coverLetterName) reasons.push('cover letter is attached');
  if (!applicant.email || !applicant.phone) reasons.push('contact details need completion');
  const existingAverage = calculateExistingScreeningAverage(applicant);
  if (existingAverage !== null) reasons.push(`existing screening average is ${existingAverage}/10`);
  reasons.push(`fit score for ${position.title} is ${score}/100`);
  return reasons.join('; ');
}

function buildResult(applicant, position) {
  const score = calculateMatchScore(applicant, position);
  const recommendation = recommendationFor(score, applicant);
  const tag = tagFor(score, applicant);
  return {
    applicantId: applicant.id,
    applicantName: applicant.name,
    positionId: position.id,
    positionTitle: position.title,
    score,
    recommendation,
    tag,
    reason: reasonFor(score, applicant, position),
    missing: {
      email: !Boolean(applicant.email),
      phone: !Boolean(applicant.phone),
      resume: !Boolean(applicant.cvName),
      completedCv: !Boolean(applicant.cvComplete)
    }
  };
}

function summarizeResults(results = []) {
  return results.reduce((acc, result) => {
    acc[result.tag] = (acc[result.tag] || 0) + 1;
    return acc;
  }, {});
}

function getRun(database, id) {
  return database.findById('filtrationRuns', id)
    || database.findById('aiFiltrationRuns', id)
    || null;
}

function insertRun(database, run) {
  database.insert('filtrationRuns', run);
  return run;
}

function createAIFiltrationController(database = createInMemoryDatabase()) {
  function listRuns({ query = {} } = {}) {
    const positionId = query.positionId || 'all';
    const rows = database
      .all('filtrationRuns')
      .filter((run) => positionId === 'all' || run.positionId === positionId);
    return ok(rows, { count: rows.length, filters: { positionId } });
  }

  function showRun({ params = {} } = {}) {
    const run = getRun(database, params.id);
    if (!run) return notFound('ai filtration run', params.id);
    return ok(run);
  }

  function runForPosition({ params = {}, body = {}, user = null } = {}) {
    const positionId = params.positionId || body.positionId;
    const position = database.findById('positions', positionId);
    if (!position) return notFound('position', positionId);

    const applicants = database
      .all('applicants')
      .filter((applicant) => applicant.positionId === position.id)
      .filter((applicant) => ![ApplicantStatus.HIRED, ApplicantStatus.REJECTED].includes(applicant.status));

    const results = applicants
      .map((applicant) => buildResult(applicant, position))
      .sort((a, b) => b.score - a.score || a.applicantName.localeCompare(b.applicantName));

    const completedAt = nowIso();
    const run = createFiltrationRun({
      positionId: position.id,
      status: 'completed',
      algorithm: body.algorithm || DEFAULT_MODEL_VERSION,
      countsByTag: summarizeResults(results),
      rankedApplicantIds: results.map((result) => result.applicantId),
      results,
      startedAt: body.startedAt || completedAt,
      completedAt,
      createdBy: (user && user.id) || body.createdBy || null
    });

    insertRun(database, run);

    results.forEach((result) => {
      database.insert('aiSuggestions', createAISuggestion({
        positionId: position.id,
        applicantId: result.applicantId,
        type: 'filtration-recommendation',
        payload: result,
        modelVersion: run.algorithm,
        confidence: result.score / 100,
        explanation: result.reason
      }));
    });

    return created(run, {
      position: { id: position.id, title: position.title },
      applicantCount: applicants.length
    });
  }

  function rerunForPosition(request = {}) {
    return runForPosition(request);
  }

  function resultsForPosition({ params = {}, query = {} } = {}) {
    const positionId = params.positionId || query.positionId;
    const position = database.findById('positions', positionId);
    if (!position) return notFound('position', positionId);

    const runs = database
      .all('filtrationRuns')
      .filter((run) => run.positionId === position.id)
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));

    if (!runs.length) {
      return ok([], { positionId: position.id, latestRunId: null, message: 'no filtration runs yet' });
    }

    return ok(runs[0].results || [], {
      positionId: position.id,
      latestRunId: runs[0].id,
      countsByTag: runs[0].countsByTag || {}
    });
  }

  function shortlistTopMatches({ params = {}, body = {} } = {}) {
    const positionId = params.positionId || body.positionId;
    const limit = Math.max(1, asNumber(body.limit, 5));
    const position = database.findById('positions', positionId);
    if (!position) return notFound('position', positionId);

    const resultResponse = resultsForPosition({ params: { positionId } });
    if (!resultResponse.ok) return resultResponse;

    const selected = resultResponse.data
      .filter((result) => ['strong-match', 'match'].includes(result.recommendation))
      .slice(0, limit);

    const updated = selected.map((result) => database.update('applicants', result.applicantId, (applicant) => ({
      ...applicant,
      status: ApplicantStatus.SHORTLISTED,
      statusChangedAt: nowIso(),
      aiRecommendation: result.recommendation,
      aiScore: result.score
    })));

    return ok(updated, { count: updated.length, positionId, limit });
  }

  function suggestions({ query = {} } = {}) {
    const positionId = query.positionId || 'all';
    const applicantId = query.applicantId || 'all';
    const rows = database
      .all('aiSuggestions')
      .filter((suggestion) => positionId === 'all' || suggestion.positionId === positionId)
      .filter((suggestion) => applicantId === 'all' || suggestion.applicantId === applicantId);
    return ok(rows, { count: rows.length, filters: { positionId, applicantId } });
  }

  function explainApplicant({ params = {} } = {}) {
    const applicant = database.findById('applicants', params.applicantId || params.id);
    if (!applicant) return notFound('applicant', params.applicantId || params.id);
    const position = database.findById('positions', applicant.positionId);
    if (!position) return notFound('position', applicant.positionId);
    const result = buildResult(applicant, position);
    return ok(result, { modelVersion: DEFAULT_MODEL_VERSION });
  }

  function applySuggestion({ params = {}, body = {}, user = null } = {}) {
    const suggestion = database.findById('aiSuggestions', params.id);
    if (!suggestion) return notFound('ai suggestion', params.id);
    const applicant = suggestion.applicantId ? database.findById('applicants', suggestion.applicantId) : null;
    if (!applicant) return notFound('applicant', suggestion.applicantId);

    const recommendation = suggestion.payload && suggestion.payload.recommendation;
    const nextStatus = body.status || (['strong-match', 'match'].includes(recommendation)
      ? ApplicantStatus.SHORTLISTED
      : applicant.status);

    const updatedApplicant = database.update('applicants', applicant.id, (current) => ({
      ...current,
      status: nextStatus,
      statusChangedAt: nextStatus !== current.status ? nowIso() : current.statusChangedAt,
      aiRecommendation: recommendation || null,
      aiScore: suggestion.payload ? suggestion.payload.score : null
    }));

    const updatedSuggestion = database.update('aiSuggestions', suggestion.id, (current) => ({
      ...current,
      appliedAt: nowIso(),
      appliedBy: (user && user.id) || body.appliedBy || null
    }));

    return ok({ suggestion: updatedSuggestion, applicant: updatedApplicant });
  }

  function summary({ query = {} } = {}) {
    const positionId = query.positionId || 'all';
    const runs = database
      .all('filtrationRuns')
      .filter((run) => positionId === 'all' || run.positionId === positionId);
    const latestRun = runs
      .slice()
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))[0] || null;

    return ok({
      totalRuns: runs.length,
      totalSuggestions: database.all('aiSuggestions').length,
      latestRun,
      latestCountsByTag: latestRun ? latestRun.countsByTag : {}
    }, { filters: { positionId } });
  }

  return {
    listRuns,
    showRun,
    runForPosition,
    rerunForPosition,
    resultsForPosition,
    shortlistTopMatches,
    suggestions,
    explainApplicant,
    applySuggestion,
    summary
  };
}

module.exports = {
  createAIFiltrationController,
  calculateMatchScore,
  buildResult
};
