# HEYA Backend Implementation

This folder is the backend implementation scaffold added to the existing HEYA Recruiting Dashboard.

## Current progress

### Completed: Step 1 - Models and production-safe seed structure

Implemented the raw backend structures for the first milestone:

- model factories for users, positions, applicants, screening criteria, screening scores, filtration runs, AI suggestions, screening reports, talents, files, tasks, activity logs, calendar events, offers, and user preferences
- enums that match the existing frontend statuses
- an empty production seed structure; live data should come from the app database

- an initial normalized database snapshot at `src/db/initial-database.example.json`

No controller or route behavior has been added yet. That starts in Step 2.

## Useful commands

```bash
cd backend
node src/models/index.js
node src/db/build-initial-database.js
```

## Next step

Step 2 should add the first controller and route layer for requisitions and positions.

## Step 3 added

Applicant controller and applicant routes are now implemented. This includes listing, creating, updating, deleting, status changes, common pipeline actions, resume metadata upload, and summary counts.

Run checks:

```bash
node src/check-controllers.js
node src/print-routes.js
```


## Step 4 Added

AI filtration controller and routes are now included.

```text
AIFiltrationController.listRuns
AIFiltrationController.showRun
AIFiltrationController.runForPosition
AIFiltrationController.rerunForPosition
AIFiltrationController.resultsForPosition
AIFiltrationController.shortlistTopMatches
AIFiltrationController.suggestions
AIFiltrationController.explainApplicant
AIFiltrationController.applySuggestion
AIFiltrationController.summary
```

Current route total after Step 4: `42`.

See `docs/STEP-4-AI-FILTRATION-CONTROLLERS.md`.

## Step 5 Added

Screening controller and routes are now included.

```text
ScreeningController.listCriteria
ScreeningController.showCriterion
ScreeningController.storeCriterion
ScreeningController.updateCriterion
ScreeningController.destroyCriterion
ScreeningController.listScores
ScreeningController.scoreApplicant
ScreeningController.bulkScoreApplicant
ScreeningController.startApplicantScreening
ScreeningController.applicantScreening
ScreeningController.generateReport
ScreeningController.listReports
ScreeningController.showReport
ScreeningController.finalizeApplicant
ScreeningController.summary
```

Current route total after Step 5: `57`.

See `docs/STEP-5-SCREENING-CONTROLLERS.md`.


## Step 6 Added

Step 6 adds Talent Pool controllers and routes.

New backend layer:

```text
src/controllers/talent.controller.js
src/routes/talent.routes.js
docs/STEP-6-TALENT-POOL-CONTROLLERS.md
```

Key APIs:

```text
GET    /api/talents
POST   /api/talents
GET    /api/talents/summary
GET    /api/talents/matches/:positionId
GET    /api/talents/:id
PATCH  /api/talents/:id
DELETE /api/talents/:id
PATCH  /api/talents/:id/status
POST   /api/talents/:id/silver-medalist
DELETE /api/talents/:id/silver-medalist
POST   /api/talents/:id/notes
POST   /api/talents/:id/touchpoints
POST   /api/talents/:id/invite
POST   /api/talents/:id/convert-to-applicant
POST   /api/talents/:id/archive
```

Verification now expects:

```text
HEYA Step 6 controller checks passed
routes: 72
```


## Step 7 complete

Support modules and the final integration layer have been added.

New support areas:

- health and database export
- dashboard summary
- tasks
- activity feed
- calendar events
- offers
- files
- users and preferences

Final verification:

```bash
npm run controllers:check
npm run routes:print
```

Expected final route count:

```text
routes: 105
```

## Runnable server added

The backend now includes a real runnable Node.js API server.

```bash
cd backend
npm start
```

Then open:

```text
http://localhost:4000/api/health
```

Run all checks:

```bash
npm run check
```

The server is implemented with Node's built-in `http` module, so it does not require Express installation. It mounts all 105 planned API routes.

See `docs/STEP-8-RUNNABLE-SERVER.md`.
