# Current State and Target Architecture

## 1. Current-state summary

The repository contains strong engines but an inconsistent customer-facing orchestration layer.

### Existing frontend flows

#### A. Template AI intake

```text
Template selection
-> guided RoxanneAI questions
-> answer-sheet generation
-> review
-> handoff
```

This is the closest existing path to the target workflow.

#### B. Hybrid Site Plan Builder

```text
Template selection
-> brief
-> sitemap
-> wireframe
-> style
-> review
-> handoff
```

This is richer, but it duplicates intake and orchestration responsibilities.

#### C. AI-first builder

The current `BuilderRoxanne` path is not a genuine AI generation pipeline. It selects the first template, inserts generic hard-coded content, and does not build the selected page list. It must not remain a separate production builder.

#### D. Legacy editor and publish flow

The legacy editor has its own site creation, autosave, preview, publish, and deployment behavior. Useful editor UI may be retained, but it must use the same `BuilderProject` and `BuilderRevision` records.

#### E. Existing-site import

The GitHub and ZIP path is conceptually correct:

```text
Source
-> validate
-> detect
-> prepare
-> controlled GitHub source
-> Render
-> Hosting
```

It should remain a separate entry path while sharing project, job, security, status, and deployment-link infrastructure.

## 2. Confirmed current problems

### State and routing

- Template, plan, and site IDs are often passed as in-memory navigation parameters.
- Refreshing or copying a URL can lose the selected template or generated site.
- Different pages create different record types for similar customer actions.

### Persistence

- Site plans are stored in JSON.
- Tailored sites are stored in JSON.
- Hosting deployments, logs, sessions, and some billing state are file-backed.
- AI intake sessions are stored in an in-memory `Map`.
- In-process locks only protect one Node process.
- Background polling and billing attachment are not restart-safe.

### Security

- Some AI endpoints are feature-gated without authentication.
- Generated previews can execute customer/template HTML on the main application origin.
- ZIP uploads use memory storage and need stronger archive-bomb protection.
- Generated or imported code may trigger unsafe dependency/build behavior if commands are not strictly controlled.
- Token cost, request rate, and concurrency protections are incomplete.

### Functional correctness

- The legacy HTML AI frontend expects edited pages, while the backend returns a base64 ZIP.
- The frontend silently falls back to original HTML.
- The AI-first builder is hard-coded.
- The answer-sheet “edit” screen is largely read-only.
- Some advanced settings state is unreachable or hidden.
- Save failures are swallowed or presented as “offline” without real offline persistence.
- Generation and deployment are not fully idempotent.

### Operations and testing

- CI performs build and syntax checks but does not enforce the full test suite.
- Provider polling stops on process restart.
- Background billing can be lost on restart.
- There is no single database relationship joining project, revision, deployment, order, and subscription.

## 3. Target responsibility boundaries

### Builder frontend

Responsible for project creation/resume, template/source selection, plan and answer-sheet editing, revision requests, preview controls, approval, and handoff request.

Not responsible for provider-specific deployment orchestration, live infrastructure management, direct billing mutation, or provider token management.

### Builder API/domain

Responsible for ownership/access, project lifecycle, revision persistence, validation, job creation, idempotency, Template AI orchestration, preview grants, and handoff to Hosting Engine.

### Template AI Engine

Responsible for template metadata/source, brief refinement, answer-sheet completion, template copy/data application, generation of revision artifacts, and validation of generated output.

Not responsible for customer billing, live infrastructure controls, browser routing state, or provider subscriptions.

### Hosting Deploy Engine

Responsible for source preparation for deployment, controlled repository publication, Render service/deploy creation, provider reconciliation, deployment logs/state, billing attachment trigger, trial lifecycle, suspension, cleanup, redeploy, and deletion.

### Worker

Responsible for generation jobs, import/source scans, deployment jobs, provider reconciliation, billing attachment, cleanup, and retention.

## 4. Canonical domain model

```text
User
  -> ClientProject
      -> BuilderProject
          -> BuilderRevision[]
          -> BuilderJob[]
          -> BuilderPreviewGrant[]
          -> BuilderDeploymentLink
              -> Deployment
                  -> CheckoutOrder
                  -> DeploymentSubscription
```

`BuilderProject` is the durable identity shown in routes.

`BuilderRevision` is immutable after creation. Edits create a new revision or update a draft revision with optimistic versioning. An approved revision is locked.

`Deployment` must identify the exact approved revision deployed.

## 5. Canonical flow: build from template

```text
1. Customer chooses template.
2. API creates BuilderProject in TEMPLATE_SELECTED.
3. Customer edits project plan.
4. API saves with optimistic version.
5. Customer builds/reviews answer sheet.
6. Customer starts generation with idempotency key.
7. API creates GenerationJob and returns 202.
8. Worker generates BuilderRevision.
9. Security validation completes.
10. Isolated preview grant is issued.
11. Customer requests changes or approves revision.
12. Customer starts deployment with idempotency key.
13. API creates DeploymentJob and returns 202.
14. Hosting Engine publishes controlled source and creates Render deploy.
15. Billing job attaches only after billable provider handoff.
16. Hosting dashboard owns live operations.
```

## 6. Canonical flow: prepare existing website

```text
1. Customer creates BuilderProject with sourceType GITHUB or ZIP.
2. Source is validated and scanned.
3. Worker imports/extracts into an isolated temporary workspace.
4. Framework, build mode, env hints, and risks are detected.
5. Customer reviews safe suggested settings.
6. Customer starts deployment.
7. Hosting Engine publishes controlled source.
8. Render deployment and billing lifecycle proceed normally.
```

## 7. Required state transition policy

Use one central transition service.

```text
DRAFT -> TEMPLATE_SELECTED
TEMPLATE_SELECTED -> PLANNING
PLANNING -> PLAN_READY
PLAN_READY -> ANSWER_SHEET_REVIEW
ANSWER_SHEET_REVIEW -> GENERATION_QUEUED
GENERATION_QUEUED -> GENERATING
GENERATING -> PREVIEW_READY | GENERATION_FAILED
PREVIEW_READY -> REVISION_REQUESTED | APPROVED
REVISION_REQUESTED -> GENERATION_QUEUED
APPROVED -> DEPLOYMENT_QUEUED
DEPLOYMENT_QUEUED -> BUILDING | DEPLOYMENT_FAILED
BUILDING -> LIVE | DEPLOYMENT_FAILED
LIVE -> SUSPENDED | ARCHIVED
```

Reject invalid transitions with structured errors and request IDs.

## 8. Target URL model

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

A refresh must load all required state using `projectId`.

## 9. Target API independence

Frontend code must not depend directly on OpenAI, Render, GitHub, filesystem, or local JSON-store response shapes. The backend returns stable Glondia domain contracts.

## 10. Legacy cutover policy

Mark legacy paths as one of:

```text
REUSED
ADAPTED
INTERNAL_ONLY
DEPRECATED
REMOVED
```

Do not leave ambiguous duplicate production routes. Add telemetry to every deprecated route so actual usage is known before removal.
