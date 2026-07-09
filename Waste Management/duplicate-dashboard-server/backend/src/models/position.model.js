const { PositionStatus } = require('./enums');
const { createId, nowIso, pickDefined, requiredString } = require('./base');

const CHECKLIST_KEYS = Object.freeze([
  'clientConfirmed',
  'titleConfirmed',
  'salaryConfirmed',
  'locationConfirmed',
  'descriptionDone',
  'requirementsDone',
  'closingDateConfirmed',
  'approvalReceived'
]);

function blankChecklist() {
  return CHECKLIST_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {});
}

function normalizeChecklist(checklist = {}) {
  return CHECKLIST_KEYS.reduce((acc, key) => ({ ...acc, [key]: Boolean(checklist[key]) }), {});
}

function isChecklistComplete(checklist = {}) {
  return CHECKLIST_KEYS.every((key) => checklist[key] === true);
}

function createPositionDraft(input = {}) {
  return {
    id: input.id || createId('pos'),
    title: input.title || '',
    client: input.client || '',
    department: input.department || '',
    location: input.location || '',
    employmentType: input.employmentType || '',
    numHires: Number(input.numHires || 1),
    salaryRange: input.salaryRange || '',
    startDate: input.startDate || '',
    closingDate: input.closingDate || '',
    description: input.description || '',
    responsibilities: input.responsibilities || '',
    requirements: input.requirements || '',
    contactPerson: input.contactPerson || '',
    reasonForHiring: input.reasonForHiring || '',
    status: input.status || PositionStatus.DRAFT,
    companyDescription: input.companyDescription || '',
    coverLetterRequired: Boolean(input.coverLetterRequired),
    externalApplyUrl: input.externalApplyUrl || null,
    externalLinks: Array.isArray(input.externalLinks) ? input.externalLinks : [],
    applied: Boolean(input.applied),
    checklist: normalizeChecklist(input.checklist || blankChecklist()),
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    publishedAt: input.publishedAt || null,
    closedAt: input.closedAt || null,
    filtration: input.filtration || null,
    screening: input.screening || null
  };
}

function validatePositionForPublish(position) {
  requiredString(position.title, 'title');
  requiredString(position.client, 'client');
  requiredString(position.department, 'department');
  requiredString(position.location, 'location');
  requiredString(position.description, 'description');
  requiredString(position.requirements, 'requirements');
  if (!isChecklistComplete(position.checklist)) {
    throw new Error('all checklist items must be complete before publishing');
  }
  return true;
}

function patchPosition(position, patch = {}) {
  const allowed = pickDefined({
    title: patch.title,
    client: patch.client,
    department: patch.department,
    location: patch.location,
    employmentType: patch.employmentType,
    numHires: patch.numHires === undefined ? undefined : Number(patch.numHires),
    salaryRange: patch.salaryRange,
    startDate: patch.startDate,
    closingDate: patch.closingDate,
    description: patch.description,
    responsibilities: patch.responsibilities,
    requirements: patch.requirements,
    contactPerson: patch.contactPerson,
    reasonForHiring: patch.reasonForHiring,
    companyDescription: patch.companyDescription,
    coverLetterRequired: patch.coverLetterRequired,
    externalApplyUrl: patch.externalApplyUrl,
    externalLinks: patch.externalLinks,
    applied: patch.applied,
    status: patch.status,
    checklist: patch.checklist ? normalizeChecklist(patch.checklist) : undefined,
    filtration: patch.filtration,
    screening: patch.screening
  });

  return {
    ...position,
    ...allowed,
    updatedAt: nowIso()
  };
}

module.exports = {
  CHECKLIST_KEYS,
  blankChecklist,
  normalizeChecklist,
  isChecklistComplete,
  createPositionDraft,
  validatePositionForPublish,
  patchPosition
};
