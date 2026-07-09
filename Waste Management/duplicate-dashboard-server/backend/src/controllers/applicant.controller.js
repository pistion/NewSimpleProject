const {
  ApplicantStatus,
  PositionStatus,
  createApplicant,
  patchApplicant,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const { ok, created, deleted, fail, notFound } = require('../http/api-response');

const VALID_APPLICANT_STATUSES = new Set(Object.values(ApplicantStatus));
const OPEN_POSITION_STATUSES = new Set([
  PositionStatus.PUBLISHED,
  PositionStatus.SCREENING
]);

function normalizeSearch(value = '') {
  return String(value).trim().toLowerCase();
}

function applicantMatchesSearch(applicant, search) {
  if (!search) return true;
  return [
    applicant.name,
    applicant.email,
    applicant.phone,
    applicant.cvName,
    applicant.coverLetterName,
    applicant.status
  ].some((field) => String(field || '').toLowerCase().includes(search));
}

function applicantPosition(positionId, database) {
  return database.findById('positions', positionId);
}

function toApplicantView(applicant, database) {
  const position = applicantPosition(applicant.positionId, database);
  return {
    ...applicant,
    position: position
      ? {
          id: position.id,
          title: position.title,
          client: position.client,
          department: position.department,
          location: position.location,
          status: position.status
        }
      : null,
    hasResume: Boolean(applicant.cvName),
    hasCoverLetter: Boolean(applicant.coverLetterName),
    isScreeningReady: Boolean(applicant.cvComplete && applicant.cvName),
    canAdvance: ![ApplicantStatus.HIRED, ApplicantStatus.REJECTED].includes(applicant.status)
  };
}

function applicantSummary(rows = []) {
  const byStatus = rows.reduce((acc, applicant) => {
    acc[applicant.status] = (acc[applicant.status] || 0) + 1;
    return acc;
  }, {});

  return {
    total: rows.length,
    byStatus,
    resumeComplete: rows.filter((applicant) => applicant.cvComplete).length,
    readyForScreening: rows.filter((applicant) => applicant.cvComplete && applicant.cvName).length
  };
}

function ensureValidStatus(status) {
  if (!VALID_APPLICANT_STATUSES.has(status)) {
    throw new Error(`invalid applicant status: ${status}`);
  }
}

function statusPatch(status, extra = {}) {
  ensureValidStatus(status);
  return {
    status,
    statusChangedAt: nowIso(),
    ...extra
  };
}

function createApplicantController(database = createInMemoryDatabase()) {
  function list({ query = {} } = {}) {
    const status = query.status || 'all';
    const positionId = query.positionId || 'all';
    const search = normalizeSearch(query.search || query.q || '');

    const rows = database
      .all('applicants')
      .filter((applicant) => status === 'all' || applicant.status === status)
      .filter((applicant) => positionId === 'all' || applicant.positionId === positionId)
      .filter((applicant) => applicantMatchesSearch(applicant, search))
      .map((applicant) => toApplicantView(applicant, database));

    return ok(rows, {
      count: rows.length,
      summary: applicantSummary(rows),
      filters: { status, positionId, search }
    });
  }

  function show({ params = {} } = {}) {
    const applicant = database.findById('applicants', params.id);
    if (!applicant) return notFound('applicant', params.id);
    return ok(toApplicantView(applicant, database));
  }

  function store({ body = {} } = {}) {
    const position = database.findById('positions', body.positionId);
    if (!position) return notFound('position', body.positionId);
    if (!OPEN_POSITION_STATUSES.has(position.status)) {
      return fail('applicants can only be created for published or screening positions', 409);
    }

    try {
      const applicant = createApplicant({
        ...body,
        status: body.status || ApplicantStatus.NEW,
        appliedAt: body.appliedAt || nowIso()
      });
      ensureValidStatus(applicant.status);
      database.insert('applicants', applicant);
      return created(toApplicantView(applicant, database));
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function update({ params = {}, body = {} } = {}) {
    const current = database.findById('applicants', params.id);
    if (!current) return notFound('applicant', params.id);

    if (body.positionId && body.positionId !== current.positionId) {
      const position = database.findById('positions', body.positionId);
      if (!position) return notFound('position', body.positionId);
    }

    if (body.status) {
      try {
        ensureValidStatus(body.status);
      } catch (error) {
        return fail(error.message, 422);
      }
    }

    const next = database.update('applicants', params.id, (applicant) => patchApplicant(applicant, body));
    return ok(toApplicantView(next, database));
  }

  function updateStatus({ params = {}, body = {} } = {}) {
    const current = database.findById('applicants', params.id);
    if (!current) return notFound('applicant', params.id);
    const nextStatus = body.status;

    try {
      ensureValidStatus(nextStatus);
    } catch (error) {
      return fail(error.message, 422);
    }

    const next = database.update('applicants', params.id, (applicant) => patchApplicant(applicant, statusPatch(nextStatus, {
      statusReason: body.reason || null
    })));
    return ok(toApplicantView(next, database));
  }

  function shortlist({ params = {}, body = {} } = {}) {
    return updateStatus({ params, body: { ...body, status: ApplicantStatus.SHORTLISTED } });
  }

  function moveToReview({ params = {}, body = {} } = {}) {
    return updateStatus({ params, body: { ...body, status: ApplicantStatus.REVIEW } });
  }

  function moveToInterview({ params = {}, body = {} } = {}) {
    return updateStatus({ params, body: { ...body, status: ApplicantStatus.INTERVIEW } });
  }

  function moveToOffer({ params = {}, body = {} } = {}) {
    return updateStatus({ params, body: { ...body, status: ApplicantStatus.OFFER } });
  }

  function hire({ params = {}, body = {} } = {}) {
    return updateStatus({ params, body: { ...body, status: ApplicantStatus.HIRED } });
  }

  function reject({ params = {}, body = {} } = {}) {
    return updateStatus({ params, body: { ...body, status: ApplicantStatus.REJECTED } });
  }

  function uploadResume({ params = {}, body = {} } = {}) {
    const current = database.findById('applicants', params.id);
    if (!current) return notFound('applicant', params.id);
    if (!body.cvName && !body.fileName) {
      return fail('cvName or fileName is required', 422);
    }

    const next = database.update('applicants', params.id, (applicant) => patchApplicant(applicant, {
      cvName: body.cvName || body.fileName,
      cvComplete: body.cvComplete === undefined ? true : Boolean(body.cvComplete)
    }));

    const fileRecord = {
      id: body.fileId || `file-${next.id}-${Date.now()}`,
      ownerType: 'applicant',
      ownerId: next.id,
      fileName: body.cvName || body.fileName,
      fileType: body.fileType || 'resume',
      mimeType: body.mimeType || null,
      url: body.url || null,
      uploadedAt: nowIso()
    };
    database.insert('files', fileRecord);

    return ok(toApplicantView(next, database), { file: fileRecord });
  }

  function destroy({ params = {} } = {}) {
    const current = database.findById('applicants', params.id);
    if (!current) return notFound('applicant', params.id);
    const removed = database.remove('applicants', params.id);
    return deleted(removed);
  }

  function summary({ query = {} } = {}) {
    const positionId = query.positionId || 'all';
    const rows = database
      .all('applicants')
      .filter((applicant) => positionId === 'all' || applicant.positionId === positionId);
    return ok(applicantSummary(rows), { filters: { positionId } });
  }

  return {
    list,
    show,
    store,
    update,
    updateStatus,
    shortlist,
    moveToReview,
    moveToInterview,
    moveToOffer,
    hire,
    reject,
    uploadResume,
    destroy,
    summary
  };
}

module.exports = {
  VALID_APPLICANT_STATUSES,
  OPEN_POSITION_STATUSES,
  applicantSummary,
  toApplicantView,
  createApplicantController
};
