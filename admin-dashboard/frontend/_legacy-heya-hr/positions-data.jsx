// Shared frontend constants for positions, applicants, and screening.
window.CHECKLIST_ITEMS = [
  { id: "clientConfirmed",      label: "Client confirmed" },
  { id: "titleConfirmed",       label: "Job title confirmed" },
  { id: "salaryConfirmed",      label: "Salary / budget confirmed" },
  { id: "locationConfirmed",    label: "Location confirmed" },
  { id: "descriptionDone",      label: "Job description completed" },
  { id: "requirementsDone",     label: "Requirements completed" },
  { id: "closingDateConfirmed", label: "Closing date confirmed" },
  { id: "approvalReceived",     label: "Approval received" },
];

window.BLANK_CHECKLIST = window.CHECKLIST_ITEMS.reduce((a, c) => (a[c.id] = false, a), {});
window.FULL_CHECKLIST  = window.CHECKLIST_ITEMS.reduce((a, c) => (a[c.id] = true, a), {});

// Suggested screening criteria the user can adopt as a starting point
window.DEFAULT_CRITERIA = [
  { id: "exp",      name: "Relevant work experience", description: "Years and depth of related work", maxPoints: 10, weight: 3, required: true,  notes: "" },
  { id: "qual",     name: "Required qualification",   description: "Degree, certifications, etc.",    maxPoints: 10, weight: 2, required: true,  notes: "" },
  { id: "industry", name: "Industry experience",      description: "Domain knowledge",                maxPoints: 10, weight: 2, required: false, notes: "" },
  { id: "resume",   name: "Resume completeness",      description: "Quality and clarity of resume",   maxPoints: 5,  weight: 1, required: false, notes: "" },
  { id: "comms",    name: "Communication skills",     description: "Written communication in materials", maxPoints: 10, weight: 2, required: false, notes: "" },
  { id: "location", name: "Location suitability",     description: "Aligns with role location",       maxPoints: 5,  weight: 1, required: false, notes: "" },
  { id: "avail",    name: "Availability",             description: "Start date / notice period",      maxPoints: 5,  weight: 1, required: false, notes: "" },
];

// Live dashboard data is loaded from the backend API. Keep these arrays empty so
// production never falls back to sample employers, vacancies, or applicants.
window.MOCK_POSITIONS = [];

window.MOCK_APPLICANTS = [];
window.STATUS_META = {
  draft:     { label: "Draft",     cls: "status-draft" },
  ready:     { label: "Ready",     cls: "status-ready" },
  published: { label: "Published", cls: "status-published" },
  closed:    { label: "Closed",    cls: "status-closed" },
  screening: { label: "Screening", cls: "status-screening" },
};

window.APPLICANT_STATUSES = [
  { id: "applied",     label: "Applied" },
  { id: "screening",   label: "Screening" },
  { id: "screened",    label: "Screened" },
  { id: "shortlist_eligible", label: "Shortlist Eligible" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "interview",   label: "Interview" },
  { id: "final_review", label: "Final Review" },
  { id: "offer",       label: "Offer" },
  { id: "hired",       label: "Hired" },
  { id: "not_shortlisted", label: "Not Shortlisted" },
  { id: "rejected",    label: "Rejected" },
  { id: "closed",      label: "Closed" }
];

window.SCREENING_STATUSES = [
  { id: "not-started",            label: "Screening not started", cls: "stage-new" },
  { id: "in-review",              label: "In review",             cls: "stage-interview" },
  { id: "screened",               label: "Screened",              cls: "stage-shortlisted" },
  { id: "recommended-shortlist",  label: "Recommended for shortlist", cls: "stage-hired" },
  { id: "needs-more-info",        label: "Needs more information", cls: "stage-rejected" },
];

// ----- Mock completeness scoring (frontend simulation) -----
window.applicantCompleteness = function(a, pos) {
  const coverRequired = !!(pos && pos.coverLetterRequired);
  const checks = [
    { id: "name",  label: "Name",         ok: !!(a.name  && String(a.name).trim()),  weight: 10, required: true },
    { id: "email", label: "Email",        ok: !!(a.email && String(a.email).trim()), weight: 20, required: true },
    { id: "cv",    label: "CV / Resume",  ok: !!a.cvName,                              weight: 30, required: true },
    { id: "cvFull",label: "Resume complete", ok: !!a.cvName && a.cvComplete !== false, weight: 20, required: false, isResumeQuality: true },
    { id: "cover", label: "Cover letter", ok: !!a.coverLetterName,                     weight: 20, required: coverRequired },
  ];
  let score = 0;
  let max = 0;
  const missingReq = [];
  const missingOpt = [];
  checks.forEach(c => {
    max += c.weight;
    if (c.ok) score += c.weight;
    else (c.required ? missingReq : missingOpt).push(c.label);
  });
  const pct = Math.round((score / max) * 100);
  // Tag the applicant
  let tag;
  if (missingReq.length > 0) tag = "missing-docs";
  else if (a.cvName && a.cvComplete === false) tag = "incomplete-resume";
  else if (missingOpt.length > 0) tag = "needs-review";
  else tag = "complete";
  return { score, max, pct, missingReq, missingOpt, checks, tag };
};

window.COMPLETENESS_TAGS = {
  "complete":          { label: "Complete",          cls: "tag-complete" },
  "needs-review":      { label: "Needs review",      cls: "tag-needs-review" },
  "incomplete-resume": { label: "Incomplete resume", cls: "tag-incomplete-resume" },
  "missing-docs":      { label: "Missing documents", cls: "tag-missing-docs" },
};
