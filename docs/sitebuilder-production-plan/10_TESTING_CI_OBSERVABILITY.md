# Testing, CI, and Observability

## 1. Testing strategy

### Unit tests

Cover state transitions, access/ownership, slug reservation, idempotency hashing, answer-sheet validation, plan normalization, template manifest validation, safe paths, ZIP aggregate limits, secret redaction, build preset selection, billable-state predicate, provider status mapping, retry classification, and job leases.

### Integration tests

Use a temporary Prisma database. Cover project create/load/update, optimistic concurrency, revision creation/approval, job claim, idempotent generation/deployment, preview grants, migration import, deployment/order/subscription transaction, and cross-user denial.

### API contract tests

For every frontend helper verify endpoint, method, headers, body, success, error, and async response. Add regressions for the legacy AI response mismatch, project deep-link refresh, provider-response independence, and error-code/request-ID preservation.

### End-to-end: template flow

```text
sign in
-> choose template
-> project created
-> refresh
-> plan restored
-> edit answer sheet
-> start generation
-> refresh during job
-> preview revision
-> request change
-> approve
-> deploy
-> Hosting detail
```

### End-to-end: GitHub flow

```text
create project
-> validate repository
-> scan/import
-> review detection
-> deploy
-> Hosting detail
```

### End-to-end: ZIP flow

```text
create project
-> upload safe ZIP
-> scan
-> review
-> deploy
```

Mock providers in CI. No test creates paid resources.

### Security/recovery/load

Implement all security cases from the security specification. Test restart during generation/provider acceptance/billing, stale leases, provider timeout, duplicate submission, concurrent autosaves, upload concurrency, pagination, and worker throughput.

## 2. CI workflow

Update GitHub Actions to run:

```yaml
- npm ci
- npx prisma generate
- npx prisma validate
- apply migrations to a temporary database
- server syntax check
- npm run lint        # when defined
- npm run typecheck   # when defined
- npm test
- npm run test:integration
- npm run test:contracts
- npm run test:security
- npm run build
```

Create scripts where absent. Do not silently skip missing suites. Require CI through branch protection.

## 3. Test fixtures

Create safe fixtures for valid Vite, HTML, and Node projects; missing config; env hints; traversal; zip-bomb simulation; too many files; symlink; secret-containing source; lifecycle scripts; unsupported framework. Never use real secrets.

## 4. Provider mocking

Mock OpenAI, GitHub, Render, and PayPal for success, timeout, rate limit, malformed response, partial success, duplicate event, unavailability, and eventual status changes.

## 5. Structured logs

Use:

```json
{
  "requestId": "...",
  "userId": "...",
  "projectId": "...",
  "revisionId": "...",
  "jobId": "...",
  "deploymentId": "...",
  "stage": "...",
  "status": "...",
  "durationMs": 0,
  "errorCode": null
}
```

Redact secrets/source content.

## 6. Metrics

### Product

Projects, template selection, plan completion, generation success/failure, preview/change/approval, deployment/live/failure, time to live.

### Security

AI limit/quota blocks, invalid preview grants, unsafe ZIP, secret findings, cross-user attempts, malicious URLs.

### Jobs

Depth, oldest age, running, retries, failures, duration, stale leases.

### Providers/billing/storage

OpenAI cost/error, GitHub/Render latency/error, PayPal failures, reconciliation divergence, artifact/temp bytes, cleanup backlog, DB busy/size.

## 7. Alerts

Alert on auth probes, AI spend spikes, generation failures, old queue jobs, stale jobs, billing/reconciliation backlog, cleanup failure, provider spikes, preview abuse, disk usage, database errors, and migration verification failure.

## 8. Audit events

Audit project lifecycle, template/version selection, answer-sheet approval, generation, revision approval, deployment, admin overrides, billing retry, preview grants, receipt review, and security overrides.

## 9. Health checks

```text
/healthz  process/database
/readyz   database/migrations/required config
worker health: last loop, active jobs, stale leases
```

Provider health is separate from basic process readiness where appropriate.

## 10. Release evidence

Retain commit SHA, migration version, CI run, staging smoke/security result, flag state, and rollback version.
