const { createId, nowIso, requiredString } = require('./base');

function createFiltrationRun(input = {}) {
  return {
    id: input.id || createId('filter'),
    positionId: requiredString(input.positionId || '', 'positionId'),
    status: input.status || 'pending',
    algorithm: input.algorithm || 'deterministic-completeness-v1',
    countsByTag: input.countsByTag || {},
    rankedApplicantIds: input.rankedApplicantIds || [],
    results: input.results || [],
    startedAt: input.startedAt || nowIso(),
    completedAt: input.completedAt || null,
    createdBy: input.createdBy || null,
    error: input.error || null
  };
}

function createAISuggestion(input = {}) {
  return {
    id: input.id || createId('ai'),
    positionId: requiredString(input.positionId || '', 'positionId'),
    applicantId: input.applicantId || null,
    type: input.type || 'screening-score',
    payload: input.payload || {},
    modelVersion: input.modelVersion || 'none-local-v1',
    confidence: Number(input.confidence || 0),
    explanation: input.explanation || '',
    createdAt: input.createdAt || nowIso(),
    appliedAt: input.appliedAt || null,
    appliedBy: input.appliedBy || null
  };
}

module.exports = {
  createFiltrationRun,
  createAISuggestion
};
