# Current File Patch Map

Confirm exact paths using repository search before editing. Names below are based on the audited repository.

## Frontend

### `BuilderRoxanne.jsx`

Problem: hard-coded generic content, first template only, selected pages ignored, misleading AI.

Action: remove from production routing or convert to a short canonical plan starter; delete hard-coded generation; add regression tests.

### `AiTemplateSetup.jsx`

Problem: independent lifecycle, divergent repo/HTML paths, read-only review, direct legacy API calls.

Action: reuse guided UI in canonical project plan/answer sheet; make review editable; remove broken HTML contract; stop transient-ID deployment navigation.

### `BuilderSitePlan` component

Problem: oversized component owns form, AI, autosave, wireframe, style, generation, navigation; three autosave requests; swallowed failures; no durable load route.

Action: split components/hooks; load/save one project; one versioned PATCH; canonical generation job; durable route; remove fake offline message.

### `BuilderEditor.jsx`

Problem: independent save/publish/deploy; direct HTML mutation; unsafe `srcDoc`; global custom event; legacy deployment creation.

Action: revision-aware canonical saving; isolated preview; AI edits create revisions; remove direct deploy/global event; retain useful editor UI.

### `BuilderImport.jsx`

Strength: good GitHub/ZIP separation and Hosting boundary.

Action: create project first; upload/scan job; persist result; safe presets; canonical deploy; resume after refresh; remove dead settings; server-authoritative plan/commands.

### `DeploymentSettings.jsx`

Problem: hidden state, fixed assumptions, transient site ID, indefinite overlay risk, direct legacy helper.

Action: canonical deployment handoff; customer-safe settings; `202` job; durable progress/retry; project-ID route.

### `src/api/template-ai.js`

Problem: legacy helpers, response mismatch, duplicate ZIP helper, frontend coupled to legacy routes.

Action: canonical builder API module; deprecate adapters; contract tests; remove `pages` expectation for ZIP response.

### `src/api/hosting-deploy.js`

Strength: source separation and error parsing.

Action: builder UI uses canonical project endpoints; Hosting UI retains provider helpers; remove old route fallback after cutover; stable domain mapping.

### `use-templates.js`

Problem: local/API split, name matching, silent production fallback.

Action: authoritative API, stable ID/version, local fallback only development/demo, clear failure.

### Router/app

Action: add project-ID deep links, legacy redirects, reload tests.

## Template AI Engine

### `legacyTemplateAiRoutes.adapter.js`

Action: auth/account/quota/rate middleware on all AI; canonical project services; deprecation telemetry; temporary compatibility only.

### User brief controller/routes

Problem: in-memory `Map`, unauthenticated suggestion, restart loss.

Action: project-backed intake, auth/quota/rate, remove authoritative in-memory sessions.

### AI refinement controller/routes

Problem: unauthenticated `/generate`, base64 ZIP contract, alternate path.

Action: disable/remove public legacy generate; use durable jobs/artifacts; return job/revision ID; retain safe template-copy service.

### `sitePlan.controller.js`

Action: Prisma repository, schema validation, optimistic concurrency, state machine, canonical service.

### `sitePlanStore.js`

Problem: file-backed and unsafe for scale/concurrency.

Action: Prisma adapter; read-only importer; stop production writes.

### `templateSiteStore.js`

Problem: file-backed direct write.

Action: map to revision; read-only importer; stop production writes.

### `sitePlanHandoff.controller.js`

Problem: duplicate site/deploy on repeated call, request-bound orchestration, no idempotency/transaction.

Action: approved revision + idempotency + durable deployment job + `202`; keep normalization in generation.

### Preview controller/routes

Problem: main-origin HTML and no grant.

Action: disable production main-origin preview; isolated service, signed grant, safe resolver, strict headers/tests.

## Hosting Deploy Engine

### Deployment routes

Keep middleware order and source separation. Add project/revision metadata, canonical job entry, idempotency, and durable links.

### `zipUpload.middleware.js`

Problem: memory storage, high default, extension-only validation.

Action: disk quarantine, magic bytes, limits/timeouts, cleanup, upload record.

### ZIP extractor/file rules

Keep current path and file protections. Add aggregate size, compression ratio, symlink/hardlink/device rejection, path depth/length, collisions, secret scan, safer extraction.

### GitHub/ZIP pipelines

Keep controlled source, free-plan enforcement, failed records, orphan cleanup. Add durable stages, provider idempotency, source limits/scans, safe dependencies, DB deployment repository, revision checksum, cleanup/recovery.

### `billingAttach.middleware.js`

Replace `setImmediate` with durable billing job and reconciliation.

### `deploymentPostDeployPoller.js`

Replace process-local loop/map with durable reconciliation jobs.

### hosting/deployment stores

Migrate to Prisma; keep import/backup adapter; deployment events as rows; stop production JSON writes.

## Server and infrastructure

### `server/src/index.js`

Mount canonical routes and isolated preview service; validate startup config; start/stop worker; add readiness; ensure secure middleware/error order.

### Prisma schema

Add builder models/relations/indexes/migrations/tests.

### CI workflow

Run migrations, all test suites, contracts, security, and build; document branch protection.

## Search commands

```bash
rg -n "BuilderRoxanne|BuilderSitePlan|AiTemplateSetup|BuilderEditor|BuilderImport|BuilderDeploymentSettings" src
rg -n "template-ai|plans/:planId|answer-sheet|handoff" src server
rg -n "sitePlanStore|templateSiteStore|hostingStore|render-hosting.json|plans.json|template-sites.json" server
rg -n "setImmediate|setTimeout|activePolls|new Map\\(" server/src
rg -n "srcDoc|preview" src server/src
rg -n "OPENAI_API_KEY|OpenAI" server/src
rg -n "multer.memoryStorage|AdmZip|extractZip" server/src
rg -n "createRenderDeployment|runGeneratedSiteToRender|createGithubHostingDeployment|createZipHostingDeployment" src server/src
rg -n "billingTierId|createDeploymentOrder|DeploymentSubscription|CheckoutOrder" server prisma
```
