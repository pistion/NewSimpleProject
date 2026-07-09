const {
  MessageKind,
  MessageStatus,
  VALID_MESSAGE_STATUSES,
  PositionStatus,
  ApplicantStatus,
  TalentStatus,
  createMessage,
  patchMessage,
  createTalent,
  patchTalent,
  createApplicant,
  createActivityLog,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const { ok, created, deleted, fail, notFound } = require('../http/api-response');

const OPEN_POSITION_STATUSES = new Set([
  PositionStatus.PUBLISHED,
  PositionStatus.SCREENING
]);

// ---------------------------------------------------------------------------
// Notification hub: in-memory pub/sub used by both SSE streams and the
// short-poll endpoint. The frontend topbar reads from `/api/messages/stream`
// (SSE) and falls back to `/api/messages/notifications` (long-poll) so that
// new messages produce a toast + red badge without a page refresh.
// ---------------------------------------------------------------------------
const notificationHub = (() => {
  const subscribers = new Set();
  const recent = [];
  const RECENT_LIMIT = 50;

  function publish(event) {
    const enriched = { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: nowIso(), ...event };
    recent.unshift(enriched);
    if (recent.length > RECENT_LIMIT) recent.length = RECENT_LIMIT;
    subscribers.forEach((listener) => {
      try { listener(enriched); } catch (_) { /* ignore listener errors */ }
    });
    return enriched;
  }

  function subscribe(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function since(cursor) {
    if (!cursor) return recent.slice(0, 10);
    const index = recent.findIndex((event) => event.id === cursor);
    return index === -1 ? recent.slice(0, 10) : recent.slice(0, index);
  }

  return { publish, subscribe, since };
})();

function normalizeSearch(value = '') {
  return String(value || '').trim().toLowerCase();
}

function byReceivedDesc(a, b) {
  return String(b.receivedAt || b.createdAt || '').localeCompare(String(a.receivedAt || a.createdAt || ''));
}

function messageMatchesSearch(message, search) {
  if (!search) return true;
  return [
    message.name,
    message.email,
    message.phone,
    message.subject,
    message.body,
    message.kind,
    message.status,
    message.positionTitle,
    message.cvName
  ].some((field) => String(field || '').toLowerCase().includes(search));
}

function decorate(message, database) {
  const linkedPosition = message.positionId ? database.findById('positions', message.positionId) : null;
  const linkedTalent   = message.linkedTalentId    ? database.findById('talents', message.linkedTalentId) : null;
  const linkedApplicant= message.linkedApplicantId ? database.findById('applicants', message.linkedApplicantId) : null;
  return {
    ...message,
    linkedPosition: linkedPosition ? {
      id: linkedPosition.id, title: linkedPosition.title, status: linkedPosition.status,
      department: linkedPosition.department, client: linkedPosition.client
    } : null,
    linkedTalent: linkedTalent ? {
      id: linkedTalent.id, name: linkedTalent.name, status: linkedTalent.status
    } : null,
    linkedApplicant: linkedApplicant ? {
      id: linkedApplicant.id, name: linkedApplicant.name, status: linkedApplicant.status,
      positionId: linkedApplicant.positionId
    } : null
  };
}

function summarize(rows) {
  return {
    total:    rows.length,
    unread:   rows.filter((row) => row.status === MessageStatus.UNREAD).length,
    archived: rows.filter((row) => row.status === MessageStatus.ARCHIVED).length,
    byKind:   rows.reduce((acc, row) => {
      acc[row.kind] = (acc[row.kind] || 0) + 1;
      return acc;
    }, {})
  };
}

function logActivity(database, who, action, target, extra = {}) {
  try {
    database.insert('activityLogs', createActivityLog({
      who: who || 'Contact form',
      action,
      target,
      time: nowIso(),
      ...extra
    }));
  } catch (_) { /* activity log failures must never break the flow */ }
}

function createMessageController(database = createInMemoryDatabase()) {
  // ----- Public intake (contact form) ----------------------------------
  function intake({ body = {}, headers = {} } = {}) {
    if (!body || typeof body !== 'object') return fail('invalid payload', 422);
    if (!body.name) return fail('name is required', 422);

    // The public site sends `isJobApplication: true|false` from the toggle.
    // Map it onto the message `kind`. CV-only submissions can pass `cvName`
    // even when isJobApplication is false.
    const explicitKind = body.kind || body.type;
    const toggle = body.isJobApplication || body.jobApplication || body.cvSubmission;
    const cvName = body.cvName || (body.cv && (body.cv.fileName || body.cv.name)) || null;
    const cvUrl  = body.cvUrl  || (body.cv && (body.cv.url      || body.cv.href)) || null;
    const inferredKind = explicitKind || (toggle
      ? (toggle === 'cv-submission' ? MessageKind.CV_SUBMISSION : MessageKind.JOB_APPLICATION)
      : (cvName ? MessageKind.CV_SUBMISSION : MessageKind.GENERAL));

    try {
      const message = createMessage({
        ...body,
        kind:      inferredKind,
        cvName,
        cvUrl,
        userAgent: headers['user-agent'] || null,
        ipAddress: headers['x-forwarded-for'] || headers['x-real-ip'] || null
      });
      database.insert('messages', message);

      logActivity(database, message.name, 'sent a message', message.subject, {
        to: message.isApplication ? 'Applications inbox' : 'Inbox'
      });

      notificationHub.publish({
        type:      'message.received',
        messageId: message.id,
        kind:      message.kind,
        name:      message.name,
        subject:   message.subject,
        isApplication: message.isApplication,
        positionId: message.positionId,
        cvName:    message.cvName
      });

      return created(decorate(message, database));
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  // ----- Inbox listing & detail ----------------------------------------
  function list({ query = {} } = {}) {
    const status   = query.status   || 'all';
    const kind     = query.kind     || 'all';
    const search   = normalizeSearch(query.search || query.q || '');
    const limit    = Math.min(Number(query.limit || 100), 500);

    let rows = database.all('messages').slice().sort(byReceivedDesc);
    if (status !== 'all') rows = rows.filter((row) => row.status === status);
    if (kind   !== 'all') rows = rows.filter((row) => row.kind === kind);
    rows = rows.filter((row) => messageMatchesSearch(row, search));
    const view = rows.slice(0, limit).map((row) => decorate(row, database));
    return ok(view, { count: rows.length, summary: summarize(database.all('messages')), filters: { status, kind, search } });
  }

  function summary() {
    return ok(summarize(database.all('messages')));
  }

  function show({ params = {} } = {}) {
    const message = database.findById('messages', params.id);
    if (!message) return notFound('message', params.id);
    return ok(decorate(message, database));
  }

  // ----- Inbox actions --------------------------------------------------
  function setStatus(id, status, extra = {}) {
    if (!VALID_MESSAGE_STATUSES.has(status)) return fail(`invalid message status: ${status}`, 422);
    const current = database.findById('messages', id);
    if (!current) return notFound('message', id);
    const next = database.update('messages', id, (row) => patchMessage(row, { status, ...extra }));
    return ok(decorate(next, database));
  }

  function markRead    ({ params = {} } = {}) { return setStatus(params.id, MessageStatus.READ); }
  function markUnread  ({ params = {} } = {}) { return setStatus(params.id, MessageStatus.UNREAD); }
  function archive     ({ params = {} } = {}) { return setStatus(params.id, MessageStatus.ARCHIVED); }
  function unarchive   ({ params = {} } = {}) { return setStatus(params.id, MessageStatus.READ); }

  function destroy({ params = {} } = {}) {
    const removed = database.remove('messages', params.id);
    if (!removed) return notFound('message', params.id);
    return deleted(removed);
  }

  function reply({ params = {}, body = {} } = {}) {
    const current = database.findById('messages', params.id);
    if (!current) return notFound('message', params.id);
    if (!body.replyBody && !body.body) return fail('replyBody is required', 422);
    const next = database.update('messages', params.id, (row) => patchMessage(row, {
      replyBody: body.replyBody || body.body,
      repliedAt: nowIso(),
      status:    MessageStatus.READ
    }));
    logActivity(database, body.from || 'Dashboard admin', 'replied to', current.name, { to: current.email });
    return ok(decorate(next, database));
  }

  // ----- Add to talent pool --------------------------------------------
  function addToTalentPool({ params = {}, body = {} } = {}) {
    const current = database.findById('messages', params.id);
    if (!current) return notFound('message', params.id);

    let talent = current.linkedTalentId ? database.findById('talents', current.linkedTalentId) : null;
    if (talent) {
      // Already linked — update touchpoint instead of creating a duplicate.
      talent = database.update('talents', talent.id, (row) => patchTalent(row, {
        lastTouchpoint: `Contact form: ${current.subject}`,
        status: body.status || row.status
      }));
    } else {
      try {
        talent = createTalent({
          name: current.name,
          email: current.email || '',
          phone: current.phone || '',
          title: body.title || '',
          location: body.location || '',
          headline: body.headline || current.subject,
          status: body.status || TalentStatus.ACTIVE,
          source: 'contact-form',
          notes: body.notes || current.body,
          skills: Array.isArray(body.skills) ? body.skills : [],
          lastTouchpoint: `Contact form: ${current.subject}`
        });
        database.insert('talents', talent);
      } catch (error) {
        return fail(error.message, 422);
      }
    }

    const nextMessage = database.update('messages', params.id, (row) => patchMessage(row, {
      linkedTalentId: talent.id,
      status: row.status === MessageStatus.UNREAD ? MessageStatus.READ : row.status
    }));

    logActivity(database, body.actor || 'Dashboard admin', 'added candidate to talent pool', talent.name);
    return ok({ message: decorate(nextMessage, database), talent });
  }

  // ----- Attach to open job advert -------------------------------------
  function attachToPosition({ params = {}, body = {} } = {}) {
    const current = database.findById('messages', params.id);
    if (!current) return notFound('message', params.id);
    const position = database.findById('positions', body.positionId);
    if (!position) return notFound('position', body.positionId);
    if (!OPEN_POSITION_STATUSES.has(position.status)) {
      return fail('messages can only be attached to published or screening positions', 409);
    }
    if (!current.name) return fail('message is missing applicant name', 422);

    let applicant = current.linkedApplicantId ? database.findById('applicants', current.linkedApplicantId) : null;
    if (!applicant) {
      try {
        applicant = createApplicant({
          name: current.name,
          email: current.email,
          phone: current.phone,
          positionId: position.id,
          status: ApplicantStatus.NEW,
          cvName: current.cvName,
          cvComplete: Boolean(current.cvName),
          coverLetterName: current.coverLetterName,
          appliedAt: current.receivedAt || nowIso()
        });
        applicant.source = 'contact-form';
        applicant.sourceMessageId = current.id;
        database.insert('applicants', applicant);
      } catch (error) {
        return fail(error.message, 422);
      }
    } else {
      // Already linked — just retarget the applicant onto this position if it changed.
      if (applicant.positionId !== position.id) {
        applicant = database.update('applicants', applicant.id, (row) => ({
          ...row,
          positionId: position.id,
          updatedAt: nowIso()
        }));
      }
    }

    const nextMessage = database.update('messages', params.id, (row) => patchMessage(row, {
      linkedApplicantId: applicant.id,
      positionId: position.id,
      positionTitle: position.title,
      status: row.status === MessageStatus.UNREAD ? MessageStatus.READ : row.status
    }));

    logActivity(database, body.actor || 'Dashboard admin', `attached application to ${position.title}`, applicant.name);
    return ok({ message: decorate(nextMessage, database), applicant, position: {
      id: position.id, title: position.title, status: position.status
    } });
  }

  // ----- Realtime notification stream (SSE) ----------------------------
  function streamNotifications(_, req, res) {
    if (!res || typeof res.writeHead !== 'function') {
      return ok({ message: 'SSE requires raw response handle. Use /api/messages/notifications for polling.' });
    }
    res.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ at: nowIso() })}\n\n`);
    const heartbeat = setInterval(() => {
      try { res.write(`: ping ${Date.now()}\n\n`); } catch (_) { /* socket closed */ }
    }, 25000);
    const unsubscribe = notificationHub.subscribe((event) => {
      try { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); } catch (_) { /* socket closed */ }
    });
    const teardown = () => { clearInterval(heartbeat); unsubscribe(); try { res.end(); } catch (_) {} };
    if (req && typeof req.on === 'function') {
      req.on('close', teardown);
      req.on('error', teardown);
    }
    return null; // signals to the server adapter that we already wrote the response
  }

  function notifications({ query = {} } = {}) {
    return ok(notificationHub.since(query.cursor || query.after || null));
  }

  return {
    intake,
    list,
    summary,
    show,
    markRead,
    markUnread,
    archive,
    unarchive,
    destroy,
    reply,
    addToTalentPool,
    attachToPosition,
    streamNotifications,
    notifications,
    _hub: notificationHub
  };
}

module.exports = {
  createMessageController,
  notificationHub
};
