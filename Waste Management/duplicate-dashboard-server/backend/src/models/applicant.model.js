const { ApplicantStatus, ScreeningStatus } = require('./enums');
const { createId, nowIso, pickDefined, requiredString } = require('./base');

function createApplicant(input = {}) {
  return {
    id: input.id || createId('app'),
    name: requiredString(input.name || '', 'name'),
    email: input.email || null,
    phone: input.phone || null,
    positionId: requiredString(input.positionId || '', 'positionId'),
    status: input.status || ApplicantStatus.NEW,
    appliedAt: input.appliedAt || nowIso(),
    cvName: input.cvName || null,
    coverLetterName: input.coverLetterName || null,
    cvComplete: Boolean(input.cvComplete),
    screening: input.screening || {
      status: ScreeningStatus.NOT_STARTED,
      scores: {},
      tieBreakerCriteriaId: null,
      tieBreakerScore: 0,
      finalScore: 0,
      notes: '',
      report: null,
      updatedAt: null
    },
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function patchApplicant(applicant, patch = {}) {
  return {
    ...applicant,
    ...pickDefined({
      name: patch.name,
      email: patch.email,
      phone: patch.phone,
      positionId: patch.positionId,
      status: patch.status,
      cvName: patch.cvName,
      coverLetterName: patch.coverLetterName,
      cvComplete: patch.cvComplete,
      screening: patch.screening
    }),
    updatedAt: nowIso()
  };
}

module.exports = {
  createApplicant,
  patchApplicant
};
