const { createControllers, createRoutes } = require('./index');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const controllers = createControllers();

const requisitions = controllers.requisitions.list();
const positions = controllers.positions.list();
const applicants = controllers.applicants.list();
const applicantSummary = controllers.applicants.summary();
const routeCount = createRoutes(controllers).length;

assert(requisitions.ok, 'requisition list should return ok');
assert(positions.ok, 'position list should return ok');
assert(applicants.ok, 'applicant list should return ok');
assert(applicants.data.length === 18, 'seed should contain 18 applicants');
assert(applicantSummary.data.total === 18, 'applicant summary total should be 18');
assert(routeCount === 117, `expected 117 routes, received ${routeCount}`);

const created = controllers.applicants.store({
  body: {
    name: 'Step Three Candidate',
    email: 'step.three@example.com',
    phone: '+1 555 0100',
    positionId: 'pos-1',
    cvName: 'step_three_candidate.pdf',
    cvComplete: true
  }
});
assert(created.ok && created.status === 201, 'applicant store should create a candidate');
assert(created.data.position.id === 'pos-1', 'created applicant should include position context');

const shortlisted = controllers.applicants.shortlist({ params: { id: created.data.id } });
assert(shortlisted.ok, 'shortlist should return ok');
assert(shortlisted.data.status === 'shortlisted', 'shortlist should update status');

const uploaded = controllers.applicants.uploadResume({
  params: { id: created.data.id },
  body: { fileName: 'step_three_candidate_v2.pdf', mimeType: 'application/pdf' }
});
assert(uploaded.ok, 'resume upload should return ok');
assert(uploaded.data.cvName === 'step_three_candidate_v2.pdf', 'resume upload should update cvName');

const aiRun = controllers.aiFiltration.runForPosition({ params: { positionId: 'pos-1' } });
assert(aiRun.ok && aiRun.status === 201, 'AI filtration should create a completed run');
assert(aiRun.data.status === 'completed', 'AI filtration run should complete');
assert(Array.isArray(aiRun.data.results), 'AI filtration run should contain results');
assert(aiRun.data.results.length >= 1, 'AI filtration should score at least one applicant');

const aiResults = controllers.aiFiltration.resultsForPosition({ params: { positionId: 'pos-1' } });
assert(aiResults.ok, 'AI filtration results should return ok');
assert(aiResults.data[0].score >= aiResults.data[aiResults.data.length - 1].score, 'AI results should be ranked by score');

const suggestions = controllers.aiFiltration.suggestions({ query: { positionId: 'pos-1' } });
assert(suggestions.ok, 'AI suggestions should return ok');
assert(suggestions.data.length === aiRun.data.results.length, 'suggestions should be created for each AI result');

const explanation = controllers.aiFiltration.explainApplicant({ params: { applicantId: aiRun.data.results[0].applicantId } });
assert(explanation.ok, 'AI applicant explanation should return ok');
assert(typeof explanation.data.reason === 'string' && explanation.data.reason.length > 0, 'AI explanation should include reason text');

const aiSummary = controllers.aiFiltration.summary({ query: { positionId: 'pos-1' } });
assert(aiSummary.ok, 'AI filtration summary should return ok');
assert(aiSummary.data.totalRuns >= 1, 'AI filtration summary should include run count');

const criteria = controllers.screening.listCriteria();
assert(criteria.ok, 'screening criteria should return ok');
assert(criteria.data.length === 7, 'seed should contain 7 screening criteria');

const newCriterion = controllers.screening.storeCriterion({
  body: {
    name: 'Portfolio quality',
    description: 'Depth and relevance of submitted work samples',
    weight: 2,
    positionId: 'pos-1'
  }
});
assert(newCriterion.ok && newCriterion.status === 201, 'screening criterion should be created');

const screeningStart = controllers.screening.startApplicantScreening({
  params: { applicantId: created.data.id },
  body: { notes: 'Begin structured screening.' }
});
assert(screeningStart.ok, 'screening start should return ok');
assert(screeningStart.data.status === 'in-review', 'screening start should move applicant screening to in-review');

const bulkScores = controllers.screening.bulkScoreApplicant({
  params: { applicantId: created.data.id },
  body: {
    scores: [
      { criterionId: criteria.data[0].id, score: 8, notes: 'Strong core experience.' },
      { criterionId: criteria.data[1].id, score: 7, notes: 'Solid technical fit.' },
      { criterionId: newCriterion.data.id, score: 9, notes: 'Excellent portfolio.' }
    ]
  }
});
assert(bulkScores.ok && bulkScores.status === 201, 'bulk screening scores should be created');
assert(bulkScores.data.length === 3, 'bulk scoring should insert 3 scores');

const report = controllers.screening.generateReport({ params: { applicantId: created.data.id } });
assert(report.ok && report.status === 201, 'screening report should be generated');
assert(report.data.overallScore > 0, 'screening report should include overall score');
assert(['recommended', 'needs-info', 'not-recommended'].includes(report.data.decision), 'screening report should include a valid decision');

const reports = controllers.screening.listReports({ query: { applicantId: created.data.id } });
assert(reports.ok && reports.data.length === 1, 'screening reports should list generated report');

const finalized = controllers.screening.finalizeApplicant({
  params: { applicantId: created.data.id },
  body: { status: 'recommended' }
});
assert(finalized.ok, 'finalize applicant screening should return ok');
assert(finalized.data.status === 'recommended', 'finalize should set screening status');

const screeningSummary = controllers.screening.summary();
assert(screeningSummary.ok, 'screening summary should return ok');
assert(screeningSummary.data.reports >= 1, 'screening summary should include generated report count');

const talents = controllers.talents.list();
assert(talents.ok, 'talent list should return ok');
assert(talents.data.length === 12, 'seed should contain 12 talents');

const talentSummary = controllers.talents.summary();
assert(talentSummary.ok, 'talent summary should return ok');
assert(talentSummary.data.total === 12, 'talent summary total should be 12');
assert(talentSummary.data.silverMedalists >= 1, 'talent summary should include silver medalists');

const createdTalent = controllers.talents.store({
  body: {
    name: 'Step Six Talent',
    title: 'Senior Recruiter',
    email: 'step.six.talent@example.com',
    location: 'Remote',
    yearsExperience: 8,
    matchScore: 86,
    skills: ['Sourcing', 'Screening', 'Stakeholder Management'],
    source: 'Manual import'
  }
});
assert(createdTalent.ok && createdTalent.status === 201, 'talent store should create a talent');

const silverTalent = controllers.talents.markSilverMedalist({
  params: { id: createdTalent.data.id },
  body: { note: 'Strong future fit.' }
});
assert(silverTalent.ok, 'mark silver medalist should return ok');
assert(silverTalent.data.silverMedalist === true, 'mark silver medalist should set silverMedalist true');

const touchpoint = controllers.talents.logTouchpoint({
  params: { id: createdTalent.data.id },
  body: { touchpoint: 'Recruiter call completed', note: 'Interested in future recruiter roles.' }
});
assert(touchpoint.ok, 'talent touchpoint should return ok');
assert(touchpoint.data.lastTouchpoint === 'Recruiter call completed', 'touchpoint should update last touchpoint');

const talentMatches = controllers.talents.matchForPosition({ params: { positionId: 'pos-1' }, query: { limit: 5 } });
assert(talentMatches.ok, 'talent position matches should return ok');
assert(talentMatches.data.length > 0, 'talent matches should return candidates');
assert(talentMatches.data[0].score >= talentMatches.data[talentMatches.data.length - 1].score, 'talent matches should be ranked');

const invitation = controllers.talents.inviteToApply({
  params: { id: createdTalent.data.id },
  body: { positionId: 'pos-1', message: 'Please consider this role.' }
});
assert(invitation.ok, 'talent invite should return ok');
assert(invitation.meta.task.relatedId === createdTalent.data.id, 'talent invite should create follow-up task');

const converted = controllers.talents.convertToApplicant({
  params: { id: createdTalent.data.id },
  body: { positionId: 'pos-1', cvName: 'step_six_talent.pdf' }
});
assert(converted.ok && converted.status === 201, 'convert talent to applicant should create applicant');
assert(converted.data.applicant.sourceTalentId === createdTalent.data.id, 'converted applicant should retain sourceTalentId');

const inboxMessage = controllers.messages.intake({
  body: {
    name: 'Step Eight Candidate',
    email: 'step.eight@example.com',
    phone: '+1 555 0188',
    isJobApplication: true,
    subject: 'Job Application / CV Submission',
    message: 'Please review my CV for current or future opportunities.',
    cvName: 'step_eight_candidate.pdf'
  }
});
assert(inboxMessage.ok && inboxMessage.status === 201, 'message intake should create an inbox message');
const inboxList = controllers.messages.list();
assert(inboxList.ok && inboxList.data.length >= 1, 'message list should include created inbox message');
const inboxSummary = controllers.messages.summary();
assert(inboxSummary.ok && inboxSummary.data.unread >= 1, 'message summary should count unread messages');
const inboxTalent = controllers.messages.addToTalentPool({
  params: { id: inboxMessage.data.id },
  body: { title: 'Recruitment Coordinator', location: 'Port Moresby', skills: ['Recruitment', 'Administration'] }
});
assert(inboxTalent.ok && inboxTalent.data.message.linkedTalentId, 'message should link to a talent pool record');
const inboxApplication = controllers.messages.attachToPosition({
  params: { id: inboxMessage.data.id },
  body: { positionId: 'pos-1' }
});
assert(inboxApplication.ok && inboxApplication.data.message.linkedApplicantId, 'message should attach to an open position as an applicant');

const health = controllers.support.health();
assert(health.ok && health.data.status === 'ok', 'health endpoint should return ok');
assert(health.data.collections.positions === 6, 'health should include collection counts');

const dashboardSummary = controllers.support.dashboardSummary();
assert(dashboardSummary.ok, 'dashboard summary should return ok');
assert(dashboardSummary.data.positions.total === 6, 'dashboard summary should include position count');
assert(dashboardSummary.data.tasks.open >= 1, 'dashboard summary should include open tasks');

const tasks = controllers.support.listTasks({ query: { done: false } });
assert(tasks.ok && tasks.data.length >= 1, 'open tasks should list seeded tasks');
const createdTask = controllers.support.storeTask({
  body: {
    title: 'Step Seven integration follow-up',
    role: 'recruiter',
    due: 'Tomorrow',
    priority: 'high'
  }
});
assert(createdTask.ok && createdTask.status === 201, 'support task should be created');
const completedTask = controllers.support.completeTask({ params: { id: createdTask.data.id } });
assert(completedTask.ok && completedTask.data.done === true, 'support task should be completed');
const reopenedTask = controllers.support.reopenTask({ params: { id: createdTask.data.id } });
assert(reopenedTask.ok && reopenedTask.data.done === false, 'support task should be reopened');

const activity = controllers.support.storeActivity({
  body: {
    who: 'AI Assistant',
    action: 'completed final support integration scan for',
    target: 'HEYA backend',
    time: 'now'
  }
});
assert(activity.ok && activity.status === 201, 'activity log should be created');
const activityList = controllers.support.listActivity({ query: { search: 'support integration' } });
assert(activityList.ok && activityList.data.length >= 1, 'activity search should find created log');

const calendarEvent = controllers.support.storeCalendarEvent({
  body: {
    day: 'Friday',
    start: 14,
    end: 15,
    title: 'Step Seven handoff review',
    who: 'Recruiting Ops',
    tone: 'green'
  }
});
assert(calendarEvent.ok && calendarEvent.status === 201, 'calendar event should be created');
const calendarUpdated = controllers.support.updateCalendarEvent({
  params: { id: calendarEvent.data.id },
  body: { title: 'Step Seven backend handoff review' }
});
assert(calendarUpdated.ok && calendarUpdated.data.title.includes('backend'), 'calendar event should be updated');

const offer = controllers.support.storeOffer({
  body: {
    name: 'Step Seven Candidate',
    role: 'Recruiting Operations Lead',
    amount: '$180,000',
    status: 'draft'
  }
});
assert(offer.ok && offer.status === 201, 'offer should be created');
const sentOffer = controllers.support.sendOffer({ params: { id: offer.data.id }, body: { expires: 'in 7 days' } });
assert(sentOffer.ok && sentOffer.data.status === 'sent', 'offer should be sent');
const acceptedOffer = controllers.support.acceptOffer({ params: { id: offer.data.id } });
assert(acceptedOffer.ok && acceptedOffer.data.status === 'accepted', 'offer should be accepted');

const file = controllers.support.storeFile({
  body: {
    entityType: 'applicant',
    entityId: created.data.id,
    fileName: 'step-seven-final-notes.pdf',
    mimeType: 'application/pdf',
    uploadedBy: 'user-1'
  }
});
assert(file.ok && file.status === 201, 'file record should be created');
const files = controllers.support.listFiles({ query: { entityType: 'applicant', entityId: created.data.id } });
assert(files.ok && files.data.length >= 1, 'file filter should return created file');

const user = controllers.support.storeUser({
  body: {
    name: 'Step Seven Admin',
    email: 'step.seven.admin@heya.local',
    role: 'Admin'
  }
});
assert(user.ok && user.status === 201, 'user should be created');
const updatedPreferences = controllers.support.updateUserPreferences({
  params: { id: user.data.id },
  body: { theme: 'dark', defaultView: 'dashboard' }
});
assert(updatedPreferences.ok && updatedPreferences.data.user.preferences.theme === 'dark', 'user preferences should be updated');

const exported = controllers.support.exportDatabase();
assert(exported.ok && exported.data.positions.length === 6, 'database export should include positions');
assert(exported.data.tasks.length >= 9, 'database export should include new task');

console.log('HEYA Step 7 controller checks passed');
console.log('requisitions:', requisitions.data.length);
console.log('positions:', positions.data.length);
console.log('applicants:', applicants.data.length);
console.log('applicant statuses:', applicantSummary.data.byStatus);
console.log('ai run results:', aiRun.data.results.length);
console.log('ai tags:', aiRun.data.countsByTag);
console.log('screening criteria:', criteria.data.length);
console.log('screening scores inserted:', bulkScores.data.length);
console.log('screening report decision:', report.data.decision);
console.log('screening summary:', screeningSummary.data);
console.log('talents:', talents.data.length);
console.log('talent summary:', talentSummary.data);
console.log('talent matches:', talentMatches.data.length);
console.log('converted applicant:', converted.data.applicant.id);
console.log('inbox messages:', inboxList.data.length);
console.log('support dashboard:', dashboardSummary.data);
console.log('created support task:', createdTask.data.id);
console.log('created support file:', file.data.id);
console.log('created support user:', user.data.id);
console.log('routes:', routeCount);
