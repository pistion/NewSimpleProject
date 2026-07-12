# Rollout, Migration, and Rollback

## 1. Principles

- No big-bang replacement.
- No destructive migration without backup.
- No indefinite split source of truth.
- Every phase has a flag and rollback condition.
- Legacy data remains readable during observation.
- Provider resources are never duplicated during retry/rollback.

## 2. Environments

Use local, test, staging, production canary, and production. Staging must have separate database, artifact path, controlled GitHub target, Render account/resources, PayPal sandbox, OpenAI/mock configuration, and preview hostname.

## 3. Pre-migration backup

Record current commit, configuration names, database copy/checksum, JSON-store copies/checksums, artifact manifest, active deployment count, and active order/subscription count. Test restore first.

## 4. Feature-flag sequence

### A — Dark code

Deploy schema, repositories, jobs, and API with flags off.

### B — Internal/admin

Enable database/project flow for internal users.

### C — Preview isolation

Enable isolated preview internally. Main-origin preview stays disabled in production.

### D — Canary customers

Enable new project creation for a small group. Legacy projects remain readable.

### E — All new projects

All new builder projects use canonical flow.

### F — Historical migration

Run verified migration and expose archive/resume.

### G — Disable legacy creation

Legacy routes deprecate or route into canonical services.

### H — Stop JSON writes

Retain read-only backup.

### I — Remove legacy UI/routes

Only after observation and rollback window.

## 5. Migration runbook

1. Confirm backup.
2. Deploy schema.
3. Run `--dry-run`.
4. Review corrupt/orphan/ownership report.
5. Correct blockers.
6. Run `--execute`.
7. Run `--verify`.
8. Compare counts/checksums.
9. Enable canary DB reads.
10. Monitor.
11. Enable all reads.
12. Stop legacy writes.
13. Preserve backups.

## 6. Canary metrics

Watch project creation errors, save conflicts, generation failures/duration, preview errors, deployment duplicates, provider errors, billing failures, support tickets, AI cost, and DB busy/lock errors. Define thresholds before rollout.

## 7. Rollback conditions

Rollback for missing customer data, cross-user defect, duplicate providers, incorrect billing, preview isolation bypass, migration mismatch, job loss/uncontrolled backlog, severe DB corruption/contention, or unacceptable generation failure.

## 8. Rollback procedure

Before JSON writes stop, disable new flags and keep canonical data for analysis. After writes stop, stop workers, disable canonical writes, restore DB only when necessary, re-enable read-only legacy adapters, and reconcile operations after migration using provider IDs/idempotency.

Never roll back to insecure main-origin preview or unauthenticated AI. Disable those features instead.

## 9. Reconciliation report

Find:

- project without owner/current revision
- approved project without approved revision
- deployment link without deployment
- deployment without project/revision
- billable deployment without order
- expected order without subscription
- provider service without local record
- stale running job
- active expired preview grant
- orphan artifact/workspace/repository

Run before and after rollout.

## 10. Legacy retirement

Before deletion require no creation traffic, no read traffic beyond archive adapters, verified migration, updated support process, retained backup, completed rollback period, and approval. Document removal commit.
