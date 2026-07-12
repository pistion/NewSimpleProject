# Final Implementation Report Template

Claude Code must complete this after implementation.

## 1. Summary

- Branch:
- Starting commit:
- Ending commit:
- Overall result:
- Feature flags added/changed:
- Production readiness recommendation:

## 2. Architecture implemented

Describe the canonical project lifecycle, Template AI relationship, Hosting relationship, durable worker, preview isolation, and database source of truth. Include a concise flow diagram.

## 3. Database changes

List Prisma models, model changes, indexes/constraints, migrations, JSON versions, transactions, and legacy migration command.

Migration results:

```text
source files:
source checksums:
records read:
records inserted:
records updated:
records skipped:
records failed:
verification result:
```

## 4. API changes

List every added/changed/deprecated route with method/path, auth, purpose, sync/async behavior, idempotency, and primary errors.

## 5. Frontend changes

List routes, components added/reused/removed/internalized, autosave, generation, preview, handoff, mobile/accessibility.

Explicitly report what happened to:

- BuilderRoxanne
- AiTemplateSetup
- BuilderSitePlan
- BuilderEditor
- BuilderImport
- DeploymentSettings

## 6. Security changes

Report AI auth/rate/quota, preview isolation, ZIP/archive protection, secret scanning, GitHub/SSRF controls, build/dependency policy, redaction, cleanup, and tests. State remaining risk clearly.

## 7. Jobs and recovery

List job types/stages and evidence for restart, stale lease, duplicate request, partial provider success, billing recovery, and reconciliation.

## 8. Hosting and billing

Report controlled source, provider idempotency, plan enforcement, billable predicate, relationships, trial start, cleanup, and failure behavior.

## 9. Tests and CI

```text
install:
prisma generate:
prisma validate:
migrations:
syntax:
lint:
unit:
integration:
contracts:
security:
e2e:
build:
```

List tests added.

## 10. Rollout

Give exact staging, flags, canary, production migration, observation, legacy-write shutdown, and legacy-removal steps with monitoring thresholds.

## 11. Rollback

Give exact rollback commands/configuration and data implications. State which security changes must never be rolled back to insecure behavior.

## 12. Files changed

Group by frontend, API, Template AI, Hosting, Prisma, worker, tests, and CI/docs.

## 13. Remaining work

Only non-blocking items may remain. For each give description, risk, reason deferred, and recommended owner/phase.

## 14. Acceptance checklist

Copy `13_ACCEPTANCE_AND_DEFINITION_OF_DONE.md`, mark every item, and link evidence.
