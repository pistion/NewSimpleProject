# Acceptance Checklist and Definition of Done

Every P0 item is blocking.

## P0 — Security

- [ ] Every AI-spending endpoint requires authentication.
- [ ] Suspended/disabled users cannot use AI or deploy.
- [ ] Per-IP and per-user AI limits exist.
- [ ] AI daily/monthly quotas and concurrent-job limits exist.
- [ ] AI usage/cost is recorded.
- [ ] Generated previews do not execute on dashboard origin.
- [ ] Preview access uses signed, expiring, revocable grants.
- [ ] Preview CSP/security headers are tested.
- [ ] ZIP signature is verified.
- [ ] ZIP upload is not held as a large in-memory buffer.
- [ ] Total extraction size and compression ratio are limited.
- [ ] Traversal, symlink, hardlink, special-file, and path-depth attacks are rejected.
- [ ] Secret scanning blocks high-confidence credentials.
- [ ] Customer input cannot inject arbitrary shell commands.
- [ ] Untrusted install scripts are disabled or isolated.
- [ ] GitHub URL/redirect/SSRF protections exist.
- [ ] Cross-user project/revision/job/preview/deployment access is denied.
- [ ] Logs/errors redact tokens, secrets, and paths.
- [ ] Temporary source/workspaces are cleaned.

## P0 — Data integrity

- [ ] Projects, revisions, jobs, preview grants, and deployment links are in Prisma.
- [ ] Production builder writes no longer depend on plan/template JSON files.
- [ ] Deployment source of truth is migrated or safely bridged to Prisma.
- [ ] Ownership is preserved during migration.
- [ ] Migration is idempotent and verified.
- [ ] Optimistic concurrency prevents silent plan overwrite.
- [ ] Approved revisions are immutable.
- [ ] Deployed revision checksum is recorded.

## P0 — Idempotency and recovery

- [ ] Generation and deployment enforce idempotency keys.
- [ ] Reusing a key with different input returns conflict.
- [ ] Duplicate clicks do not create duplicate revisions/services/orders.
- [ ] Worker jobs survive restart.
- [ ] Expired leases recover.
- [ ] Provider partial success resumes without duplicate resources.
- [ ] Billing attachment and provider reconciliation survive restart.
- [ ] Cleanup is durable and audited.

## P0 — Functional correctness

- [ ] Fake hard-coded AI generation is removed from production.
- [ ] Legacy HTML AI mismatch is removed or corrected.
- [ ] No unchanged-template fallback is reported as successful customization.
- [ ] Every project route restores after refresh.
- [ ] Answer-sheet review supports real editing.
- [ ] Save errors are visible/retryable.
- [ ] Generation progress uses durable stages.
- [ ] Deployment overlay has recovery behavior.
- [ ] Unapproved/failed revisions cannot deploy.
- [ ] Hosting displays accurate provider/build/live state.

## P1 — Unified customer experience

- [ ] Two primary SiteBuilder entry paths.
- [ ] Template flow uses one project lifecycle.
- [ ] Existing-site flow shares project/job/deployment infrastructure.
- [ ] Saved projects resume.
- [ ] Template catalogue has stable IDs/versions.
- [ ] Plan editor is maintainable.
- [ ] Revision history/change requests work.
- [ ] Preview offers page/device controls.
- [ ] Deployment settings are customer-safe.
- [ ] Mobile/accessibility checks pass.

## P1 — Billing and Hosting

- [ ] Normal user cannot force paid provider plan.
- [ ] Billing begins only at defined provider state.
- [ ] Project, revision, deployment, order, subscription are linked.
- [ ] Billing failures are visible/retryable.
- [ ] Trial deadline starts correctly.
- [ ] Verified payment prevents cleanup.
- [ ] Promo claims once after verified payment.
- [ ] Failed pre-provider deployment is non-billable.
- [ ] Controlled repositories/orphan cleanup remain correct.

## P1 — Testing and CI

- [ ] Unit, integration, contract, E2E, security, recovery, and migration tests pass.
- [ ] Frontend build and Prisma validation/migrations pass.
- [ ] CI runs all required suites.
- [ ] Required branch checks are enabled/documented.

## P1 — Operations

- [ ] Structured correlation logs exist.
- [ ] Job, AI cost, provider/billing, cleanup, and disk metrics exist.
- [ ] Critical alerts are configured.
- [ ] Readiness and worker health exist.
- [ ] Reconciliation report exists.
- [ ] Staging is provider-isolated.
- [ ] Rollback test succeeds.

## Legacy retirement

- [ ] Legacy usage is measured.
- [ ] New projects no longer use legacy stores.
- [ ] Legacy UI is removed/internal-only.
- [ ] Legacy routes are adapters, not duplicate implementations.
- [ ] Backups remain through rollback window.
- [ ] Legacy production writes are disabled.
- [ ] Final removal is documented.

## Final definition of done

The SiteBuilder is production-ready only when:

1. A customer can start, leave, refresh, and resume.
2. Customer-controlled code cannot compromise the dashboard.
3. AI/provider costs cannot be triggered anonymously or duplicated through retry.
4. Project, revision, deployment, billing, and ownership data are durable/queryable.
5. Jobs recover from server restart.
6. Both customer flows pass staging and automated tests.
7. CI blocks regressions.
8. A tested rollback path exists.
