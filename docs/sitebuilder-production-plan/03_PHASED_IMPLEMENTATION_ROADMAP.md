# Phased Implementation Roadmap

Each phase has required deliverables and exit criteria. Do not skip ahead while blocking failures remain.

## Phase 0 — Repository baseline and safety controls

### Goals

- Understand exact current code paths.
- Create a reproducible baseline.
- Prevent accidental release of half-migrated behavior.

### Tasks

1. Create the implementation branch.
2. Record the current commit SHA.
3. Run dependency installation, Prisma generation/validation, migrations in a temporary database, tests, server syntax checks, lint/typecheck if available, and frontend build.
4. Inventory every SiteBuilder route, feature flag, component, API helper, Template AI route, Hosting route, JSON store, in-process background task, generated preview route, upload handler, deployment call, and billing call.
5. Add temporary rollout flags:
   - `BUILDER_PROJECT_FLOW`
   - `BUILDER_DB_STORAGE`
   - `BUILDER_ISOLATED_PREVIEW`
   - `BUILDER_DURABLE_JOBS`
   - `BUILDER_LEGACY_ROUTES`
6. Add a migration/rollout log document inside the repository.
7. Ensure builder requests receive correlation IDs.

### Exit criteria

- Baseline results are documented.
- Existing failures are known.
- All builder entry points are mapped.
- New behavior can be enabled independently.
- No customer-facing behavior changed yet.

## Phase 1 — Immediate P0 security hardening

### AI protection

- Add authentication to all AI endpoints.
- Add account-status and service-access checks.
- Add per-user and per-IP rate limits.
- Add concurrent-generation limits.
- Add prompt/input length validation.
- Add daily/monthly usage counters and hard quotas.
- Add audit events for AI calls and failures.
- Remove provider/API-key details from customer error messages.

### Preview containment

- Disable unauthenticated main-origin generated previews.
- Introduce signed preview grants.
- Require ownership or a valid signed grant.
- Add isolated preview-origin configuration.
- Add strict headers.
- Ensure no dashboard cookie is scoped to the preview origin.
- Block preview operation when isolation is not configured in production.

### Upload/source protection

- Validate ZIP signature/magic bytes.
- Use disk-backed temporary uploads.
- Add total-uncompressed-size and compression-ratio limits.
- Reject symlinks, hardlinks, unsafe paths, and special files.
- Remove secrets and environment files.
- Add source URL allowlisting and SSRF protection.
- Centralize safe build-command policy.

### Abuse controls

- Add route-level timeouts.
- Add body/multipart limits.
- Add security telemetry for repeated failures.
- Keep production CORS explicit.

### Exit criteria

- No unauthenticated endpoint can spend OpenAI quota.
- Main-origin generated preview execution is disabled in production.
- ZIP bomb and traversal tests pass.
- Customer input cannot inject arbitrary shell commands.
- Security failures are structured and audited.

## Phase 2 — Prisma production domain

### Tasks

1. Add models from `05_DATABASE_SCHEMA_AND_DATA_MIGRATION.md`.
2. Add indexes and uniqueness constraints.
3. Add repositories for projects, revisions, jobs, preview grants, and deployment links.
4. Add JSON schema-version validation.
5. Add optimistic version checks.
6. Add central ownership/access service.
7. Add state-transition service.
8. Add migration command for plan, tailored-site, and hosting JSON records.
9. Add backup and checksum generation.
10. Add migration verification report.

### Exit criteria

- New project records create/load from Prisma.
- State transitions are enforced.
- Ownership is tested.
- Existing JSON records import without loss.
- Re-running migration is idempotent.
- Rollback is documented.

## Phase 3 — Canonical Builder API

Implement:

```text
POST   /api/v1/builder/projects
GET    /api/v1/builder/projects
GET    /api/v1/builder/projects/:projectId
PATCH  /api/v1/builder/projects/:projectId/plan
POST   /api/v1/builder/projects/:projectId/answer-sheet/build
PATCH  /api/v1/builder/projects/:projectId/answer-sheet
POST   /api/v1/builder/projects/:projectId/generations
GET    /api/v1/builder/jobs/:jobId
GET    /api/v1/builder/projects/:projectId/revisions
GET    /api/v1/builder/projects/:projectId/revisions/:revisionId
POST   /api/v1/builder/projects/:projectId/revisions/:revisionId/approve
POST   /api/v1/builder/projects/:projectId/revisions/:revisionId/change-request
POST   /api/v1/builder/projects/:projectId/revisions/:revisionId/preview-grants
POST   /api/v1/builder/projects/:projectId/deployments
```

Add stable response/error schemas, idempotency, pagination, contract tests, and legacy adapters. New frontend code must stop orchestrating through legacy Template AI endpoints.

### Exit criteria

- Every canonical endpoint has auth, validation, ownership, audit, tests, and a documented contract.
- Duplicate generation/deployment requests return the existing resource.

## Phase 4 — Durable job worker

### Tasks

1. Implement database job leasing.
2. Add worker startup and graceful shutdown.
3. Add job types:
   - `BUILDER_GENERATE_REVISION`
   - `BUILDER_IMPORT_GITHUB`
   - `BUILDER_SCAN_ZIP`
   - `BUILDER_DEPLOY_REVISION`
   - `DEPLOYMENT_RECONCILE`
   - `BILLING_ATTACH`
   - `BUILDER_CLEANUP`
4. Add stage checkpointing.
5. Add bounded retries with exponential backoff.
6. Add failed/dead-letter state.
7. Resume expired leases after restart.
8. Persist provider attempt identities.
9. Add SSE/polling from durable state.
10. Use real stages, not artificial timers.

### Exit criteria

- Killing/restarting the server does not lose queued work.
- The same job cannot run on two instances.
- Retry is safe.
- Billing and provider reconciliation resume after restart.

## Phase 5 — Unified frontend project flow

### Tasks

1. Add durable project routes.
2. Create a project shell loading by `projectId`.
3. Build/adapt template browser, plan editor, answer-sheet editor, generation progress, revision preview, change request, and deployment handoff.
4. Merge useful parts of `BuilderSitePlan`, `AiTemplateSetup`, and `BuilderEditor`.
5. Remove customer access to fake AI generation.
6. Make legacy editor internal-only or revision-aware.
7. Add truthful save states, retry, mobile, accessibility, unsaved-change guards, and a projects/resume list.

### Exit criteria

- Refresh restores state.
- Customer can leave/resume.
- One template generation lifecycle exists.
- Answer sheet is editable.
- Generation survives refresh.
- Fake AI copy is gone.

## Phase 6 — Safe generation and revision model

### Tasks

1. Snapshot template ID/version/commit.
2. Persist normalized plan and answer sheet.
3. Generate in a job-specific isolated workspace.
4. Apply only manifest-approved edits.
5. Validate output.
6. Run secret and unsafe-file scans.
7. Produce manifest/checksum.
8. Store immutable revision metadata.
9. Create a new revision for each change request.
10. Lock approved revisions.
11. Prevent deployment of failed/unapproved revisions.
12. Define artifact retention.

### Exit criteria

- Original templates stay untouched.
- Every artifact maps to project/revision.
- Unsafe output cannot reach preview/deployment.
- Customers can compare/revert revisions.

## Phase 7 — Isolated preview service

### Tasks

- Configure isolated preview origin.
- Generate expiring signed grants and store token hashes.
- Scope grants to project/revision.
- Add strict CSP/security headers.
- Remove dashboard cookies/API access.
- Prevent traversal/arbitrary file reads.
- Revoke and clean expired grants.
- Add device preview controls and security tests.

### Exit criteria

- Generated scripts never execute on dashboard origin.
- Preview URLs expire/revoke.
- Unauthorized users cannot enumerate/access previews.

## Phase 8 — Idempotent Hosting handoff and billing

### Tasks

- Create `BuilderDeploymentLink`.
- Require approved revision and idempotency key.
- Reuse active job/link.
- Pass canonical artifact metadata to Hosting.
- Preserve controlled-repository rules.
- Resolve name/slug collisions.
- Record exact checksum.
- Attach billing only after billable Render handoff.
- Use durable billing job and reconciliation.
- Keep failed deployment records and cleanup orphans.

### Exit criteria

- Duplicate clicks/retries cannot create duplicate billable services.
- Billing failures are recoverable.
- Relationships are queryable.
- Hosting status is accurate.

## Phase 9 — Legacy data migration and cutover

1. Back up persistent data.
2. Run migration report-only.
3. Correct ownership anomalies.
4. Run import.
5. Verify counts/checksums/links.
6. Enable database reads for canary.
7. Observe.
8. Disable legacy creation.
9. Stop JSON writes.
10. Keep read-only backup/adapters.
11. Remove legacy components/routes after observation window.

### Exit criteria

- No active customer record is missing.
- New writes are database-backed.
- Rollback is tested.

## Phase 10 — CI, observability, staging, and launch

- Update CI and test coverage.
- Add logs, metrics, dashboards, and alerts.
- Deploy staging.
- Run security/recovery tests.
- Run canary users.
- Test rollback.
- Gradually enable production flags.

### Exit criteria

- CI is required and green.
- Staging E2E passes.
- Restart/recovery and rollback pass.
- Security checklist passes.
