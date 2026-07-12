# Backend API Contracts and State Machine

Use a canonical `/api/v1/builder` surface. Legacy `/api/template-ai` endpoints may remain behind adapters during migration, but new frontend code must not orchestrate the lifecycle through them directly.

## 1. Standard envelopes

### Success

```json
{
  "data": {},
  "meta": {
    "requestId": "req_...",
    "timestamp": "..."
  }
}
```

### Asynchronous accepted

HTTP `202`:

```json
{
  "data": {
    "jobId": "job_...",
    "projectId": "project_...",
    "revisionId": "revision_...",
    "status": "QUEUED"
  },
  "meta": { "requestId": "req_..." }
}
```

### Error

```json
{
  "error": {
    "code": "BUILDER_PLAN_INCOMPLETE",
    "message": "Required project information is missing.",
    "details": { "missing": [] }
  },
  "requestId": "req_..."
}
```

Never leak stack traces, paths, secrets, or raw provider payloads.

## 2. Project endpoints

### Create

```http
POST /api/v1/builder/projects
```

```json
{
  "sourceType": "template",
  "templateId": "pulse-works",
  "name": "My Business Website"
}
```

Server authenticates, checks account/entitlement, validates source, pins template version/commit, creates project, sets status, and audits.

### List

```http
GET /api/v1/builder/projects?status=&cursor=&limit=
```

Only user-owned projects unless explicit admin scope.

### Get

```http
GET /api/v1/builder/projects/:projectId
```

Return normalized project, current plan/revision/job/deployment summaries. Do not return giant source blobs or secret values.

### Update plan

```http
PATCH /api/v1/builder/projects/:projectId/plan
```

```json
{
  "expectedVersion": 7,
  "plan": {
    "schemaVersion": 1,
    "brief": {},
    "sitemap": {},
    "wireframe": {},
    "style": {}
  }
}
```

Return new version/saved timestamp. Return `409 BUILDER_VERSION_CONFLICT` when stale.

## 3. Answer-sheet endpoints

```http
POST  /api/v1/builder/projects/:projectId/answer-sheet/build
PATCH /api/v1/builder/projects/:projectId/answer-sheet
POST  /api/v1/builder/projects/:projectId/answer-sheet/suggestions
```

Building/normalization can be synchronous when no AI is involved. AI suggestions remain authenticated, rate-limited, quota-controlled, field-key constrained, and audited.

## 4. Generation

### Start

```http
POST /api/v1/builder/projects/:projectId/generations
Idempotency-Key: <opaque key>
```

```json
{
  "baseRevisionId": null,
  "mode": "full",
  "changeRequest": null
}
```

Transaction:

- ownership/state validation
- plan/answer-sheet validation
- quota/concurrency check
- idempotency lookup
- revision placeholder
- durable job
- state transition
- audit
- `202`

Duplicate key returns original job/revision.

### Job status/events

```http
GET /api/v1/builder/jobs/:jobId
GET /api/v1/builder/jobs/:jobId/events
```

Return durable stage/progress/retry/error state. Existing SSE may be reused only if backed by durable events.

## 5. Revisions

```http
GET /api/v1/builder/projects/:projectId/revisions
GET /api/v1/builder/projects/:projectId/revisions/:revisionId
POST /api/v1/builder/projects/:projectId/revisions/:revisionId/change-request
POST /api/v1/builder/projects/:projectId/revisions/:revisionId/approve
```

Change requests create a new revision job; they do not mutate approved output. Approval requires `READY`, successful validation, ownership, and legal state.

## 6. Preview grants

```http
POST /api/v1/builder/projects/:projectId/revisions/:revisionId/preview-grants
```

Return an isolated expiring URL. Store only token hash. Never expose artifact filesystem paths.

## 7. Deployment request

```http
POST /api/v1/builder/projects/:projectId/deployments
Idempotency-Key: ...
```

```json
{
  "revisionId": "revision_...",
  "siteName": "My Business",
  "subdomain": "my-business",
  "billingTierId": "standard_200"
}
```

Server verifies approved revision/checksum, validates name/subdomain/tier, reserves idempotency, creates job/link, and returns `202`.

Normal users cannot choose arbitrary Render plan, repository destination, commands, region, runtime, or provider credentials.

## 8. Import endpoints

```http
POST /api/v1/builder/projects/:projectId/sources/github/validate
POST /api/v1/builder/projects/:projectId/sources/github/import
POST /api/v1/builder/uploads
POST /api/v1/builder/projects/:projectId/sources/zip/scan
```

Use a safe durable upload ID so validation and deploy do not require repeatedly uploading the archive.

## 9. Central authorization

Replace scattered access helpers with:

```text
assertCanReadProject
assertCanEditProject
assertCanGenerateProject
assertCanApproveRevision
assertCanDeployRevision
assertCanReadJob
assertAdmin
```

Check identity, account, ownership, entitlement, deletion, and state.

## 10. Validation

Use a consistent schema validator for IDs, enums, plan/answer-sheet, paths, template IDs, colors, URLs, branches, names/slugs, billing tiers, idempotency keys, change size, and pagination. Reject unknown security-sensitive fields.

## 11. State machine service

Controllers request transitions; they do not assign status directly. Every transition is validated and audited.

## 12. Idempotency

Scope keys by user + operation + project + key. Store request hash. Reuse with different body returns `409 IDEMPOTENCY_KEY_REUSED`.

Persist external provider attempt identity before side effects.

## 13. Legacy adapters

Legacy routes authenticate, resolve legacy ID to project, call canonical service, return compatibility response, and emit deprecation telemetry/headers. They must not keep a separate business implementation.

## 14. Feature flags

Server-enforced flags:

```text
SITE_BUILDER
AI_BUILDER
ZIP_HOSTING
GITHUB_HOSTING
BUILDER_PROJECT_FLOW
BUILDER_DB_STORAGE
BUILDER_ISOLATED_PREVIEW
BUILDER_DURABLE_JOBS
BUILDER_LEGACY_ROUTES
```

## 15. Contract tests

For every frontend helper test path, method, headers, body, success/error/async responses, and compatibility adapter where retained.

Add a regression test ensuring the frontend never expects `pages[].html` from an endpoint returning `resultZipBase64`.
