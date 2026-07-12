# Frontend Flow Unification

## 1. Production entry page

Present two primary choices:

```text
Build from a template
Prepare an existing website
```

Secondary links may show saved projects, drafts, and recent deployments.

Do not expose separate customer choices for the legacy form builder, fake AI-first builder, hybrid planner as a separate product, or legacy HTML AI flow.

## 2. Durable routes

```text
/site-builder
/site-builder/new
/site-builder/projects/:projectId
/site-builder/projects/:projectId/template
/site-builder/projects/:projectId/plan
/site-builder/projects/:projectId/content
/site-builder/projects/:projectId/preview
/site-builder/projects/:projectId/deploy
```

The route parser recovers `projectId`. Every screen loads the project from the API. In-memory navigation parameters may be convenience state, never the only source.

## 3. Project shell

Create a shared shell for:

- project loading and ownership errors
- canonical status and active job
- save state
- step navigation
- resume behavior
- feature availability
- archive/delete
- mobile navigation

Do not duplicate domain state independently in each page.

## 4. Template selection

Use one authoritative API source. Display thumbnail, real preview, name, description, category, pages, sections, framework, version, and device preview.

On selection, create/update the durable project, pin template version/commit, and navigate by project ID.

Do not match API and local templates by name. Keep local fallback only in demo/development.

## 5. Plan editor

Unify useful parts of `BuilderSitePlan` and guided intake.

Recommended steps:

1. Business
2. Audience and offer
3. Brand
4. Pages and sections
5. Contact
6. SEO
7. Media/assets
8. Review

Allow manual completion and scoped AI suggestions.

### Save behavior

Use one debounced optimistic-concurrency PATCH.

Truthful states:

```text
Saving…
Saved at 2:14 PM
Save failed — Retry
Conflict detected — Reload or compare
```

Do not claim offline continuation without a real offline persistence/reconciliation design. Flush save or warn before navigation.

## 6. Answer-sheet review

Build a real editable form with:

- field groups
- required markers
- validation messages
- AI-generated badges
- original customer answer
- generated suggestion
- accept/reject per suggestion
- regenerate one field
- restore original
- page/section summary
- final validation summary

Saving updates canonical answer-sheet state.

## 7. Generation experience

1. Send idempotency key.
2. Receive job ID.
3. Navigate to progress view.
4. Rehydrate after refresh.
5. Read durable job stages.
6. Show retry only when server marks retryable.
7. Preserve inputs on failure.
8. Never require keeping the page open.

Real stages:

```text
Queued
Loading template
Normalizing content
Generating revision
Applying customer data
Scanning source
Validating build
Preparing preview
Ready
```

No artificial percentages/timers that imply backend progress.

## 8. Revision preview

Include:

- isolated iframe URL
- page navigation
- desktop/tablet/mobile controls
- revision number/history
- generation/validation summary
- request changes
- approve
- compare/revert
- preview grant renewal

Do not use `srcDoc` for untrusted generated HTML on dashboard origin.

## 9. Change requests

Allow scopes:

```text
Whole site
Selected page
Selected section
Brand only
Copy only
Images/assets
```

Every accepted request creates a new revision job. Keep history visible.

## 10. Deployment handoff

Normal fields:

- site name
- Glondia subdomain
- billing tier
- detected service type
- missing environment-variable names
- warnings
- confirmation

Expert settings, if required, must be constrained safe options behind an expansion.

Do not expose raw provider plan, destination repo, provider owner ID, arbitrary shell commands, or server filesystem roots.

After request, show durable deployment job and then Hosting detail. Never leave an indefinite overlay without retry/support.

## 11. Existing-site preparation

Retain GitHub/ZIP tabs, connected to a project.

### GitHub

- normalize URL
- validate access
- show repo/branch
- scan status
- detected project/env hints/risks
- safe preset

### ZIP

- upload once to safe storage
- show upload and scan progress
- detected framework/ignored files/env names/warnings/mode
- show temporary upload expiry

Client “handoff doctor” checks are convenience only; server validation is authoritative.

## 12. Legacy components

### `BuilderRoxanne`

Remove from production routes or convert into a short canonical project-plan starter. Delete hard-coded generation and ensure selected pages affect plan/generation.

### `BuilderEditor`

Retain useful page navigation/forms/revision editing, but load project/revision, save through canonical API, create revisions for AI edits, use isolated preview, and never deploy independently.

### `AiTemplateSetup`

Reuse guided-question UI inside canonical plan/answer-sheet flow. Remove independent lifecycle and direct legacy deployment navigation.

### `BuilderSitePlan`

Split the oversized component. Suggested structure:

```text
builder/project/
  ProjectShell
  ProjectStepNav
  useBuilderProject
  useProjectAutosave
builder/plan/
  BusinessStep
  AudienceStep
  BrandStep
  SitemapStep
  StyleStep
  ReviewStep
builder/answer-sheet/
  AnswerSheetEditor
  AiSuggestionControl
  ValidationSummary
builder/revisions/
  GenerationProgress
  RevisionPreview
  RevisionHistory
  ChangeRequestDialog
builder/deploy/
  DeploymentHandoff
  BillingTierSelector
  ReadinessSummary
```

## 13. Frontend data strategy

Server is source of truth. Cache project, revisions, jobs, and templates; invalidate after mutations. Avoid copying the same state through route components. Follow existing query/state libraries when present; do not add a large dependency without need.

## 14. Error behavior

Map stable codes:

```text
BUILDER_VERSION_CONFLICT
BUILDER_PLAN_INCOMPLETE
BUILDER_AI_QUOTA_EXCEEDED
BUILDER_JOB_ALREADY_RUNNING
BUILDER_REVISION_NOT_READY
BUILDER_PREVIEW_UNAVAILABLE
BUILDER_DEPLOYMENT_ALREADY_EXISTS
SOURCE_SECRET_DETECTED
ZIP_LIMIT_EXCEEDED
```

Unknown failures display request ID for support.

## 15. Accessibility and mobile

Require keyboard navigation, visible focus, semantic labels, associated errors, screen-reader progress, non-color-only status, reduced motion, responsive steps, usable preview controls, clear disabled reasons, and accessible dialogs.

## 16. Analytics

Record flow events without prompts, secrets, or complete business data:

```text
builder_project_created
template_selected
plan_started
plan_completed
answer_sheet_reviewed
generation_started
generation_failed
preview_opened
change_requested
revision_approved
deployment_started
deployment_failed
deployment_live
```
