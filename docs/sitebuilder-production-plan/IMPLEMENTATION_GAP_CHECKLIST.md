# SiteBuilder Implementation Gap Checklist

Generated during continuation work on 2026-07-12.

## Baseline

- Branch: `main`
- HEAD: `4f90ab3 Harden VPS service access and tests`
- Worktree at inspection: dirty with existing uncommitted customer dashboard, ticketing, VPS, security, and admin oversight changes.
- Validation:
  - `npm test`: PASS, 57 tests.
  - `npm run build`: PASS, Vite chunk warnings only.
  - `DATABASE_URL=file:./prisma/dev.db npx prisma validate`: PASS.
  - `npx prisma generate`: BLOCKED locally by Windows file lock on `node_modules/.prisma/client/query_engine-windows.dll.node`.
  - `npm run test:integration`: MISSING SCRIPT.
  - `npm run test:contracts`: MISSING SCRIPT.
  - `npm run lint`: MISSING SCRIPT.
  - `npm run typecheck`: MISSING SCRIPT.

## Phase Status

| Phase | Status | Evidence / Gap |
| --- | --- | --- |
| 0 Repository baseline and safety controls | PARTIAL | Feature flags exist. Baseline recorded here. No clean implementation branch/commits yet because worktree already contains many unrelated uncommitted changes. |
| 1 Immediate P0 security hardening | PARTIAL | AI endpoints require auth/rate/concurrency and now record durable usage/quota checks. Preview grants exist for legacy preview. ZIP still uses memory `multer.memoryStorage`, so upload hardening remains incomplete. |
| 2 Prisma production domain | PARTIAL | Added builder project/revision/job/event/preview/deployment-link/AI-usage Prisma models plus SQLite bootstrapping. Migration/import utilities are not implemented. |
| 3 Canonical Builder API | PARTIAL | Added `/api/v1/builder` for project create/list/get, plan save, answer sheet, generation job reservation, job read, revisions, approval, preview grants, and deployment links. Worker-backed generation/deployment execution remains incomplete. |
| 4 Durable job worker | NOT STARTED | Builder jobs are persisted and idempotent, but no leasing worker executes them yet. |
| 5 Unified frontend project flow | NOT STARTED | New `src/api/builder-projects.js` exists, but frontend still primarily uses legacy `/template-ai` helpers. |
| 6 Safe generation and revision model | NOT STARTED | Revision placeholders exist. Artifact validation/checksum production is not wired to Template AI output. |
| 7 Isolated preview service | PARTIAL | Legacy preview grant route exists and canonical grants are persisted. True isolated preview origin/artifact resolver is not complete. |
| 8 Idempotent Hosting handoff and billing | PARTIAL | Canonical deployment links reserve idempotency and require approved checksum-bearing revisions. Handoff to Hosting Engine and billing jobs are not wired. |
| 9 Legacy migration and cutover | NOT STARTED | No JSON import/report/verify command yet. |
| 10 CI, observability, staging, launch | PARTIAL | Test suite exists and passes. Missing lint/typecheck/contracts scripts and CI hardening. |

## Acceptance Checklist Snapshot

### P0 Security

- AI endpoint authentication: COMPLETE. Covered by `builderAiSecurity.integration.test.js`.
- Suspended/disabled users blocked: PARTIAL. Auth middleware blocks account statuses for JWT users; service-specific deploy entitlement still needs canonical builder access service.
- Per-IP/per-user AI limits: COMPLETE for current in-process rate limits.
- AI daily/monthly quotas: PARTIAL. Durable request-count quotas added through `ai_usage_events`; token/cost quotas still require provider usage attachment.
- AI usage/cost recorded: PARTIAL. Usage rows are recorded with zero token/cost defaults unless provider adapters attach usage.
- Preview isolation: PARTIAL. Grants exist; true isolated origin service remains.
- ZIP/GitHub hostile-source protections: PARTIAL/BROKEN. ZIP signature check exists, but memory upload and full extraction hardening remain.
- Cross-user access denied: PARTIAL. Canonical builder project/job/revision reads are owner-scoped and tested.
- Logs/errors redact sensitive data: PARTIAL. New builder errors use safe envelopes; global coverage still needs audit.

### P0 Data Integrity

- Projects/revisions/jobs/preview grants/deployment links in Prisma: PARTIAL. Models and bootstrap exist; frontend/worker not fully moved.
- Production builder no longer depends on JSON: NOT STARTED. Legacy stores still active.
- Ownership migration: NOT STARTED.
- Optimistic concurrency: PARTIAL. Canonical plan PATCH requires `expectedVersion` and returns 409.
- Approved revisions immutable: PARTIAL. Approval only allows READY revisions; mutation protections around generated artifacts still need worker integration.
- Deployed checksum recorded: PARTIAL. Deployment requires checksum, but generation does not create it yet.

### P0 Idempotency and Recovery

- Generation/deployment idempotency keys: PARTIAL. Canonical reservation layer implemented and tested.
- Duplicate clicks do not duplicate jobs: PARTIAL. Generation reservation tested.
- Jobs survive restart: PARTIAL. Rows persist; worker/lease recovery not implemented.
- Provider partial success/reconciliation: NOT STARTED for builder.

### P0 Functional Correctness

- Fake AI removed: NOT STARTED. Legacy UI paths remain.
- Refresh restores project route: NOT STARTED in frontend.
- Answer-sheet real editing: PARTIAL. Canonical API supports PATCH; UI still legacy.
- Durable generation progress: PARTIAL. Job rows/progress JSON exist; worker stages not wired.
- Unapproved revisions cannot deploy: PARTIAL. Canonical deployment API enforces APPROVED + checksum.

## First Blocking Area

The first blocking production gap after the current slice is Phase 4: the durable builder worker. Canonical jobs are now persisted, but they do not execute Template AI generation, artifact validation, checksum creation, preview artifact storage, or Hosting handoff.
