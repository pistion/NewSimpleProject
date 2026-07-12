# Hosting, Billing, and Provider Integration

## 1. Preserve the Hosting Engine boundary

Hosting Deploy Engine remains the only owner of controlled source publication, Render service/deploy creation, provider status, live verification, logs, environment variables, disks/domains, redeploy/restart/suspend/delete, and billing trigger.

Builder passes a validated approved revision artifact and customer-safe handoff settings.

## 2. Builder-to-Hosting contract

```json
{
  "projectId": "project_...",
  "revisionId": "revision_...",
  "artifactChecksum": "...",
  "siteName": "My Business",
  "slug": "my-business",
  "sourceType": "builder-revision",
  "sourceReference": "revision_...",
  "generatedSite": {
    "artifactLocation": "...",
    "framework": "vite",
    "buildPresetId": "vite-static-v1",
    "publishDirectory": "dist"
  },
  "billingTierId": "standard_200",
  "idempotencyKey": "..."
}
```

Normal customers cannot override Render key/owner, paid initial plan, controlled owner, arbitrary commands, or server paths.

## 3. Idempotent provider flow

Persist deployment ID, provider operation key, controlled repo, commit SHA, Render service/deploy IDs, and provider status.

On retry, reuse existing repo/commit/service/deploy. Use provider idempotency where available; otherwise use persisted IDs and deterministic lookup.

## 4. Name/slug collisions

Normalize base slug, reserve uniqueness in DB, add controlled suffix when necessary, store stable mapping, and show final subdomain. Use unique constraints to prevent races.

## 5. Controlled source

Keep:

```text
customer source -> Glondia controlled source -> Render
```

Record original and controlled metadata. Never expose credentials. Generated revisions publish the exact approved artifact, pin commit SHA, and store checksum.

## 6. Free-plan enforcement

Normal users always start on configured free/trial plan. Ignore raw customer `plan`. Only audited admin override is allowed. Store commercial tier, provider initial/post-payment plans, intent, actor, and reason.

## 7. Billable state

Central predicate requires deployment, Render service, accepted deploy/queue state, `platformDeployed`, billable status, not configuration-required, and not failed/deleted.

## 8. Durable billing attachment

Replace fire-and-forget middleware with `BILLING_ATTACH` job. It verifies state, creates/reuses order and subscription, sets trial deadline, updates deployment, notifies, and records/retries failure.

## 9. Trial lifecycle

Store:

```text
providerAcceptedAt
trialStartsAt
billingDueAt
paidAt
currentPeriodStart
currentPeriodEnd
nextBillingAt
suspendedAt
deletedAt
```

The 12-hour timer begins only after defined provider handoff. Cleanup transactionally rechecks payment/provider state.

## 10. Payment verification

Verify PayPal signatures, deduplicate events, audit manual receipts, link paid order to deployment, update subscription transactionally, and claim promo only once after verified payment.

## 11. Provider reconciliation

Durably reconcile service existence, deploy status, URL, plan, suspension/deletion, local/provider divergence, missing billing/subscription, and orphan services. Store last reconciliation and provider health.

## 12. Failure cleanup

Keep failed record/logs, mark non-billable when provider was not reached, clean temporary source, archive/delete dedicated orphan repo according to policy, never archive shared repo, record cleanup, and allow staged retry.

## 13. Environment variables

Source scan returns required names only. Hosting stores values securely, never returns raw values, redacts logs, validates names/count/size, blocks reserved keys, and audits changes.

## 14. Hosting dashboard

Display project/revision source, stage/provider/live verification, logs, billing/trial, required env names, appropriate controlled-source metadata, retry/redeploy, and support request ID. “Live” requires verification.

## 15. Tests

- user cannot force paid plan
- admin override audited
- duplicate deployment returns existing job
- retry does not duplicate repo/service
- no billing before provider handoff
- billing attaches after billable state
- billing restart recovery
- webhook duplicate handling
- trial timestamp correctness
- paid deployment not cleaned
- unpaid cleaned once
- failed pre-provider non-billable
- all project/revision/deployment/order/subscription links valid
