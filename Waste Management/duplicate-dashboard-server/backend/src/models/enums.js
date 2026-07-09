const PositionStatus = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  PUBLISHED: 'published',
  SCREENING: 'screening',
  CLOSED: 'closed',
  ARCHIVED: 'archived'
});

const ApplicantStatus = Object.freeze({
  NEW: 'new',
  REVIEW: 'review',
  INTERVIEW: 'interview',
  OFFER: 'offer',
  HIRED: 'hired',
  REJECTED: 'rejected',
  SHORTLISTED: 'shortlisted'
});

const ScreeningStatus = Object.freeze({
  NOT_STARTED: 'not-started',
  IN_REVIEW: 'in-review',
  SCREENED: 'screened',
  RECOMMENDED: 'recommended',
  NEEDS_INFO: 'needs-info'
});

const TalentStatus = Object.freeze({
  OPEN_TO_WORK: 'open-to-work',
  PASSIVE: 'passive',
  ACTIVE: 'active',
  NURTURE: 'nurture',
  SILVER: 'silver',
  CONTACTED: 'contacted',
  ARCHIVED: 'archived'
});

const TaskPriority = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

module.exports = {
  PositionStatus,
  ApplicantStatus,
  ScreeningStatus,
  TalentStatus,
  TaskPriority
};
