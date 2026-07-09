const {
  createFileRecord,
  createTask,
  createActivityLog,
  createCalendarEvent,
  createOffer,
  createUser,
  patchUser,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const { ok, created, deleted, fail, notFound } = require('../http/api-response');

function normalizeSearch(value = '') {
  return String(value || '').trim().toLowerCase();
}

function asBool(value, fallback = null) {
  if (value === undefined || value === null || value === 'all') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'done'].includes(String(value).toLowerCase());
}

function byUpdatedDesc(a, b) {
  return String(b.updatedAt || b.createdAt || b.time || '').localeCompare(String(a.updatedAt || a.createdAt || a.time || ''));
}

function hasText(row, search, fields = []) {
  if (!search) return true;
  return fields.some((field) => String(row[field] || '').toLowerCase().includes(search));
}

function createSupportController(database = createInMemoryDatabase()) {
  function dashboardSummary() {
    const positions = database.all('positions');
    const applicants = database.all('applicants');
    const talents = database.all('talents');
    const offers = database.all('offers');
    const tasks = database.all('tasks');
    const screeningReports = database.all('screeningReports');
    const aiRuns = database.all('filtrationRuns');

    return ok({
      positions: {
        total: positions.length,
        open: positions.filter((position) => ['published', 'screening'].includes(position.status)).length,
        draft: positions.filter((position) => position.status === 'draft').length
      },
      applicants: {
        total: applicants.length,
        byStatus: applicants.reduce((acc, applicant) => {
          acc[applicant.status] = (acc[applicant.status] || 0) + 1;
          return acc;
        }, {})
      },
      talentPool: {
        total: talents.length,
        silverMedalists: talents.filter((talent) => talent.silverMedalist).length
      },
      tasks: {
        total: tasks.length,
        open: tasks.filter((task) => !task.done).length,
        done: tasks.filter((task) => task.done).length,
        highPriorityOpen: tasks.filter((task) => !task.done && task.priority === 'high').length
      },
      offers: {
        total: offers.length,
        byStatus: offers.reduce((acc, offer) => {
          acc[offer.status] = (acc[offer.status] || 0) + 1;
          return acc;
        }, {})
      },
      screening: {
        reports: screeningReports.length,
        averageScore: screeningReports.length
          ? Math.round(screeningReports.reduce((sum, report) => sum + Number(report.overallScore || 0), 0) / screeningReports.length)
          : 0
      },
      ai: {
        runs: aiRuns.length,
        completedRuns: aiRuns.filter((run) => run.status === 'completed').length
      }
    });
  }

  function health() {
    const snapshot = database.snapshot();
    return ok({
      status: 'ok',
      checkedAt: nowIso(),
      collections: Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Array.isArray(value) ? value.length : 'object']))
    });
  }

  function exportDatabase() {
    return ok(database.snapshot());
  }

  function listTasks({ query = {} } = {}) {
    const done = asBool(query.done, null);
    const search = normalizeSearch(query.search || query.q || '');
    const role = query.role || 'all';
    const rows = database.all('tasks')
      .filter((task) => done === null || Boolean(task.done) === done)
      .filter((task) => role === 'all' || task.role === role)
      .filter((task) => hasText(task, search, ['title', 'role', 'priority', 'due']))
      .sort(byUpdatedDesc);
    return ok(rows, { count: rows.length, filters: { done, search, role } });
  }

  function showTask({ params = {} } = {}) {
    const task = database.findById('tasks', params.id);
    if (!task) return notFound('task', params.id);
    return ok(task);
  }

  function storeTask({ body = {} } = {}) {
    try {
      const task = createTask(body);
      database.insert('tasks', task);
      return created(task);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function updateTask({ params = {}, body = {} } = {}) {
    const current = database.findById('tasks', params.id);
    if (!current) return notFound('task', params.id);
    const next = database.update('tasks', params.id, (task) => ({
      ...task,
      ...body,
      updatedAt: nowIso()
    }));
    return ok(next);
  }

  function completeTask({ params = {} } = {}) {
    const current = database.findById('tasks', params.id);
    if (!current) return notFound('task', params.id);
    const next = database.update('tasks', params.id, (task) => ({ ...task, done: true, updatedAt: nowIso() }));
    return ok(next);
  }

  function reopenTask({ params = {} } = {}) {
    const current = database.findById('tasks', params.id);
    if (!current) return notFound('task', params.id);
    const next = database.update('tasks', params.id, (task) => ({ ...task, done: false, updatedAt: nowIso() }));
    return ok(next);
  }

  function destroyTask({ params = {} } = {}) {
    const removed = database.remove('tasks', params.id);
    if (!removed) return notFound('task', params.id);
    return deleted(removed);
  }

  function listActivity({ query = {} } = {}) {
    const search = normalizeSearch(query.search || query.q || '');
    const rows = database.all('activityLogs')
      .filter((activity) => hasText(activity, search, ['who', 'action', 'target', 'to', 'time']))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return ok(rows, { count: rows.length, filters: { search } });
  }

  function storeActivity({ body = {} } = {}) {
    try {
      const activity = createActivityLog(body);
      database.insert('activityLogs', activity);
      return created(activity);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function listCalendarEvents({ query = {} } = {}) {
    const day = query.day || 'all';
    const search = normalizeSearch(query.search || query.q || '');
    const rows = database.all('calendarEvents')
      .filter((event) => day === 'all' || event.day === day)
      .filter((event) => hasText(event, search, ['title', 'who', 'tone', 'day']))
      .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
    return ok(rows, { count: rows.length, filters: { day, search } });
  }

  function storeCalendarEvent({ body = {} } = {}) {
    try {
      const event = createCalendarEvent(body);
      database.insert('calendarEvents', event);
      return created(event);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function updateCalendarEvent({ params = {}, body = {} } = {}) {
    const current = database.findById('calendarEvents', params.id);
    if (!current) return notFound('calendar event', params.id);
    const next = database.update('calendarEvents', params.id, (event) => ({ ...event, ...body, updatedAt: nowIso() }));
    return ok(next);
  }

  function destroyCalendarEvent({ params = {} } = {}) {
    const removed = database.remove('calendarEvents', params.id);
    if (!removed) return notFound('calendar event', params.id);
    return deleted(removed);
  }

  function listOffers({ query = {} } = {}) {
    const status = query.status || 'all';
    const search = normalizeSearch(query.search || query.q || '');
    const rows = database.all('offers')
      .filter((offer) => status === 'all' || offer.status === status)
      .filter((offer) => hasText(offer, search, ['name', 'role', 'amount', 'status', 'sent', 'expires']))
      .sort(byUpdatedDesc);
    return ok(rows, { count: rows.length, filters: { status, search } });
  }

  function showOffer({ params = {} } = {}) {
    const offer = database.findById('offers', params.id);
    if (!offer) return notFound('offer', params.id);
    return ok(offer);
  }

  function storeOffer({ body = {} } = {}) {
    try {
      const offer = createOffer(body);
      database.insert('offers', offer);
      return created(offer);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function updateOffer({ params = {}, body = {} } = {}) {
    const current = database.findById('offers', params.id);
    if (!current) return notFound('offer', params.id);
    const next = database.update('offers', params.id, (offer) => ({ ...offer, ...body, updatedAt: nowIso() }));
    return ok(next);
  }

  function sendOffer({ params = {}, body = {} } = {}) {
    const current = database.findById('offers', params.id);
    if (!current) return notFound('offer', params.id);
    const next = database.update('offers', params.id, (offer) => ({
      ...offer,
      status: 'sent',
      sent: body.sent || 'Today',
      expires: body.expires || offer.expires || null,
      updatedAt: nowIso()
    }));
    return ok(next);
  }

  function acceptOffer({ params = {} } = {}) {
    const current = database.findById('offers', params.id);
    if (!current) return notFound('offer', params.id);
    const next = database.update('offers', params.id, (offer) => ({ ...offer, status: 'accepted', updatedAt: nowIso() }));
    return ok(next);
  }

  function declineOffer({ params = {} } = {}) {
    const current = database.findById('offers', params.id);
    if (!current) return notFound('offer', params.id);
    const next = database.update('offers', params.id, (offer) => ({ ...offer, status: 'declined', updatedAt: nowIso() }));
    return ok(next);
  }

  function destroyOffer({ params = {} } = {}) {
    const removed = database.remove('offers', params.id);
    if (!removed) return notFound('offer', params.id);
    return deleted(removed);
  }

  function listFiles({ query = {} } = {}) {
    const entityType = query.entityType || 'all';
    const entityId = query.entityId || 'all';
    const rows = database.all('files')
      .filter((file) => entityType === 'all' || file.entityType === entityType)
      .filter((file) => entityId === 'all' || file.entityId === entityId)
      .sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
    return ok(rows, { count: rows.length, filters: { entityType, entityId } });
  }

  function storeFile({ body = {} } = {}) {
    try {
      const file = createFileRecord(body);
      database.insert('files', file);
      return created(file);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function destroyFile({ params = {} } = {}) {
    const removed = database.remove('files', params.id);
    if (!removed) return notFound('file', params.id);
    return deleted(removed);
  }

  function listUsers({ query = {} } = {}) {
    const status = query.status || 'all';
    const search = normalizeSearch(query.search || query.q || '');
    const rows = database.all('users')
      .filter((user) => status === 'all' || user.status === status)
      .filter((user) => hasText(user, search, ['name', 'email', 'role', 'status']))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return ok(rows, { count: rows.length, filters: { status, search } });
  }

  function showUser({ params = {} } = {}) {
    const user = database.findById('users', params.id);
    if (!user) return notFound('user', params.id);
    return ok(user);
  }

  function storeUser({ body = {} } = {}) {
    try {
      const user = createUser(body);
      database.insert('users', user);
      return created(user);
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function updateUser({ params = {}, body = {} } = {}) {
    const current = database.findById('users', params.id);
    if (!current) return notFound('user', params.id);
    const next = database.update('users', params.id, (user) => patchUser(user, body));
    return ok(next);
  }

  function updateUserPreferences({ params = {}, body = {} } = {}) {
    const current = database.findById('users', params.id);
    if (!current) return notFound('user', params.id);
    const preferences = { ...(current.preferences || {}), ...(body.preferences || body) };
    const user = database.update('users', params.id, (row) => patchUser(row, { preferences }));
    const prefRecord = {
      id: `pref-${params.id}`,
      userId: params.id,
      preferences,
      updatedAt: nowIso()
    };
    const existing = database.findById('userPreferences', prefRecord.id);
    if (existing) database.update('userPreferences', prefRecord.id, prefRecord);
    else database.insert('userPreferences', prefRecord);
    return ok({ user, preferences: prefRecord });
  }

  function destroyUser({ params = {} } = {}) {
    const removed = database.remove('users', params.id);
    if (!removed) return notFound('user', params.id);
    return deleted(removed);
  }

  return {
    dashboardSummary,
    health,
    exportDatabase,
    listTasks,
    showTask,
    storeTask,
    updateTask,
    completeTask,
    reopenTask,
    destroyTask,
    listActivity,
    storeActivity,
    listCalendarEvents,
    storeCalendarEvent,
    updateCalendarEvent,
    destroyCalendarEvent,
    listOffers,
    showOffer,
    storeOffer,
    updateOffer,
    sendOffer,
    acceptOffer,
    declineOffer,
    destroyOffer,
    listFiles,
    storeFile,
    destroyFile,
    listUsers,
    showUser,
    storeUser,
    updateUser,
    updateUserPreferences,
    destroyUser
  };
}

module.exports = {
  createSupportController
};
