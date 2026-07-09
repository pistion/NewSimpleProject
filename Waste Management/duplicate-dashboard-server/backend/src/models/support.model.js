const { createId, nowIso, requiredString } = require('./base');

function createFileRecord(input = {}) {
  return {
    id: input.id || createId('file'),
    entityType: requiredString(input.entityType || '', 'entityType'),
    entityId: requiredString(input.entityId || '', 'entityId'),
    fileName: requiredString(input.fileName || '', 'fileName'),
    fileUrl: input.fileUrl || null,
    mimeType: input.mimeType || null,
    uploadedBy: input.uploadedBy || null,
    uploadedAt: input.uploadedAt || nowIso()
  };
}

function createTask(input = {}) {
  return {
    id: input.id || createId('task'),
    title: requiredString(input.title || '', 'title'),
    role: input.role || '',
    due: input.due || null,
    priority: input.priority || 'medium',
    done: Boolean(input.done),
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function createActivityLog(input = {}) {
  return {
    id: input.id || createId('activity'),
    userId: input.userId || null,
    who: input.who || '',
    action: requiredString(input.action || '', 'action'),
    target: input.target || '',
    to: input.to || null,
    time: input.time || nowIso(),
    createdAt: input.createdAt || nowIso()
  };
}

function createCalendarEvent(input = {}) {
  return {
    id: input.id || createId('event'),
    day: input.day || '',
    start: input.start || '',
    end: input.end || '',
    title: requiredString(input.title || '', 'title'),
    who: input.who || '',
    tone: input.tone || 'blue',
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function createOffer(input = {}) {
  return {
    id: input.id || createId('offer'),
    name: requiredString(input.name || '', 'name'),
    role: input.role || '',
    amount: input.amount || '',
    status: input.status || 'draft',
    sent: input.sent || null,
    expires: input.expires || null,
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

module.exports = {
  createFileRecord,
  createTask,
  createActivityLog,
  createCalendarEvent,
  createOffer
};
