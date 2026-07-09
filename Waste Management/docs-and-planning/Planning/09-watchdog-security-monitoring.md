# 09 - Watchdog, Security, And Monitoring Implementation Plan

## Goal

Create a watchdog layer that monitors accounts, services, payments, deployments, tickets, and suspicious behavior. The watchdog should flag problems for admin review and feed the dashboard with risk signals.

The watchdog should not perform destructive actions automatically in v1. It should create events and recommendations. Admins approve major actions through the Admin Command layer.

## Background Job And Scheduler Architecture

Watchdog scans, provider syncs, payment expiry checks, and cleanup tasks need a controlled scheduler.

Recommended v1 approach:

```txt
server/src/jobs/scheduler.js
server/src/jobs/watchdogJobs.js
server/src/jobs/billingJobs.js
server/src/jobs/providerSyncJobs.js
server/src/jobs/retentionJobs.js
```

Use simple cron-style scheduling in v1 if no queue exists. If the app grows, move to a queue/worker system.

Job run tracking:

```txt
ScheduledJobRun:
jobKey
startedAt
finishedAt
status
recordsScanned
recordsUpdated
errorMessage
metadata
```

Required jobs:

```txt
billing.expiry_scan
billing.overdue_scan
billing.renewal_reminder_scan
provider.hosting_sync
provider.domain_sync
provider.vps_sync
provider.email_sync
watchdog.full_scan
watchdog.payment_scan
watchdog.deployment_scan
watchdog.ticket_scan
retention.analytics_rollup
retention.dashboard_session_cleanup
```

Rules:

- Jobs must be idempotent.
- A failed job should not crash the main app.
- Failed jobs create `WatchdogEvent` when they affect customer/service reliability.
- Jobs should use database locks or "already running" checks to prevent duplicate concurrent runs.
- Job output should be visible in the admin dashboard.
- Jobs read `AdminPolicy` before optional behavior.

## SLA, Service Health, And Incidents

Follow `16-business-operations-and-reporting.md` for production health/status tracking.

Watchdog should feed:

```txt
ServiceHealthCheck
Incident
IncidentUpdate
MaintenanceWindow
SlaPolicy
```

Rules:

- Provider failures can create health checks and internal incidents.
- Admin decides whether an incident is customer-visible.
- Uptime/SLA reports come from health checks and incident duration.
- Customer-facing status must not expose provider secrets or internal admin notes.

## Core Principle

Watchdog observes and reports.

Admin commands act.

Service access enforces.

Warnings catch slow/repeated weak signals before they become watchdog events.

Follow `17-main-site-dashboard-middleware-fit.md` for request threat tags, warning thresholds, and escalation rules.

## Required Table

Use `WatchdogEvent` from `01-data-backbone.md`.

Required event categories:

```txt
payment
deployment
account
security
support
service_health
usage
provider
```

Required severities:

```txt
info
warning
danger
critical
```

Required statuses:

```txt
open
reviewed
dismissed
escalated
```

## Watchdog Event Types

Payment events:

```txt
payment.overdue
payment.failed
payment.receipt_pending_too_long
payment.receipt_rejected_repeatedly
payment.provider_webhook_failed
```

Deployment events:

```txt
deployment.failed
deployment.stuck_building
deployment.repeated_failures
deployment.provider_missing
deployment.live_check_failed
deployment.unpaid_still_active
```

Account events:

```txt
account.suspicious_login_pattern
account.too_many_failed_logins
account.profile_changed_after_payment_failure
account.multiple_service_failures
```

Support events:

```txt
support.urgent_ticket_open
support.ticket_unanswered_too_long
support.repeated_complaints
support.billing_complaint
```

Security events:

```txt
security.admin_action_failed
security.service_owner_mismatch
security.blocked_access_attempt
security.forbidden_admin_attempt
security.suspicious_api_usage
```

Usage events:

```txt
usage.unusual_activity_spike
usage.no_activity_after_purchase
usage.high_service_churn
```

## Backend Service

Create:

```txt
server/src/services/watchdogService.js
```

Required functions:

```js
async function createWatchdogEvent(input)
async function listWatchdogEvents(filters)
async function reviewWatchdogEvent(eventId, adminUserId, note)
async function dismissWatchdogEvent(eventId, adminUserId, note)
async function escalateWatchdogEvent(eventId, adminUserId, note)
async function scanPayments()
async function scanDeployments()
async function scanTickets()
async function scanServiceAccess()
async function scanSecuritySignals()
async function runWatchdogScan()
```

Rules:

- Duplicate events should be avoided where possible.
- Use a fingerprint in metadata for repeated conditions.
- If the same issue already has an open event, update metadata/count instead of creating endless duplicates.

Example fingerprint:

```txt
payment.overdue:userId:serviceType:serviceId
deployment.stuck_building:deploymentId
ticket.unanswered:ticketId
```

## Scans For V1

Implement these first:

### Payment overdue scan

Find `ServiceAccess` rows where:

```txt
billingStatus in pending/overdue/failed
expiresAt < now OR related order dueAt < now
accessStatus active
```

Create:

```txt
payment.overdue
```

Optional action:

- mark service access `billingStatus = overdue`
- do not suspend automatically unless existing cleanup policy already does

### Stuck deployment scan

Find deployments where:

```txt
status = building or queued
createdAt older than configured threshold
```

Create:

```txt
deployment.stuck_building
```

Default threshold:

```txt
30 minutes
```

### Failed deployment scan

Find recent failed deployments.

Create:

```txt
deployment.failed
```

If same user has 3+ failures in 24 hours:

```txt
deployment.repeated_failures
```

### Ticket unanswered scan

Find tickets:

```txt
status open or pending_admin
updatedAt older than threshold
```

Create:

```txt
support.ticket_unanswered_too_long
```

Default threshold:

```txt
24 hours
```

Urgent tickets threshold:

```txt
2 hours
```

### Blocked access attempt scan

When `requireServiceAccess` blocks a user, create an audit event. If repeated blocked attempts occur, create:

```txt
security.blocked_access_attempt
```

## Admin APIs

Add routes:

```txt
GET /api/admin/watchdog/events
GET /api/admin/watchdog/events/:eventId
POST /api/admin/watchdog/events/:eventId/review
POST /api/admin/watchdog/events/:eventId/dismiss
POST /api/admin/watchdog/events/:eventId/escalate
POST /api/admin/watchdog/run-scan
```

Filters:

```txt
status
severity
eventType
userId
serviceType
serviceId
dateFrom
dateTo
limit
offset
```

## Dashboard UI

Add Watchdog page/tab.

Summary cards:

```txt
open flags
critical flags
payment issues
deployment issues
support issues
security issues
```

Table columns:

```txt
severity
event type
message
customer
service
status
created date
actions
```

Actions:

```txt
review
dismiss
escalate
open customer
open service
create admin note
create admin command when appropriate
```

Customer detail should show watchdog events affecting that user.

Service detail should show watchdog events affecting that service.

## Notifications

Admin notifications should be created for:

```txt
critical watchdog event
urgent support event
payment overdue event
deployment repeated failures
security forbidden admin attempt
```

Customer notifications should be created only when useful and safe:

```txt
payment overdue
service suspended/expired
ticket update
```

Do not notify customers about internal suspicious/security review labels unless admin approves.

## Automation Policy

V1 allowed automatic changes:

```txt
mark billingStatus overdue
mark watchdog event open
create admin notification
write audit log
```

V1 not allowed automatically:

```txt
delete user
delete service
cancel subscription
apply discount
block account unless existing policy already blocks it
```

Suspension for overdue deployments can continue if existing cleanup policy already performs it. New watchdog should report it and record it.

## Implementation Steps

1. Add `WatchdogEvent` model.
2. Create `watchdogService.js`.
3. Add duplicate/fingerprint helper.
4. Implement payment overdue scan.
5. Implement deployment stuck/failed scans.
6. Implement ticket unanswered scan after tickets exist.
7. Connect blocked service access attempts to watchdog.
8. Add admin watchdog routes.
9. Add dashboard Watchdog page.
10. Add customer detail watchdog panel.

## Acceptance Criteria

- Watchdog can create events without breaking normal requests.
- Duplicate events are controlled.
- Admin can review/dismiss/escalate events.
- Dashboard shows open watchdog flags.
- Customer detail shows related watchdog events.
- Critical flags create admin notifications.
- No destructive action is taken automatically by new watchdog code in v1.
