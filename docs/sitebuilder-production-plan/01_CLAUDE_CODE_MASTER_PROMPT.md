# Claude Code Master Implementation Prompt

You are the senior engineer responsible for taking the SiteBuilder in `pistion/NewSimpleProject` from its current mixed implementation to a secure, smooth, production-ready system.

The audited baseline is commit:

```text
4f90ab3965e04db716f31a629c95ed9521a895f4
```

If the repository has moved beyond this commit, inspect the changes first and adapt this plan without losing its security and architectural requirements.

## Mission

Implement the full production correction described in every Markdown file in this pack. Do not merely produce another proposal. Inspect, edit, migrate, test, and document the repository.

The existing system has good foundations:

- A seven-stage Template AI Engine
- A separated Hosting Deploy Engine
- Controlled GitHub source publication
- Render free-plan enforcement
- Failed-deployment visibility
- Answer-sheet validation
- Ownership checks
- Deployment billing and cleanup concepts

Preserve and strengthen those foundations.

The current weaknesses must be removed:

- Multiple competing frontend builder flows
- Fake or hard-coded “AI-first” generation
- A broken legacy HTML AI response contract
- In-memory navigation state that is lost on refresh
- File-backed plans, tailored sites, deployments, sessions, and logs
- In-memory AI intake sessions
- Unauthenticated or insufficiently protected AI endpoints
- Generated previews served on the dashboard origin
- Non-idempotent generation and deployment operations
- Non-durable `setImmediate` billing and in-process provider polling
- ZIP and imported-code attack surfaces
- Silent errors and misleading success states
- Incomplete CI and contract testing

## Mandatory execution rules

1. **Inspect before editing**
   - Read the repository tree.
   - Locate every SiteBuilder route, page, API helper, server route, store, pipeline, test, Prisma model, feature flag, and deployment call.
   - Build a call graph before changing contracts.
   - Search for every legacy endpoint and response shape.

2. **Create a safe working branch**
   - Use a branch such as `sitebuilder/production-hardening`.
   - Do not commit directly to the default branch.

3. **Establish a baseline**
   - Install dependencies using the repository lockfile.
   - Run the current build, Prisma validation, syntax checks, lint if available, and all current tests.
   - Record existing failures separately from failures introduced by this work.

4. **Do not rewrite the entire application**
   - Preserve working modules.
   - Refactor around one `BuilderProject` lifecycle.
   - Do not introduce a parallel ORM, auth system, router, deployment engine, or template engine.

5. **Use the existing Prisma database**
   - Add production models through migrations.
   - Remove production reliance on shared JSON files.
   - Use compatibility adapters during migration.

6. **Implement in phases**
   - Follow `03_PHASED_IMPLEMENTATION_ROADMAP.md`.
   - Complete and test each phase before beginning the next.
   - Make small, clearly named commits.

7. **No fake success**
   - Never display success before the backend confirms the relevant state.
   - Never fall back to original HTML while claiming that AI edited it.
   - Never label a deployment “live” merely because a provider request was accepted.
   - Never start billing unless the provider handoff reached the defined billable state.

8. **Security must fail closed**
   - Missing ownership, authentication, preview token, source validation, or required configuration must block the operation with a structured error.
   - Do not expose API keys, tokens, raw environment values, private file paths, or provider responses to customers.

9. **Durable background work**
   - Generation, deployment, billing attachment, provider reconciliation, and cleanup must survive application restarts.
   - In-process loops may wake workers, but database job records must be authoritative.

10. **Backward compatibility is temporary**
    - Keep old routes only through explicit adapters.
    - Add telemetry for legacy use.
    - Remove or disable legacy customer-facing flows after successful cutover.

11. **Testing is part of implementation**
    - Add unit, integration, contract, end-to-end, security, and recovery tests.
    - Update CI so tests are required.
    - Do not mark the work complete with only a successful frontend build.

12. **Do not leave placeholder TODOs**
    - A deferred non-critical enhancement must be documented in the final report.
    - Security, ownership, data integrity, idempotency, and recovery cannot be deferred.

## Target architecture

Introduce one authoritative project lifecycle:

```text
BuilderProject
  ├── selected template/source
  ├── plan and answer sheet
  ├── immutable revisions
  ├── generation jobs
  ├── isolated previews
  ├── approval state
  └── deployment link
```

Responsibility boundary:

```text
Frontend
  -> Builder API
      -> Template AI Engine
      -> Builder database state
      -> Hosting Deploy Engine
          -> controlled GitHub source
          -> Render
          -> billing/subscription
          -> Hosting dashboard
```

SiteBuilder owns preparation and revisions. Hosting owns live infrastructure, logs, environment variables, domains, billing status, restart, redeploy, suspension, and deletion.

## Canonical customer entry points

Expose only:

1. **Build from template**
2. **Prepare existing website**

The following must not remain separate production systems:

- Hard-coded `BuilderRoxanne` generation
- Legacy form-builder publishing
- Legacy HTML ZIP AI generation
- Alternate planner flows that create unrelated records

Reuse useful UI pieces only after connecting them to the canonical project lifecycle.

## Required state machine

Implement an explicit, validated state machine:

```text
DRAFT
TEMPLATE_SELECTED
PLANNING
PLAN_READY
ANSWER_SHEET_REVIEW
GENERATION_QUEUED
GENERATING
PREVIEW_READY
REVISION_REQUESTED
APPROVED
DEPLOYMENT_QUEUED
BUILDING
LIVE
```

Failure and operational states:

```text
PLAN_FAILED
GENERATION_FAILED
PREVIEW_FAILED
DEPLOYMENT_FAILED
BILLING_SETUP_FAILED
SUSPENDED
ARCHIVED
```

Do not allow arbitrary status strings from controllers. Centralize legal transitions and test them.

## Required security corrections

Implement every requirement in `04_SECURITY_AND_MALWARE_HARDENING.md`, including:

- Authentication and account checks for all AI endpoints
- Per-user and per-IP rate limits
- AI token/cost quotas
- Isolated preview origin with signed expiring access
- Strict preview CSP and no dashboard cookies
- ZIP magic-byte validation
- Streamed temporary uploads instead of large in-memory buffers
- Total uncompressed-size and compression-ratio limits
- Symlink, path traversal, hardlink, path-depth, and file-count protections
- Secret scanning and environment-file removal
- Restricted build commands
- No untrusted shell scripts
- Controlled dependency-install policy
- GitHub URL allowlisting and SSRF protection
- Provider token redaction
- Audit logs and security telemetry
- Safe cleanup of temporary files and repositories
- Prompt and output validation for AI generation
- No execution of customer source inside the main application process

## Required persistence corrections

Implement the models and migration in `05_DATABASE_SCHEMA_AND_DATA_MIGRATION.md`.

At minimum, production state must move into Prisma for:

- Builder projects
- Builder revisions
- Answer sheets
- Generated-site metadata
- Jobs
- Preview grants
- Project/deployment links
- Deployment records and events where still file-backed
- Idempotency records or unique job keys

Migration must be safe and reversible:

1. Back up JSON stores.
2. Add database tables.
3. Add repository/service adapters.
4. Import existing records with checksums.
5. Temporarily dual-read or dual-write where needed.
6. Verify counts and ownership.
7. Switch reads to the database.
8. Stop JSON writes.
9. Keep read-only backup files for rollback.
10. Remove compatibility code only after the observation period.

## Required API design

Implement the contracts in `06_BACKEND_API_CONTRACTS_AND_STATE_MACHINE.md`.

Key principles:

- Durable IDs in URLs
- `202 Accepted` for asynchronous work
- Structured error envelopes
- Idempotency keys for generation and deployment
- Optimistic concurrency for plan updates
- Ownership checks in one service
- Consistent API versioning
- No frontend dependency on provider-specific response shapes
- Contract tests for every frontend API helper

## Required frontend correction

Implement `07_FRONTEND_FLOW_UNIFICATION.md`.

Canonical routes must use durable project IDs:

```text
/site-builder/projects/:projectId/template
/site-builder/projects/:projectId/plan
/site-builder/projects/:projectId/content
/site-builder/projects/:projectId/preview
/site-builder/projects/:projectId/deploy
```

Refreshing or copying a URL must restore the project from the backend.

The answer-sheet review must be a real editable form. Autosave must show truthful server state. Generation must be resumable. Preview must support revisions. Mobile and accessibility must be tested.

## Required durable job processing

Implement `08_DURABLE_JOBS_GENERATION_AND_DEPLOYMENT.md`.

Use a database-backed job table and worker lease pattern. A single-process worker is acceptable initially, provided that jobs are durable, leases expire, abandoned jobs recover, stages are checkpointed, retries are bounded, operations are idempotent, startup resumes due jobs, and multiple future instances cannot process the same job simultaneously.

## Required deployment and billing behavior

Implement `09_HOSTING_BILLING_AND_PROVIDER_INTEGRATION.md`.

Preserve controlled repository publication, free initial Render plan for normal users, provider-status polling, failed records, orphan repository cleanup, and the trial/payment lifecycle.

Strengthen project/revision/deployment/order/subscription relationships, provider idempotency, billing recovery, restart-safe reconciliation, collision handling, cleanup, and truthful state.

## Required CI and test coverage

Implement `10_TESTING_CI_OBSERVABILITY.md`.

The GitHub workflow must run, at minimum:

```text
npm ci
prisma generate
prisma validate
migration validation
server syntax check
lint/typecheck when available
unit tests
integration tests
API contract tests
frontend build
targeted security tests
```

Add end-to-end coverage for the two canonical customer flows.

## Required rollout

Follow `11_ROLLOUT_MIGRATION_AND_ROLLBACK.md`.

Use feature flags and a staged cutover. Do not delete legacy data or routes before successful migration verification, staging tests, canary use, and rollback testing.

## Current-file guidance

Use `12_CURRENT_FILE_PATCH_MAP.md` as a search and patch guide. Confirm every path before editing.

## Definition of done

The work is complete only when every blocking item in `13_ACCEPTANCE_AND_DEFINITION_OF_DONE.md` passes.

## Commit discipline

Use commits similar to:

```text
chore(builder): add baseline tests and feature flags
fix(security): authenticate and rate-limit AI routes
feat(builder-db): add project revision and job models
refactor(builder): move plan storage to Prisma repositories
feat(builder-api): add canonical project and revision endpoints
refactor(builder-ui): unify template planning flow
fix(preview): isolate generated previews behind signed grants
feat(jobs): add durable generation and deployment workers
fix(deploy): add idempotent project handoff
test(builder): add contracts e2e and security coverage
chore(builder): migrate legacy records and remove production fallback
```

Do not combine the entire implementation into one unreviewable commit.

## Final response required from Claude Code

When implementation is finished, produce the report described in `14_FINAL_IMPLEMENTATION_REPORT_TEMPLATE.md`, including exact migrations, changed routes, security protections, tests, remaining risks, feature flags, rollout instructions, and rollback instructions.
