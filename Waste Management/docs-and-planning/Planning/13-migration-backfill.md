# 13 - Migration And Backfill Implementation Plan

## Goal

Move the current project toward the new monitoring architecture without breaking existing users, deployments, orders, receipts, VPS records, or admin flows.

The migration must be additive first. Do not remove current storage or rewrite deployment history in the first pass.

## Migration Principle

Phase 1 is additive:

```txt
add new tables
backfill records
sync future writes
keep old flows working
```

Phase 2 can consolidate storage later after data is reliable.

## Backup And Rollback Requirements

Follow `15-production-hardening.md` before production migration.

Before any production schema or backfill run:

```txt
create database backup
verify backup exists
record backup timestamp/location
run schema validation
run migration in staging first
run backfill dry-run if available
```

Rollback strategy:

- Keep changes additive in phase 1.
- Disable new behavior with `AdminPolicy` if issues appear.
- Do not drop old columns/tables during the first migration pass.
- Backfill scripts must be idempotent and safe to rerun.
- If a deploy fails after schema add, leave old flows working while fixes are applied.

## New Tables To Add

Add Prisma models for:

```txt
ServiceAccess
AdminCommand
Ticket
TicketMessage
WatchdogEvent
AnalyticsEvent
AdminNote
DashboardSession
```

Optional if implementing reusable cards/payment methods now:

```txt
PaymentMethod
```

## Migration Commands

Use existing project Prisma workflow:

```txt
npm run db:validate
npm run db:generate
npm run db:push
```

If production requires migrations instead of push:

```txt
npx prisma migrate dev --name admin-monitoring-backbone
npm run db:migrate
```

Follow the repo's deployment process. Do not run destructive migrations.

## Backfill Script

Create:

```txt
scripts/backfill-admin-monitoring.mjs
```

This should call smaller helpers:

```txt
backfillServiceAccess()
backfillAdminCommandsFromAuditLogs()
backfillDashboardSessionsOptional()
backfillInitialWatchdogEvents()
```

The script must be idempotent.

## Backfill ServiceAccess

Sources:

```txt
JSON hosting store deployments
VpsService
BusinessService
WebHostingService
DeploymentSubscription
CheckoutOrder
PaymentReceipt
```

Rules:

Hosting deployment:

```txt
serviceType = hosting
serviceId = deployment.deploymentId
userId = deployment.userId
serviceName = deployment.serviceName
checkoutOrderId = deployment.checkoutOrderId
planId = deployment.billingTierId or deployment.renderPlan
billingStatus = map deployment.paymentStatus
accessStatus = map deployment.status
```

VPS:

```txt
serviceType = vps
serviceId = VpsService.id
userId = VpsService.createdByUserId
organizationId = VpsService.organizationId
serviceName = VpsService.label
checkoutOrderId = VpsService.checkoutOrderId
planId = VpsService.plan
billingStatus = map VpsService.paymentStatus
accessStatus = map VpsService.status
```

BusinessService:

```txt
serviceType = BusinessService.type
serviceId = BusinessService.id
userId = BusinessService.createdByUserId
organizationId = BusinessService.organizationId
serviceName = BusinessService.name
checkoutOrderId = BusinessService.checkoutOrderId
planId = BusinessService.billingCycle
billingStatus = map BusinessService.paymentStatus
accessStatus = map BusinessService.status
expiresAt = BusinessService.expiresAt
```

WebHostingService:

```txt
serviceType = hosting
serviceId = WebHostingService.id
userId = WebHostingService.createdByUserId
organizationId = WebHostingService.organizationId
serviceName = WebHostingService.name
checkoutOrderId = WebHostingService.checkoutOrderId
planId = WebHostingService.plan
billingStatus = map WebHostingService.paymentStatus
accessStatus = map WebHostingService.status
```

## Status Mapping

Billing status:

```txt
paid -> paid
payment_uploaded -> payment_uploaded
pending -> pending
failed -> failed
overdue -> overdue
cancelled -> cancelled
none/null -> pending
free -> free
trialing -> trial
```

Access status:

```txt
live -> active
deployed -> active
active -> active
running -> active
building -> pending
queued -> pending
pending -> pending
suspended -> suspended
expired -> expired
cancelled -> cancelled
deleted -> deleted
account_deleted -> deleted
failed/error -> pending
```

Admin status default:

```txt
allowed
```

If source record has suspension reason:

```txt
adminStatus = blocked only if explicitly admin-blocked
accessStatus = suspended
suspendedReason = source reason
```

## Backfill AdminCommands From AuditLogs

Do not attempt full reconstruction.

Only backfill commands when audit action clearly maps:

```txt
admin.user.suspended -> SUSPEND_USER
admin.user.reactivated -> REACTIVATE_USER
admin.user.deleted -> DELETE_USER
admin.deployment.suspended -> SUSPEND_SERVICE
admin.deployment.reactivated -> REACTIVATE_SERVICE
admin.receipt.approved -> APPROVE_RECEIPT
admin.receipt.rejected -> REJECT_RECEIPT
admin.order.deleted -> CANCEL_SERVICE or order delete metadata
```

Mark backfilled commands:

```json
{
  "backfilled": true,
  "source": "audit_log"
}
```

If uncertain, skip. Do not create misleading commands.

## Initial Watchdog Backfill

Create open watchdog events for current obvious problems:

```txt
overdue active services
pending receipts older than 48 hours
deployments stuck building longer than 30 minutes
failed deployments in last 24 hours
urgent tickets if tickets already exist
```

Use fingerprints to avoid duplicates.

## Rollout Steps

1. Add Prisma models.
2. Validate/generate Prisma.
3. Deploy additive schema.
4. Run backfill script locally/staging.
5. Review counts.
6. Run in production with logs.
7. Enable dashboard reads from new tables.
8. Enable write-sync in payment/admin/service flows.
9. Enable service access middleware route by route.

## Backfill Report

Script should print:

```txt
users scanned
hosting deployments scanned
VPS services scanned
business services scanned
web hosting services scanned
ServiceAccess created
ServiceAccess updated
AdminCommands backfilled
WatchdogEvents created
skipped records
errors
```

## Safety Requirements

- Script must not delete records.
- Script must not suspend services.
- Script must not call external providers.
- Script must not mutate existing service records except optional metadata if explicitly approved.
- Script must be idempotent.

## Acceptance Criteria

- New tables exist.
- Backfill completes without duplicates.
- Existing admin dashboard still loads.
- ServiceAccess rows exist for current services.
- Existing deployments/orders/receipts remain unchanged.
- Dashboard can read new service access data.
