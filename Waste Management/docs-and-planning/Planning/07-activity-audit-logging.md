# 07 - Activity And Audit Logging Implementation Plan

## Goal

Create a reliable event history across the platform. The admin dashboard must be able to answer:

```txt
Who did what?
When did it happen?
What changed?
Which user/service/payment/ticket was affected?
Was it customer action, admin action, system action, or watchdog action?
```

The existing `AuditLog` table is the base. This plan expands how it is used and displayed.

## Current State

The schema already has:

```txt
AuditLog
```

Fields:

```txt
organizationId
actorUserId
action
entityType
entityId
status
method
path
metadata
createdAt
```

The backend already has:

```txt
server/src/services/auditLogService.js
server/src/middleware/audit.middleware.js
```

Many admin actions already call `writeAuditLog`.

## Retention And Privacy Rules

The dashboard needs history, but not every record should live forever in raw form.

Recommended retention:

```txt
AuditLog:
keep long-term, minimum 3-7 years depending on business/legal needs

AdminCommand:
keep long-term because it proves admin actions

Payment/billing logs:
keep long-term, but scrub provider secrets and raw payloads

AnalyticsEvent:
keep detailed events 12-24 months, then aggregate or archive

DashboardSession:
keep 90-180 days unless needed for security investigation

WatchdogEvent:
keep open/escalated long-term; archive dismissed low-risk events after 12-24 months

Ticket/TicketMessage:
keep while customer relationship is active; archive after retention window

ChatbotInteraction/CrmAiSession:
keep 90-365 days by default, then summarize/delete unless tied to an open ticket

ProviderSyncRun/ScheduledJobRun:
keep detailed runs 90-180 days, retain summaries longer
```

Privacy rules:

- Do not log passwords, CVV, full card numbers, API keys, private keys, provider secrets, raw auth headers, or raw customer documents.
- Scrub `beforeState`, `afterState`, and `metadata` before writing `AuditLog` or `AdminCommand`.
- Use user IDs and service IDs instead of copying full customer records into logs.
- Deleted users should remain as soft-deleted records for audit/payment integrity, but public/customer APIs must hide or anonymize deleted profiles.
- Analytics and AI/chat data should support deletion/anonymization requests where legally required.
- Retention windows should be configurable later through `RetentionPolicy` or `AdminPolicy`.

## Notification System

Notifications turn important changes into customer/admin awareness.

Use existing `Notification` as the base table. Add `NotificationPreference` later if customers/admins need channel preferences.

Notification channels:

```txt
in_app
email
dashboard_alert
system_log
```

Notification audiences:

```txt
customer
admin
billing_admin
support_admin
security_admin
system
```

Required notification events:

```txt
receipt uploaded -> admin billing alert
receipt approved -> customer notice
receipt rejected -> customer notice
payment failed -> customer notice + billing/admin notice if repeated
service expiring soon -> customer notice
service suspended -> customer notice + admin dashboard alert
service reactivated -> customer notice
ticket created -> admin/support notice
ticket replied by admin -> customer notice
ticket replied by customer -> admin/support notice
watchdog critical event -> admin/security notice
provider sync failure -> admin/system notice
admin policy changed -> admin/security notice
```

Rules:

- Notifications must link to the affected user, service, ticket, receipt, command, or watchdog event where possible.
- Customer notifications must not expose internal admin notes, provider secrets, or watchdog-only details.
- Email sending should be retried safely and logged without storing full message secrets.
- Dashboard alerts should be dismissible without deleting the underlying source record.
- Notification creation should not break the main action if delivery fails; delivery failure should create a system/watchdog signal.

## Logging Categories

Use consistent action prefixes:

```txt
auth.*
profile.*
billing.*
receipt.*
deployment.*
hosting.*
domain.*
vps.*
service_access.*
ticket.*
crm.*
admin.*
watchdog.*
analytics.*
dashboard.*
```

Examples:

```txt
auth.login_success
auth.login_failed
auth.logout
profile.updated
billing.order_created
billing.payment_captured
receipt.uploaded
receipt.approved
receipt.rejected
deployment.created
deployment.failed
deployment.redeployed
hosting.suspended
domain.registered
vps.created
service_access.activated
service_access.suspended
ticket.created
ticket.replied
admin.command_executed
admin.command_failed
watchdog.flag_created
dashboard.session_started
```

## Actor Types

Extend audit metadata with actor type:

```txt
customer
admin
system
watchdog
provider
```

Do not add a new column immediately unless needed. Store in `metadata.actorType` for v1.

Example metadata:

```json
{
  "actorType": "admin",
  "requestId": "req_x",
  "ip": "127.0.0.1",
  "userAgent": "browser",
  "before": {},
  "after": {}
}
```

## Entity Types

Use consistent entity type names:

```txt
user
service_access
deployment
domain
vps_service
business_service
checkout_order
payment_receipt
ticket
ticket_message
admin_command
watchdog_event
dashboard_session
notification
```

## What Must Be Logged

Authentication:

```txt
register
login success
login failure
logout
refresh token use
password change
social auth success/failure
```

Profile/account:

```txt
profile update
avatar upload
ID photo upload
account suspended
account disabled
account reactivated
account soft-deleted
```

Billing:

```txt
order created
PayPal order created
PayPal captured
PayPal webhook received
receipt uploaded
receipt approved
receipt rejected
manual mark-paid
manual renewal
discount applied
order cancelled/deleted
```

Services:

```txt
deployment created
deployment failed
deployment live
deployment suspended
deployment reactivated
deployment deleted/cancelled
domain purchased
domain DNS changed
VPS created
VPS started/stopped/rebooted
email service created/suspended
service access activated/suspended/expired/cancelled
```

Support:

```txt
ticket created
ticket replied
ticket assigned
ticket resolved
ticket closed
```

Dashboard:

```txt
admin dashboard opened
admin command executed
admin note created
watchdog event reviewed
```

## Backend Helper

Standardize `writeAuditLog` usage.

Expected helper input:

```js
{
  organizationId,
  actorUserId,
  actorType,
  action,
  entityType,
  entityId,
  status,
  method,
  path,
  metadata
}
```

The helper should:

- stringify metadata safely
- strip dangerous/private fields
- tolerate logging failure without breaking critical user actions unless explicitly configured
- include request ID if available

## Sensitive Data Scrubbing

Audit logs must never store:

```txt
passwords
password hashes
refresh token hashes
access tokens
provider API secrets
full card details
CVV
raw receipt file paths
raw ID photo paths
large file content
```

Create a small scrubber helper:

```txt
server/src/services/auditScrubber.js
```

It should remove keys containing:

```txt
password
token
secret
authorization
cookie
filePath
idPhotoPath
avatarPath
cvv
cardNumber
```

## Admin Activity API

Existing endpoint:

```txt
GET /api/admin/activity
```

Extend filters:

```txt
actorUserId
actorType
action
entityType
entityId
status
dateFrom
dateTo
limit
offset
```

Response:

```json
{
  "items": [],
  "summary": {
    "total": 0,
    "success": 0,
    "failed": 0,
    "adminActions": 0,
    "customerActions": 0,
    "systemActions": 0
  }
}
```

## Customer Detail Activity

Customer detail endpoint should include:

```txt
activity
```

Definition:

- events where `actorUserId = userId`
- events where `entityType = user` and `entityId = userId`
- events whose metadata contains `targetUserId = userId`
- ticket/service/order related events tied to that user

Keep v1 simple:

- fetch by `actorUserId`
- fetch by user entity
- fetch admin commands separately

## Dashboard UI Requirements

Activity page:

```txt
event timeline
filters
actor
action
entity
status
timestamp
metadata preview
```

Customer detail:

```txt
latest activity timeline
admin command history
billing events
service events
ticket events
```

Watchdog page:

```txt
related audit events beside each watchdog flag
```

## Implementation Steps

1. Audit current `writeAuditLog` helper.
2. Add scrubber.
3. Standardize action names.
4. Add missing audit logs to auth, billing, service access, ticket, admin command, and watchdog flows.
5. Extend `/api/admin/activity` filters.
6. Add customer detail activity aggregation.
7. Update dashboard Activity page.
8. Add tests for scrubbing and key action logging.

## Acceptance Criteria

- Every critical user/admin/service/payment/ticket action creates an audit event.
- Admin dashboard can filter activity.
- Customer detail shows user activity.
- Sensitive data is scrubbed.
- Audit logging failure does not expose secrets or crash normal flows.
- Failed admin commands and failed service actions appear in activity.
