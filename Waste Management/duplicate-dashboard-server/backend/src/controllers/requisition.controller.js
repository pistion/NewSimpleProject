const {
  PositionStatus,
  createPositionDraft,
  patchPosition,
  validatePositionForPublish,
  isChecklistComplete,
  createId,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const { ok, created, deleted, fail, notFound } = require('../http/api-response');

const REQUISITION_STATUSES = new Set([PositionStatus.DRAFT, PositionStatus.READY]);

function toRequisitionView(position) {
  const checklistValues = Object.values(position.checklist || {});
  const completed = checklistValues.filter(Boolean).length;
  const total = checklistValues.length || 1;

  return {
    ...position,
    requisitionStage: !position.applied ? 'drafting' : position.status === PositionStatus.READY ? 'ready' : 'in-review',
    checklistProgress: {
      completed,
      total,
      percent: Math.round((completed / total) * 100),
      isComplete: isChecklistComplete(position.checklist || {})
    }
  };
}

function createRequisitionController(database = createInMemoryDatabase()) {
  function list({ query = {} } = {}) {
    const status = query.status || 'all';
    const rows = database
      .all('positions')
      .filter((position) => REQUISITION_STATUSES.has(position.status))
      .filter((position) => status === 'all' || position.status === status)
      .map(toRequisitionView);

    return ok(rows, {
      count: rows.length,
      filters: { status }
    });
  }

  function show({ params = {} } = {}) {
    const position = database.findById('positions', params.id);
    if (!position || !REQUISITION_STATUSES.has(position.status)) {
      return notFound('requisition', params.id);
    }
    return ok(toRequisitionView(position));
  }

  function store({ body = {}, user = null } = {}) {
    try {
      const requisition = createPositionDraft({
        ...body,
        status: PositionStatus.DRAFT,
        applied: Boolean(body.applied),
        createdBy: user?.id || body.createdBy || null
      });
      database.insert('positions', requisition);
      return created(toRequisitionView(requisition));
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function update({ params = {}, body = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !REQUISITION_STATUSES.has(current.status)) {
      return notFound('requisition', params.id);
    }

    if (current.status === PositionStatus.READY && body.status === PositionStatus.DRAFT) {
      return fail('ready requisitions must use reopenDraft to move back to draft', 409);
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, body));
    return ok(toRequisitionView(next));
  }

  function apply({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !REQUISITION_STATUSES.has(current.status)) {
      return notFound('requisition', params.id);
    }
    if (!String(current.title || '').trim()) {
      return fail('job title is required before applying the requisition', 422);
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, {
      applied: true,
      status: PositionStatus.DRAFT
    }));
    return ok(toRequisitionView(next), { message: 'requisition created; complete the pre-posting checklist next' });
  }

  function updateChecklist({ params = {}, body = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !REQUISITION_STATUSES.has(current.status)) {
      return notFound('requisition', params.id);
    }

    const checklist = {
      ...(current.checklist || {}),
      ...(body.checklist || body)
    };
    const next = database.update('positions', params.id, (position) => patchPosition(position, { checklist }));
    return ok(toRequisitionView(next));
  }

  function markReady({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !REQUISITION_STATUSES.has(current.status)) {
      return notFound('requisition', params.id);
    }
    if (!current.applied) {
      return fail('requisition must be applied before it can be marked ready', 409);
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, {
      status: PositionStatus.READY
    }));
    return ok(toRequisitionView(next));
  }

  function publish({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !REQUISITION_STATUSES.has(current.status)) {
      return notFound('requisition', params.id);
    }

    try {
      validatePositionForPublish(current);
    } catch (error) {
      return fail(error.message, 422);
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, {
      status: PositionStatus.PUBLISHED,
      publishedAt: nowIso()
    }));
    return ok(next, { message: 'requisition published as live position' });
  }

  function reopenDraft({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || current.status !== PositionStatus.READY) {
      return notFound('ready requisition', params.id);
    }

    const next = database.update('positions', params.id, (position) => patchPosition(position, {
      status: PositionStatus.DRAFT,
      applied: false
    }));
    return ok(toRequisitionView(next));
  }

  function duplicate({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current) return notFound('requisition', params.id);

    const copy = createPositionDraft({
      ...current,
      id: createId('pos'),
      title: `${current.title || 'Untitled'} (copy)`,
      status: PositionStatus.DRAFT,
      applied: false,
      publishedAt: null,
      closedAt: null,
      filtration: null,
      screening: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    database.insert('positions', copy);
    return created(toRequisitionView(copy));
  }

  function destroy({ params = {} } = {}) {
    const current = database.findById('positions', params.id);
    if (!current || !REQUISITION_STATUSES.has(current.status)) {
      return notFound('requisition', params.id);
    }
    const removed = database.remove('positions', params.id);
    return deleted(removed);
  }

  return {
    list,
    show,
    store,
    update,
    apply,
    updateChecklist,
    markReady,
    publish,
    reopenDraft,
    duplicate,
    destroy
  };
}

module.exports = {
  REQUISITION_STATUSES,
  toRequisitionView,
  createRequisitionController
};
