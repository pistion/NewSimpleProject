const {
  PositionStatus,
  patchPosition,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const { ok, fail, notFound } = require('../http/api-response');

const LIVE_POSITION_STATUSES = new Set([
  PositionStatus.PUBLISHED,
  PositionStatus.SCREENING,
  PositionStatus.CLOSED,
  PositionStatus.ARCHIVED
]);

function positionApplicantSummary(position, applicants = []) {
  const positionApplicants = applicants.filter((applicant) => applicant.positionId === position.id);
  const byStatus = positionApplicants.reduce((acc, applicant) => {
    acc[applicant.status] = (acc[applicant.status] || 0) + 1;
    return acc;
  }, {});

  return {
    total: positionApplicants.length,
    byStatus
  };
}

function toPositionView(position, database) {
  return {
    ...position,
    applicantSummary: positionApplicantSummary(position, database.all('applicants')),
    canEdit: position.status !== PositionStatus.CLOSED && position.status !== PositionStatus.ARCHIVED,
    canRunFiltration: [PositionStatus.PUBLISHED, PositionStatus.SCREENING].includes(position.status),
    canPushToScreening: Boolean(position.filtration && position.filtration.status === 'done')
  };
}

function createPositionController(database = createInMemoryDatabase()) {
  function list({ query = {} } = {}) {
    const status = query.status || 'all';
    const rows = database
      .all('positions')
      .filter((position) => LIVE_POSITION_STATUSES.has(position.status))
      .filter((position) => status === 'all' || position.status === status)
      .map((position) => toPositionView(position, database));

    return ok(rows, {
      count: rows.length,
      filters: { status }
    });
  }

  function show({ params = {} } = {}) {
    const position = database.findById('positions', params.id);
    if (!position || !LIVE_POSITION_STATUSES.has(position.status)) {
      return notFound('position', params.id);
    }

    const applicants = database.all('applicants').filter((applicant) => applicant.positionId === position.id);
    return ok({
      ...toPositionView(position, database),
      applicants
    });
  }

  function update({ params = {}, body = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !LIVE_POSITION_STATUSES.has(current.status)) {
      return notFound('position', params.id);
    }
    if (current.status === PositionStatus.CLOSED || current.status === PositionStatus.ARCHIVED) {
      return fail('closed or archived positions must be reopened before editing', 409);
    }

    const blockedFields = ['status', 'publishedAt', 'closedAt', 'filtration', 'screening'];
    const safePatch = { ...body };
    blockedFields.forEach((field) => delete safePatch[field]);

    const next = database.update('positions', params.id, (position) => patchPosition(position, safePatch));
    return ok(toPositionView(next, database));
  }

  function close({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !LIVE_POSITION_STATUSES.has(current.status)) {
      return notFound('position', params.id);
    }
    if (current.status === PositionStatus.CLOSED) {
      return ok(toPositionView(current, database), { message: 'position already closed' });
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, {
      status: PositionStatus.CLOSED,
      closedAt: nowIso()
    }));
    return ok(toPositionView(next, database));
  }

  function reopen({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || current.status !== PositionStatus.CLOSED) {
      return notFound('closed position', params.id);
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, {
      status: PositionStatus.PUBLISHED,
      closedAt: null
    }));
    return ok(toPositionView(next, database));
  }

  function archive({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !LIVE_POSITION_STATUSES.has(current.status)) {
      return notFound('position', params.id);
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, {
      status: PositionStatus.ARCHIVED
    }));
    return ok(toPositionView(next, database));
  }

  function summary() {
    const liveRows = database.all('positions').filter((position) => LIVE_POSITION_STATUSES.has(position.status));
    const byStatus = liveRows.reduce((acc, position) => {
      acc[position.status] = (acc[position.status] || 0) + 1;
      return acc;
    }, {});

    const totalApplicants = liveRows.reduce((sum, position) => {
      return sum + database.all('applicants').filter((applicant) => applicant.positionId === position.id).length;
    }, 0);

    return ok({
      totalPositions: liveRows.length,
      totalApplicants,
      byStatus
    });
  }

  return {
    list,
    show,
    update,
    close,
    reopen,
    archive,
    summary
  };
}

module.exports = {
  LIVE_POSITION_STATUSES,
  positionApplicantSummary,
  toPositionView,
  createPositionController
};
