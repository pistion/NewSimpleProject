const { createId, nowIso, requiredString } = require('./base');

function createScreeningCriterion(input = {}) {
  return {
    id: input.id || createId('crit'),
    positionId: input.positionId || null,
    name: requiredString(input.name || '', 'name'),
    description: input.description || '',
    weight: Number(input.weight || 0),
    isDefault: Boolean(input.isDefault),
    isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function createScreeningScore(input = {}) {
  return {
    id: input.id || createId('score'),
    applicantId: requiredString(input.applicantId || '', 'applicantId'),
    positionId: requiredString(input.positionId || '', 'positionId'),
    criterionId: requiredString(input.criterionId || '', 'criterionId'),
    score: Number(input.score || 0),
    tieBreakerCriteriaId: input.tieBreakerCriteriaId || null,
    tieBreakerScore: Number(input.tieBreakerScore || input.tieBreakerPoints || 0),
    finalScore: Number(input.finalScore || input.score || 0),
    notes: input.notes || '',
    scoredBy: input.scoredBy || null,
    source: input.source || 'human',
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function createTieBreakerCriterion(input = {}) {
  return {
    id: input.id || createId('tie'),
    positionId: input.positionId || null,
    screeningRunId: input.screeningRunId || null,
    criteriaType: 'tie_breaker',
    name: requiredString(input.name || '', 'name'),
    description: input.description || '',
    maxPoints: Number(input.maxPoints === undefined ? 1 : input.maxPoints),
    createdBy: input.createdBy || null,
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function createScreeningReport(input = {}) {
  return {
    id: input.id || createId('report'),
    applicantId: requiredString(input.applicantId || '', 'applicantId'),
    positionId: requiredString(input.positionId || '', 'positionId'),
    overallScore: Number(input.overallScore || 0),
    decision: input.decision || 'pending',
    summary: input.summary || '',
    reportUrl: input.reportUrl || null,
    generatedBy: input.generatedBy || null,
    generatedAt: input.generatedAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

module.exports = {
  createScreeningCriterion,
  createScreeningScore,
  createTieBreakerCriterion,
  createScreeningReport
};
