# Durable Jobs: Generation, Deployment, Billing, and Reconciliation

## 1. Why change is required

`setImmediate`, detached promises, and in-memory polling disappear on process restart and race under multiple instances. Database job records must be authoritative.

## 2. Initial architecture

A database-backed worker in the same codebase is acceptable initially:

```text
Job API/service
Job repository
Worker loop
Job handlers
Lease/retry service
Job event writer
Startup recovery
Graceful shutdown
```

Later the API and worker may be separate processes without changing contracts.

## 3. Lease algorithm

Claim due jobs where:

```text
status IN (QUEUED, RETRY)
availableAt <= now
leaseExpiresAt IS NULL OR leaseExpiresAt < now
attempt < maxAttempts
```

In a short transaction set `RUNNING`, worker ID, lease expiry, attempt, and start time. Renew lease during long stages. Another worker may recover after expiry.

## 4. Job handlers

### `BUILDER_GENERATE_REVISION`

```text
VALIDATE_PROJECT
LOAD_TEMPLATE
CREATE_WORKSPACE
NORMALIZE_ANSWER_SHEET
AI_COMPLETE
APPLY_TEMPLATE_DATA
SCAN_SECRETS
SCAN_UNSAFE_FILES
VALIDATE_MANIFEST
VALIDATE_BUILD
CREATE_ARTIFACT
WRITE_REVISION
CREATE_PREVIEW_METADATA
COMPLETE
```

### `BUILDER_IMPORT_GITHUB`

```text
VALIDATE_URL
VERIFY_ACCESS
IMPORT_SOURCE
SCAN_SIZE_AND_FILES
SCAN_SECRETS
DETECT_PROJECT
PREPARE_CONTROLLED_SOURCE_METADATA
COMPLETE
```

### `BUILDER_SCAN_ZIP`

```text
LOAD_UPLOAD
VERIFY_SIGNATURE
EXTRACT_SAFELY
SCAN_SECRETS
DETECT_PROJECT
WRITE_SCAN_RESULT
CLEAN_TEMP
COMPLETE
```

### `BUILDER_DEPLOY_REVISION`

```text
VERIFY_APPROVED_REVISION
VERIFY_ARTIFACT
RESERVE_DEPLOYMENT
PUBLISH_CONTROLLED_SOURCE
CREATE_RENDER_SERVICE
TRIGGER_RENDER_DEPLOY
LINK_DEPLOYMENT
QUEUE_RECONCILIATION
QUEUE_BILLING_ATTACH
COMPLETE
```

### `DEPLOYMENT_RECONCILE`

```text
LOAD_DEPLOYMENT
FETCH_PROVIDER_STATUS
MAP_PROVIDER_STATUS
VERIFY_LIVE_URL
UPDATE_DEPLOYMENT
SCHEDULE_NEXT_OR_COMPLETE
```

Use durable due jobs, not a fixed process-local loop.

### `BILLING_ATTACH`

```text
VERIFY_BILLABLE
CREATE_OR_REUSE_ORDER
CREATE_OR_REUSE_SUBSCRIPTION
SET_TRIAL_DEADLINE
UPDATE_DEPLOYMENT
NOTIFY
COMPLETE
```

### `BUILDER_CLEANUP`

Clean expired uploads/workspaces/grants/artifacts, orphan repos, stale leases, and abandoned drafts under retention policy.

## 5. Retry policy

Retry network timeouts, 429/5xx, temporary GitHub/provider/DB/filesystem conditions, and nonterminal provider states. Do not retry invalid input, authorization, unsafe source, secret findings, unsupported framework without safe preset, incomplete answer sheet, invalid transition, quota exhaustion, corrupted artifact, or explicit invalid configuration.

Use bounded exponential backoff with jitter. Separate user-safe errors from internal details.

## 6. Idempotency inside handlers

Before each external side effect:

1. Persist intended operation/stable key.
2. Check whether result already exists.
3. Perform call.
4. Persist provider ID immediately.
5. Resume from persisted state on retry.

Reuse controlled repo, commit, Render service/deploy, order, and subscription when already present.

## 7. Cancellation

Allow cancellation only in safe states. It stops future stages, queues cleanup, and records actor/reason. Provider resources already created require Hosting suspend/delete behavior, not simple job cancellation.

## 8. Progress

Store real stage/percent/message. Percent derives from known stage weights.

## 9. Startup recovery

At startup:

- recover expired `RUNNING` leases
- schedule due reconciliation
- retry failed billing attachments
- record scheduled-job run
- avoid duplicate workers through leases

## 10. Graceful shutdown

Stop claiming, checkpoint/release work, close clients, and log worker/active jobs.

## 11. Observability

Metrics:

```text
builder_jobs_queued
builder_jobs_running
builder_jobs_failed
builder_job_duration
builder_job_retries
builder_stale_leases
generation_token_usage
deployment_provider_latency
billing_attach_failures
cleanup_failures
```

Alert on queue age, repeated failures, stale jobs, billing/reconciliation backlog, cleanup failure, and provider spikes.

## 12. Tests

- competing workers claim once
- lease expiry recovery
- restart after provider success before DB completion
- retry does not duplicate repo/service/order/subscription
- security failure is non-retryable
- cancellation cleanup
- ordered events
- graceful shutdown
- SQLite contention handling
