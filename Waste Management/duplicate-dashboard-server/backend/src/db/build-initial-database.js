const seed = require('./seed-data');
const {
  createPositionDraft,
  createApplicant,
  createTalent,
  createScreeningCriterion,
  createTask,
  createActivityLog,
  createCalendarEvent,
  createOffer,
  createUser
} = require('../models');

function buildInitialDatabase() {
  const users = (seed.HEYA_DATA.team || []).map((member, index) => createUser({
    id: member.id || `user-${index + 1}`,
    name: member.name,
    email: member.email || `${String(member.name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '.')}@heya.local`,
    role: member.role || 'recruiter',
    status: 'active'
  }));

  const positions = seed.POSITIONS.map((position) => createPositionDraft(position));
  const applicants = seed.APPLICANTS.map((applicant) => createApplicant(applicant));
  const talents = seed.TALENTS.map((talent) => createTalent(talent));
  const screeningCriteria = seed.DEFAULT_CRITERIA.map((criterion) => createScreeningCriterion({
    ...criterion,
    isDefault: true,
    isActive: true
  }));
  const tasks = (seed.HEYA_DATA.tasks || []).map((task) => createTask(task));
  const activityLogs = (seed.HEYA_DATA.activity || []).map((activity, index) => createActivityLog({
    id: `activity-${index + 1}`,
    ...activity
  }));
  const calendarEvents = (seed.HEYA_DATA.calendar || []).map((event, index) => createCalendarEvent({
    id: `event-${index + 1}`,
    ...event
  }));
  const offers = (seed.HEYA_DATA.offers || []).map((offer, index) => createOffer({
    id: offer.id || `offer-${index + 1}`,
    ...offer
  }));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'empty production seed',
      step: 'clean-render-ready-data'
    },
    users,
    positions,
    applicants,
    screeningCriteria,
    screeningScores: [],
    filtrationRuns: [],
    aiSuggestions: [],
    screeningReports: [],
    talents,
    messages: [],
    files: [],
    tasks,
    activityLogs,
    calendarEvents,
    offers,
    userPreferences: users.map((user) => ({ id: `pref-${user.id}`, userId: user.id, values: user.preferences || {} }))
  };
}

if (require.main === module) {
  console.log(JSON.stringify(buildInitialDatabase(), null, 2));
}

module.exports = {
  buildInitialDatabase
};
