const {
  ApplicantStatus,
  ScreeningStatus,
  createScreeningCriterion,
  createScreeningScore,
  createTieBreakerCriterion,
  createScreeningReport,
  patchApplicant,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const {
  detectTiedScores,
  validateTieBreakerScore,
  calculateFinalScore,
  applyTieBreakerToApplicant,
  sortApplicantsByScreeningScore,
  sortApplicantsByFinalScore
} = require('../services/screening.service');
const { ok, created, deleted, fail, notFound } = require('../http/api-response');

const VALID_SCREENING_STATUSES = new Set(Object.values(ScreeningStatus));
const VALID_DECISIONS = new Set(['pending', 'recommended', 'needs-info', 'not-recommended']);

function asNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clampScore(value) {
  return Math.max(0, Math.min(10, asNumber(value, 0)));
}

function getApplicant(database, id) {
  return database.findById('applicants', id);
}

function getPosition(database, id) {
  return database.findById('positions', id);
}

function getCriteriaForPosition(database, positionId = null) {
  return database
    .all('screeningCriteria')
    .filter((criterion) => criterion.isActive !== false)
    .filter((criterion) => !criterion.positionId || !positionId || criterion.positionId === positionId);
}

function weightedAverage(scores = [], criteria = []) {
  if (!scores.length) return 0;
  const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  let weightedTotal = 0;
  let weightTotal = 0;

  scores.forEach((score) => {
    const criterion = criteriaById.get(score.criterionId);
    const weight = criterion && Number(criterion.weight) > 0 ? Number(criterion.weight) : 1;
    weightedTotal += clampScore(score.score) * weight;
    weightTotal += weight;
  });

  if (!weightTotal) return 0;
  return Math.round((weightedTotal / weightTotal) * 10) / 10;
}

function decisionFor(overallScore) {
  if (overallScore >= 8) return 'recommended';
  if (overallScore >= 5) return 'needs-info';
  return 'not-recommended';
}

function screeningStatusForDecision(decision) {
  if (decision === 'recommended') return ScreeningStatus.RECOMMENDED;
  if (decision === 'needs-info') return ScreeningStatus.NEEDS_INFO;
  if (decision === 'not-recommended') return ScreeningStatus.SCREENED;
  return ScreeningStatus.IN_REVIEW;
}

function scoresForApplicant(database, applicantId, positionId = null) {
  return database
    .all('screeningScores')
    .filter((score) => score.applicantId === applicantId)
    .filter((score) => !positionId || score.positionId === positionId);
}

function latestReportForApplicant(database, applicantId, positionId = null) {
  return database
    .all('screeningReports')
    .filter((report) => report.applicantId === applicantId)
    .filter((report) => !positionId || report.positionId === positionId)
    .sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')))[0] || null;
}

function buildScreeningView(database, applicant) {
  const position = getPosition(database, applicant.positionId);
  const criteria = getCriteriaForPosition(database, applicant.positionId);
  const scores = scoresForApplicant(database, applicant.id, applicant.positionId);
  const latestReport = latestReportForApplicant(database, applicant.id, applicant.positionId);
  const overallScore = scores.length ? weightedAverage(scores, criteria) : asNumber(applicant.screening && applicant.screening.overallScore, 0);

  return {
    applicantId: applicant.id,
    applicantName: applicant.name,
    positionId: applicant.positionId,
    positionTitle: position ? position.title : null,
    status: applicant.screening ? applicant.screening.status : ScreeningStatus.NOT_STARTED,
    overallScore,
    criteria,
    scores,
    report: latestReport || (applicant.screening && applicant.screening.report) || null,
    notes: applicant.screening ? applicant.screening.notes : '',
    updatedAt: applicant.screening ? applicant.screening.updatedAt : null
  };
}

function updateApplicantScreening(database, applicantId, patch = {}) {
  const current = getApplicant(database, applicantId);
  if (!current) return null;
  return database.update('applicants', applicantId, (applicant) => patchApplicant(applicant, {
    screening: {
      ...(applicant.screening || {}),
      ...patch,
      updatedAt: nowIso()
    }
  }));
}

function createScreeningController(database = createInMemoryDatabase()) {
  function listCriteria({ query = {} } = {}) {
    const positionId = query.positionId || null;
    const includeInactive = query.includeInactive === true || query.includeInactive === 'true';
    let rows = database.all('screeningCriteria');
    if (!includeInactive) rows = rows.filter((criterion) => criterion.isActive !== false);
    if (positionId && positionId !== 'all') {
      rows = rows.filter((criterion) => !criterion.positionId || criterion.positionId === positionId);
    }
    return ok(rows, { count: rows.length, filters: { positionId: positionId || 'global', includeInactive } });
  }

  function showCriterion({ params = {} } = {}) {
    const criterion = database.findById('screeningCriteria', params.id);
    if (!criterion) return notFound('screening criterion', params.id);
    return ok(criterion);
  }

  function listTieBreakers({ query = {} } = {}) {
    const positionId = query.positionId || null;
    const rows = database
      .all('tieBreakerCriteria')
      .filter((criterion) => !positionId || criterion.positionId === positionId);
    return ok(rows, { count: rows.length, filters: { positionId: positionId || 'all' } });
  }

  function showTieBreaker({ params = {} } = {}) {
    const criterion = database.findById('tieBreakerCriteria', params.id);
    if (!criterion) return notFound('tie-breaker criteria', params.id);
    return ok(criterion);
  }

  function storeTieBreaker({ body = {}, user = null } = {}) {
    if (body.positionId && !getPosition(database, body.positionId)) {
      return notFound('position', body.positionId);
    }
    try {
      const criterion = createTieBreakerCriterion({
        ...body,
        createdBy: body.createdBy || (user && user.id) || null
      });
      database.insert('tieBreakerCriteria', criterion);
      return created(criterion);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function updateTieBreaker({ params = {}, body = {} } = {}) {
    const current = database.findById('tieBreakerCriteria', params.id);
    if (!current) return notFound('tie-breaker criteria', params.id);
    const maxPoints = body.maxPoints === undefined ? current.maxPoints : validateTieBreakerScore(body.maxPoints);
    const next = database.update('tieBreakerCriteria', params.id, (criterion) => ({
      ...criterion,
      ...body,
      criteriaType: 'tie_breaker',
      maxPoints,
      updatedAt: nowIso()
    }));
    return ok(next);
  }

  function storeCriterion({ body = {} } = {}) {
    if (body.positionId && !getPosition(database, body.positionId)) {
      return notFound('position', body.positionId);
    }
    try {
      const criterion = createScreeningCriterion(body);
      database.insert('screeningCriteria', criterion);
      return created(criterion);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function updateCriterion({ params = {}, body = {} } = {}) {
    const current = database.findById('screeningCriteria', params.id);
    if (!current) return notFound('screening criterion', params.id);
    if (body.positionId && !getPosition(database, body.positionId)) {
      return notFound('position', body.positionId);
    }
    const next = database.update('screeningCriteria', params.id, (criterion) => ({
      ...criterion,
      ...body,
      weight: body.weight === undefined ? criterion.weight : Number(body.weight),
      isActive: body.isActive === undefined ? criterion.isActive : Boolean(body.isActive),
      updatedAt: nowIso()
    }));
    return ok(next);
  }

  function destroyCriterion({ params = {} } = {}) {
    const current = database.findById('screeningCriteria', params.id);
    if (!current) return notFound('screening criterion', params.id);
    const hasScores = database.all('screeningScores').some((score) => score.criterionId === params.id);
    if (hasScores) {
      const archived = database.update('screeningCriteria', params.id, (criterion) => ({
        ...criterion,
        isActive: false,
        updatedAt: nowIso()
      }));
      return ok(archived, { archived: true, reason: 'criterion has scores and was deactivated instead of deleted' });
    }
    return deleted(database.remove('screeningCriteria', params.id));
  }

  function listScores({ query = {} } = {}) {
    const applicantId = query.applicantId || 'all';
    const positionId = query.positionId || 'all';
    const rows = database
      .all('screeningScores')
      .filter((score) => applicantId === 'all' || score.applicantId === applicantId)
      .filter((score) => positionId === 'all' || score.positionId === positionId);
    return ok(rows, { count: rows.length, filters: { applicantId, positionId } });
  }

  function scoreApplicant({ params = {}, body = {}, user = null } = {}) {
    const applicantId = params.applicantId || body.applicantId;
    const applicant = getApplicant(database, applicantId);
    if (!applicant) return notFound('applicant', applicantId);

    const positionId = body.positionId || applicant.positionId;
    if (!getPosition(database, positionId)) return notFound('position', positionId);

    const criterion = database.findById('screeningCriteria', body.criterionId);
    if (!criterion) return notFound('screening criterion', body.criterionId);

    try {
      const score = createScreeningScore({
        ...body,
        applicantId,
        positionId,
        criterionId: criterion.id,
        score: clampScore(body.score),
        scoredBy: body.scoredBy || (user && user.id) || null,
        source: body.source || 'human'
      });
      database.insert('screeningScores', score);
      updateApplicantScreening(database, applicantId, {
        status: ScreeningStatus.IN_REVIEW,
        scores: {
          ...((applicant.screening && applicant.screening.scores) || {}),
          [criterion.id]: {
            score: score.score,
            notes: score.notes,
            source: score.source,
            scoredBy: score.scoredBy,
            updatedAt: score.updatedAt
          }
        }
      });
      return created(score, { applicantId, positionId });
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function bulkScoreApplicant({ params = {}, body = {}, user = null } = {}) {
    const applicantId = params.applicantId || body.applicantId;
    const applicant = getApplicant(database, applicantId);
    if (!applicant) return notFound('applicant', applicantId);
    const positionId = body.positionId || applicant.positionId;
    if (!getPosition(database, positionId)) return notFound('position', positionId);

    const submittedScores = Array.isArray(body.scores) ? body.scores : [];
    if (!submittedScores.length) return fail('scores array is required', 422);

    const inserted = [];
    const scoreMap = { ...((applicant.screening && applicant.screening.scores) || {}) };

    for (const item of submittedScores) {
      const criterion = database.findById('screeningCriteria', item.criterionId);
      if (!criterion) return notFound('screening criterion', item.criterionId);
      const score = createScreeningScore({
        ...item,
        applicantId,
        positionId,
        criterionId: criterion.id,
        score: clampScore(item.score),
        scoredBy: item.scoredBy || body.scoredBy || (user && user.id) || null,
        source: item.source || body.source || 'human'
      });
      database.insert('screeningScores', score);
      inserted.push(score);
      scoreMap[criterion.id] = {
        score: score.score,
        notes: score.notes,
        source: score.source,
        scoredBy: score.scoredBy,
        updatedAt: score.updatedAt
      };
    }

    updateApplicantScreening(database, applicantId, {
      status: ScreeningStatus.IN_REVIEW,
      notes: body.notes || (applicant.screening && applicant.screening.notes) || '',
      scores: scoreMap
    });

    return created(inserted, { count: inserted.length, applicantId, positionId });
  }

  function saveApplicantTieBreaker({ params = {}, body = {} } = {}) {
    const applicant = getApplicant(database, params.applicantId || body.applicantId);
    if (!applicant) return notFound('applicant', params.applicantId || body.applicantId);
    if (body.tieBreakerCriteriaId) {
      const criterion = database.findById('tieBreakerCriteria', body.tieBreakerCriteriaId);
      if (!criterion) return notFound('tie-breaker criteria', body.tieBreakerCriteriaId);
    }
    try {
      const patched = applyTieBreakerToApplicant(applicant, body);
      const next = updateApplicantScreening(database, applicant.id, patched.screening);
      return ok(buildScreeningView(database, next));
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function sortWithTieBreaker({ body = {} } = {}) {
    const positionId = body.positionId || null;
    const applicants = database
      .all('applicants')
      .filter((applicant) => !positionId || applicant.positionId === positionId)
      .map((applicant) => ({
        ...applicant,
        screening: {
          ...(applicant.screening || {}),
          screeningScore: asNumber(applicant.screening && (applicant.screening.screeningScore || applicant.screening.overallScore), 0),
          finalScore: calculateFinalScore(
            asNumber(applicant.screening && (applicant.screening.screeningScore || applicant.screening.overallScore), 0),
            applicant.screening && (applicant.screening.tieBreakerScore || applicant.screening.tieBreakerPoints || 0)
          )
        }
      }));
    const sorted = sortApplicantsByFinalScore(applicants, body.direction === 'asc' ? 'asc' : 'desc');
    return ok(sorted, { tieAnalysis: detectTiedScores(sortApplicantsByScreeningScore(applicants, 'desc')) });
  }

  function startApplicantScreening({ params = {}, body = {} } = {}) {
    const applicant = getApplicant(database, params.applicantId || body.applicantId);
    if (!applicant) return notFound('applicant', params.applicantId || body.applicantId);
    const next = updateApplicantScreening(database, applicant.id, {
      status: ScreeningStatus.IN_REVIEW,
      notes: body.notes || (applicant.screening && applicant.screening.notes) || ''
    });
    return ok(buildScreeningView(database, next));
  }

  function applicantScreening({ params = {} } = {}) {
    const applicant = getApplicant(database, params.applicantId);
    if (!applicant) return notFound('applicant', params.applicantId);
    return ok(buildScreeningView(database, applicant));
  }

  function generateReport({ params = {}, body = {}, user = null } = {}) {
    const applicantId = params.applicantId || body.applicantId;
    const applicant = getApplicant(database, applicantId);
    if (!applicant) return notFound('applicant', applicantId);
    const positionId = body.positionId || applicant.positionId;
    const position = getPosition(database, positionId);
    if (!position) return notFound('position', positionId);

    const criteria = getCriteriaForPosition(database, positionId);
    const scores = scoresForApplicant(database, applicant.id, positionId);
    const overallScore = body.overallScore === undefined ? weightedAverage(scores, criteria) : asNumber(body.overallScore, 0);
    const decision = body.decision || decisionFor(overallScore);
    if (!VALID_DECISIONS.has(decision)) return fail(`invalid screening decision: ${decision}`, 422);

    const summary = body.summary || `${applicant.name} scored ${overallScore}/10 for ${position.title}. Decision: ${decision}.`;
    const report = createScreeningReport({
      ...body,
      applicantId: applicant.id,
      positionId,
      overallScore,
      decision,
      summary,
      generatedBy: body.generatedBy || (user && user.id) || null
    });
    database.insert('screeningReports', report);

    const nextScreeningStatus = screeningStatusForDecision(decision);
    const applicantPatch = {
      status: nextScreeningStatus,
      overallScore,
      decision,
      notes: body.notes || (applicant.screening && applicant.screening.notes) || '',
      report
    };
    const nextApplicant = updateApplicantScreening(database, applicant.id, applicantPatch);

    return created(report, {
      applicant: {
        id: nextApplicant.id,
        name: nextApplicant.name,
        screeningStatus: nextApplicant.screening.status
      },
      scoreCount: scores.length
    });
  }

  function listReports({ query = {} } = {}) {
    const applicantId = query.applicantId || 'all';
    const positionId = query.positionId || 'all';
    const decision = query.decision || 'all';
    const rows = database
      .all('screeningReports')
      .filter((report) => applicantId === 'all' || report.applicantId === applicantId)
      .filter((report) => positionId === 'all' || report.positionId === positionId)
      .filter((report) => decision === 'all' || report.decision === decision);
    return ok(rows, { count: rows.length, filters: { applicantId, positionId, decision } });
  }

  function showReport({ params = {} } = {}) {
    const report = database.findById('screeningReports', params.id);
    if (!report) return notFound('screening report', params.id);
    return ok(report);
  }

  function finalizeApplicant({ params = {}, body = {} } = {}) {
    const applicant = getApplicant(database, params.applicantId || body.applicantId);
    if (!applicant) return notFound('applicant', params.applicantId || body.applicantId);
    const status = body.status || ScreeningStatus.SCREENED;
    if (!VALID_SCREENING_STATUSES.has(status)) return fail(`invalid screening status: ${status}`, 422);

    const report = latestReportForApplicant(database, applicant.id, applicant.positionId);
    const next = updateApplicantScreening(database, applicant.id, {
      status,
      decision: body.decision || (report && report.decision) || 'pending',
      notes: body.notes || (applicant.screening && applicant.screening.notes) || '',
      report: report || (applicant.screening && applicant.screening.report) || null
    });

    const shouldMoveApplicantToReview = [ScreeningStatus.SCREENED, ScreeningStatus.RECOMMENDED, ScreeningStatus.NEEDS_INFO].includes(status)
      && applicant.status === ApplicantStatus.NEW;
    const finalApplicant = shouldMoveApplicantToReview
      ? database.update('applicants', applicant.id, (row) => patchApplicant(row, { status: ApplicantStatus.REVIEW }))
      : next;

    return ok(buildScreeningView(database, finalApplicant));
  }

  function summary({ query = {} } = {}) {
    const positionId = query.positionId || 'all';
    const applicants = database
      .all('applicants')
      .filter((applicant) => positionId === 'all' || applicant.positionId === positionId);
    const byStatus = applicants.reduce((acc, applicant) => {
      const status = applicant.screening && applicant.screening.status ? applicant.screening.status : ScreeningStatus.NOT_STARTED;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const reports = database
      .all('screeningReports')
      .filter((report) => positionId === 'all' || report.positionId === positionId);
    return ok({
      totalApplicants: applicants.length,
      byStatus,
      reports: reports.length,
      averageReportScore: reports.length
        ? Math.round((reports.reduce((sum, report) => sum + asNumber(report.overallScore), 0) / reports.length) * 10) / 10
        : 0
    }, { filters: { positionId } });
  }

  return {
    listCriteria,
    showCriterion,
    listTieBreakers,
    showTieBreaker,
    storeTieBreaker,
    updateTieBreaker,
    storeCriterion,
    updateCriterion,
    destroyCriterion,
    listScores,
    scoreApplicant,
    bulkScoreApplicant,
    saveApplicantTieBreaker,
    sortWithTieBreaker,
    startApplicantScreening,
    applicantScreening,
    generateReport,
    listReports,
    showReport,
    finalizeApplicant,
    summary
  };
}

module.exports = {
  VALID_SCREENING_STATUSES,
  VALID_DECISIONS,
  weightedAverage,
  decisionFor,
  buildScreeningView,
  createScreeningController
};
