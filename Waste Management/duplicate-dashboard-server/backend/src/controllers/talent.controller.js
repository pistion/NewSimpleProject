const {
  ApplicantStatus,
  PositionStatus,
  TalentStatus,
  createApplicant,
  createTalent,
  patchTalent,
  nowIso
} = require('../models');
const { createInMemoryDatabase } = require('../services/database.service');
const { ok, created, deleted, fail, notFound } = require('../http/api-response');

const VALID_TALENT_STATUSES = new Set(Object.values(TalentStatus));
const OPEN_POSITION_STATUSES = new Set([
  PositionStatus.PUBLISHED,
  PositionStatus.SCREENING
]);

function normalizeSearch(value = '') {
  return String(value).trim().toLowerCase();
}

function arrayIncludesAny(values = [], search = '') {
  return values.some((value) => String(value || '').toLowerCase().includes(search));
}

function talentMatchesSearch(talent, search) {
  if (!search) return true;
  return [
    talent.name,
    talent.title,
    talent.location,
    talent.headline,
    talent.email,
    talent.phone,
    talent.education,
    talent.source,
    talent.notes,
    talent.status,
    talent.lastTouchpoint
  ].some((field) => String(field || '').toLowerCase().includes(search)) ||
    arrayIncludesAny(talent.skills, search) ||
    arrayIncludesAny(talent.languages, search) ||
    (talent.pastRoles || []).some((role) => [role.company, role.role, role.years]
      .some((field) => String(field || '').toLowerCase().includes(search)));
}

function ensureValidTalentStatus(status) {
  if (!VALID_TALENT_STATUSES.has(status)) {
    throw new Error(`invalid talent status: ${status}`);
  }
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toTalentView(talent, database) {
  const invitedPositions = database
    .all('applicants')
    .filter((applicant) => applicant.sourceTalentId === talent.id)
    .map((applicant) => {
      const position = database.findById('positions', applicant.positionId);
      return {
        applicantId: applicant.id,
        status: applicant.status,
        position: position
          ? {
              id: position.id,
              title: position.title,
              client: position.client,
              department: position.department,
              location: position.location,
              status: position.status
            }
          : null
      };
    });

  return {
    ...talent,
    skillCount: (talent.skills || []).length,
    languageCount: (talent.languages || []).length,
    isSilverMedalist: Boolean(talent.silverMedalist || talent.status === TalentStatus.SILVER),
    invitedPositions,
    canInvite: ![TalentStatus.ARCHIVED].includes(talent.status)
  };
}

function scoreTalentForPosition(talent, position) {
  const positionText = [
    position.title,
    position.department,
    position.client,
    position.location,
    ...(position.requirements || []),
    ...(position.skills || [])
  ].join(' ').toLowerCase();

  const matchedSkills = (talent.skills || []).filter((skill) => positionText.includes(String(skill).toLowerCase()));
  const titleMatch = positionText.includes(String(talent.title || '').split(' ')[0].toLowerCase());
  const locationMatch = position.location && talent.location &&
    String(talent.location).toLowerCase().includes(String(position.location).toLowerCase().split(',')[0]);

  const baseScore = Number(talent.matchScore || 0);
  const skillBoost = matchedSkills.length * 4;
  const titleBoost = titleMatch ? 5 : 0;
  const locationBoost = locationMatch ? 3 : 0;
  const silverBoost = talent.silverMedalist ? 4 : 0;
  const score = Math.min(100, Math.round(baseScore * 0.65 + skillBoost + titleBoost + locationBoost + silverBoost));

  return {
    talent: toTalentView(talent, { ...databaseShim(), findById: () => null }),
    score,
    matchedSkills,
    reasons: unique([
      matchedSkills.length ? `${matchedSkills.length} matching skills` : null,
      titleMatch ? 'title aligns with position' : null,
      locationMatch ? 'location alignment' : null,
      talent.silverMedalist ? 'silver medalist candidate' : null,
      talent.yearsExperience ? `${talent.yearsExperience} years experience` : null
    ])
  };
}

function databaseShim() {
  return {
    all: () => [],
    findById: () => null
  };
}

function talentSummary(rows = []) {
  const byStatus = rows.reduce((acc, talent) => {
    acc[talent.status] = (acc[talent.status] || 0) + 1;
    return acc;
  }, {});
  const averageMatchScore = rows.length
    ? Math.round(rows.reduce((sum, talent) => sum + Number(talent.matchScore || 0), 0) / rows.length)
    : 0;

  return {
    total: rows.length,
    byStatus,
    silverMedalists: rows.filter((talent) => talent.silverMedalist).length,
    openToWork: rows.filter((talent) => talent.status === TalentStatus.OPEN_TO_WORK).length,
    averageMatchScore,
    topSkills: Object.entries(rows.flatMap((talent) => talent.skills || []).reduce((acc, skill) => {
      acc[skill] = (acc[skill] || 0) + 1;
      return acc;
    }, {}))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }))
  };
}

function createTalentController(database = createInMemoryDatabase()) {
  function list({ query = {} } = {}) {
    const status = query.status || 'all';
    const silver = query.silver || query.silverMedalist || 'all';
    const search = normalizeSearch(query.search || query.q || '');

    const rows = database
      .all('talents')
      .filter((talent) => status === 'all' || talent.status === status)
      .filter((talent) => silver === 'all' || Boolean(talent.silverMedalist) === (String(silver) === 'true'))
      .filter((talent) => talentMatchesSearch(talent, search))
      .map((talent) => toTalentView(talent, database));

    return ok(rows, {
      count: rows.length,
      summary: talentSummary(rows),
      filters: { status, silver, search }
    });
  }

  function show({ params = {} } = {}) {
    const talent = database.findById('talents', params.id);
    if (!talent) return notFound('talent', params.id);
    return ok(toTalentView(talent, database));
  }

  function store({ body = {} } = {}) {
    try {
      const talent = createTalent({
        ...body,
        status: body.status || TalentStatus.ACTIVE
      });
      ensureValidTalentStatus(talent.status);
      database.insert('talents', talent);
      return created(toTalentView(talent, database));
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function update({ params = {}, body = {} } = {}) {
    const current = database.findById('talents', params.id);
    if (!current) return notFound('talent', params.id);

    if (body.status) {
      try {
        ensureValidTalentStatus(body.status);
      } catch (error) {
        return fail(error.message, 422);
      }
    }

    const next = database.update('talents', params.id, (talent) => patchTalent(talent, body));
    return ok(toTalentView(next, database));
  }

  function updateStatus({ params = {}, body = {} } = {}) {
    const current = database.findById('talents', params.id);
    if (!current) return notFound('talent', params.id);

    try {
      ensureValidTalentStatus(body.status);
    } catch (error) {
      return fail(error.message, 422);
    }

    const next = database.update('talents', params.id, (talent) => patchTalent(talent, {
      status: body.status,
      lastTouchpoint: body.note || talent.lastTouchpoint
    }));
    return ok(toTalentView(next, database));
  }

  function markSilverMedalist({ params = {}, body = {} } = {}) {
    const current = database.findById('talents', params.id);
    if (!current) return notFound('talent', params.id);
    const next = database.update('talents', params.id, (talent) => patchTalent(talent, {
      silverMedalist: true,
      status: body.keepStatus ? talent.status : TalentStatus.SILVER,
      notes: body.note ? `${talent.notes || ''}\n${body.note}`.trim() : talent.notes
    }));
    return ok(toTalentView(next, database));
  }

  function unmarkSilverMedalist({ params = {}, body = {} } = {}) {
    const current = database.findById('talents', params.id);
    if (!current) return notFound('talent', params.id);
    const next = database.update('talents', params.id, (talent) => patchTalent(talent, {
      silverMedalist: false,
      status: body.status || TalentStatus.ACTIVE
    }));
    return ok(toTalentView(next, database));
  }

  function addNote({ params = {}, body = {} } = {}) {
    const current = database.findById('talents', params.id);
    if (!current) return notFound('talent', params.id);
    if (!body.note) return fail('note is required', 422);

    const stamp = body.createdAt || nowIso();
    const nextNote = `[${stamp}] ${body.note}`;
    const next = database.update('talents', params.id, (talent) => patchTalent(talent, {
      notes: `${talent.notes || ''}\n${nextNote}`.trim(),
      lastTouchpoint: body.touchpoint || body.note
    }));
    return ok(toTalentView(next, database));
  }

  function logTouchpoint({ params = {}, body = {} } = {}) {
    const current = database.findById('talents', params.id);
    if (!current) return notFound('talent', params.id);
    if (!body.touchpoint) return fail('touchpoint is required', 422);

    const next = database.update('talents', params.id, (talent) => patchTalent(talent, {
      lastTouchpoint: body.touchpoint,
      status: body.status || TalentStatus.CONTACTED,
      notes: body.note ? `${talent.notes || ''}\n${body.note}`.trim() : talent.notes
    }));
    return ok(toTalentView(next, database));
  }

  function matchForPosition({ params = {}, query = {} } = {}) {
    const position = database.findById('positions', params.positionId);
    if (!position) return notFound('position', params.positionId);
    const minScore = Number(query.minScore || 0);
    const limit = Number(query.limit || 20);

    const rows = database
      .all('talents')
      .filter((talent) => talent.status !== TalentStatus.ARCHIVED)
      .map((talent) => {
        const positionText = [
          position.title,
          position.department,
          position.client,
          position.location,
          ...(position.requirements || []),
          ...(position.skills || [])
        ].join(' ').toLowerCase();
        const matchedSkills = (talent.skills || []).filter((skill) => positionText.includes(String(skill).toLowerCase()));
        const titleToken = String(talent.title || '').split(' ')[0].toLowerCase();
        const titleMatch = titleToken && positionText.includes(titleToken);
        const locationMatch = position.location && talent.location &&
          String(talent.location).toLowerCase().includes(String(position.location).toLowerCase().split(',')[0]);
        const score = Math.min(100, Math.round(Number(talent.matchScore || 0) * 0.65 + matchedSkills.length * 4 + (titleMatch ? 5 : 0) + (locationMatch ? 3 : 0) + (talent.silverMedalist ? 4 : 0)));
        return {
          talent: toTalentView(talent, database),
          score,
          matchedSkills,
          reasons: unique([
            matchedSkills.length ? `${matchedSkills.length} matching skills` : null,
            titleMatch ? 'title aligns with position' : null,
            locationMatch ? 'location alignment' : null,
            talent.silverMedalist ? 'silver medalist candidate' : null,
            talent.yearsExperience ? `${talent.yearsExperience} years experience` : null
          ])
        };
      })
      .filter((match) => match.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return ok(rows, { count: rows.length, positionId: position.id, minScore, limit });
  }

  function inviteToApply({ params = {}, body = {} } = {}) {
    const talent = database.findById('talents', params.id);
    if (!talent) return notFound('talent', params.id);
    const position = database.findById('positions', body.positionId);
    if (!position) return notFound('position', body.positionId);
    if (!OPEN_POSITION_STATUSES.has(position.status)) {
      return fail('talent can only be invited to published or screening positions', 409);
    }

    const next = database.update('talents', params.id, (row) => patchTalent(row, {
      status: TalentStatus.CONTACTED,
      lastTouchpoint: body.message || `Invited to apply for ${position.title}`
    }));

    const task = {
      id: body.taskId || `task-invite-${params.id}-${Date.now()}`,
      title: `Follow up with ${talent.name}`,
      description: body.message || `Talent invited to apply for ${position.title}`,
      priority: body.priority || 'medium',
      status: 'open',
      ownerId: body.ownerId || null,
      relatedType: 'talent',
      relatedId: talent.id,
      dueAt: body.followUpAt || null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    database.insert('tasks', task);

    return ok(toTalentView(next, database), { positionId: position.id, task });
  }

  function convertToApplicant({ params = {}, body = {} } = {}) {
    const talent = database.findById('talents', params.id);
    if (!talent) return notFound('talent', params.id);
    const position = database.findById('positions', body.positionId);
    if (!position) return notFound('position', body.positionId);
    if (!OPEN_POSITION_STATUSES.has(position.status)) {
      return fail('talent can only be converted for published or screening positions', 409);
    }

    try {
      const applicant = {
        ...createApplicant({
          id: body.applicantId,
          positionId: position.id,
          name: talent.name,
          email: talent.email,
          phone: talent.phone,
          status: body.status || ApplicantStatus.NEW,
          cvName: body.cvName || null,
          cvComplete: Boolean(body.cvName || body.cvComplete),
          coverLetterName: body.coverLetterName || null,
          appliedAt: body.appliedAt || nowIso()
        }),
        source: body.source || 'talent-pool',
        sourceTalentId: talent.id,
        notes: body.notes || talent.notes
      };
      database.insert('applicants', applicant);
      const next = database.update('talents', params.id, (row) => patchTalent(row, {
        status: TalentStatus.CONTACTED,
        lastTouchpoint: `Converted to applicant for ${position.title}`
      }));
      return created({ applicant, talent: toTalentView(next, database) });
    } catch (error) {
      return fail(error.message, 422);
    }
  }

  function archive({ params = {}, body = {} } = {}) {
    const current = database.findById('talents', params.id);
    if (!current) return notFound('talent', params.id);
    const next = database.update('talents', params.id, (talent) => patchTalent(talent, {
      status: TalentStatus.ARCHIVED,
      notes: body.reason ? `${talent.notes || ''}\nArchived: ${body.reason}`.trim() : talent.notes
    }));
    return ok(toTalentView(next, database));
  }

  function destroy({ params = {} } = {}) {
    const removed = database.remove('talents', params.id);
    if (!removed) return notFound('talent', params.id);
    return deleted(removed);
  }

  function summary() {
    const rows = database.all('talents');
    return ok(talentSummary(rows));
  }

  return {
    list,
    show,
    store,
    update,
    updateStatus,
    markSilverMedalist,
    unmarkSilverMedalist,
    addNote,
    logTouchpoint,
    matchForPosition,
    inviteToApply,
    convertToApplicant,
    archive,
    destroy,
    summary
  };
}

module.exports = {
  createTalentController,
  talentSummary,
  talentMatchesSearch
};
