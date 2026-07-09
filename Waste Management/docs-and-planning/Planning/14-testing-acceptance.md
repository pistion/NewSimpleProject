# 14 - Testing And Acceptance Criteria Implementation Plan

## Goal

Define the test strategy for the full admin monitoring implementation so a coding AI can verify each layer safely.

Testing must cover:

```txt
database schema
backfill
auth permissions
service access gate
billing sync
admin commands
tickets
watchdog
analytics
dashboard UI behavior
regression safety
```

## Test Levels

Use four levels:

```txt
1. Schema/static checks
2. Backend service/API tests
3. Dashboard frontend smoke tests
4. Manual acceptance scenarios
```

## Required Commands

Baseline checks:

```txt
npm run build
node --check server/src/server.js
npm run db:validate
npm run db:generate
```

If test framework exists or is added:

```txt
npm test
```

If no test framework exists, create focused backend test scripts under:

```txt
scripts/test-admin-monitoring.mjs
scripts/test-service-access.mjs
scripts/test-ticket-flow.mjs
```

## Schema Tests

Verify:

```txt
Prisma schema validates
Prisma client generates
new tables exist
indexes are valid
required enum-like values are enforced in service layer
JSON text fields parse safely
```

Acceptance:

- `npm run db:validate` passes.
- Prisma client generation passes.
- App still builds.

## Backfill Tests

Create test fixtures for:

```txt
hosting deployment live/paid
hosting deployment suspended
hosting deployment pending payment
VPS active/paid
BusinessService domain active
BusinessService email pending
CheckoutOrder paid/pending
PaymentReceipt pending/approved/rejected
```

Verify:

```txt
backfill creates ServiceAccess row
backfill updates existing ServiceAccess row
backfill does not duplicate rows
status mapping is correct
null userId records are preserved safely
script does not call external providers
```

Acceptance:

- Running backfill twice produces same row count.
- Created/updated/skipped counts are printed.

## Auth And Permissions Tests

Admin APIs:

```txt
no token -> 401
customer token -> 403
admin token -> 200
suspended admin token -> 403
```

Customer APIs:

```txt
no token -> 401
valid customer -> own records only
customer cannot access another user's ticket/service
suspended customer -> 403
```

Acceptance:

- Admin-only endpoints cannot be reached by normal users.
- Customer data isolation holds.

## Production Hardening Tests

Environment/secrets:

```txt
production startup fails when critical env vars are missing
config-status hides secret values
.env.example contains required variable names
logs do not print secret values
```

Backup/rollback:

```txt
production migration checklist requires backup
backfill can run twice safely
new behavior can be disabled by AdminPolicy
old flows still work after additive schema migration
```

Webhook security:

```txt
valid provider signature accepted
invalid signature rejected
duplicate provider event ignored
stale/replayed event rejected
WebhookEvent row created
duplicate webhook does not double-activate ServiceAccess
browser redirect alone does not mark payment paid
```

Rate limiting:

```txt
login brute force is throttled
password reset spam is throttled
ticket spam is throttled
checkout spam is throttled
admin mutation spam is throttled
repeated failed attempts create WatchdogEvent where required
```

Admin MFA:

```txt
super admin sensitive action requires MFA
billing admin sensitive action requires MFA
MFA setup writes AuditLog
MFA disable/reset writes AuditLog
backup codes are hashed
failed MFA attempts are throttled
```

Acceptance:

- Hardening controls protect auth, payments, admin power, migrations, and public abuse paths.

## Main Site / Dashboard Middleware Fit Tests

Route protection:

```txt
customer account route rejects missing token
customer account route ignores body userId and uses req.user.id
service mutation requires auth
service mutation requires ownership
service mutation requires ServiceAccess where applicable
admin API requires authMiddleware + requireAdmin
admin sensitive action requires permission/recent MFA where enabled
provider route rejects invalid provider token
webhook route rejects invalid signature
```

Watchdog tagging:

```txt
single 401 is tag/counter only
single public 404 does not create WatchdogEvent
repeated invalid token creates warning
repeated admin forbidden attempts create WatchdogEvent
repeated owner mismatch creates WatchdogEvent
analytics spam is rate limited and tagged
ticket spam is rate limited and tagged
duplicate webhook is idempotent and quiet unless volume is abusive
```

Slow warning behavior:

```txt
one slow request increments warning counter
repeated slow route creates warning
very slow repeated route can escalate to WatchdogEvent
warning can be dismissed
warning can be escalated to WatchdogEvent
warning records scrub secrets
```

Dashboard fit:

```txt
/dashboard shell loads without exposing secrets
dashboard API calls require admin auth
Warnings screen lists slow/repeated weak signals
Watchdog screen lists high-threat/review events
Warnings and Watchdog are separate views
```

Acceptance:

- Middleware protects account, service, admin, provider, billing, and webhook boundaries.
- Unwanted requests are tagged/counted first and escalated only when repeated or high threat.

## Service Access Tests

Cases:

```txt
active + paid + allowed -> allowed
active + trial + allowed -> allowed
active + free + allowed -> allowed
pending + pending -> blocked
suspended + paid -> blocked
active + paid + blocked -> blocked
expired -> blocked
owner mismatch -> blocked
admin bypass only when explicitly allowed
```

Expected error codes:

```txt
SERVICE_ACCESS_NOT_FOUND
SERVICE_ACCESS_DENIED
SERVICE_ACCESS_SUSPENDED
SERVICE_ACCESS_EXPIRED
SERVICE_PAYMENT_REQUIRED
SERVICE_ADMIN_BLOCKED
SERVICE_OWNER_MISMATCH
```

Acceptance:

- Protected service route blocks correctly.
- Blocked access writes audit/watchdog event where required.

## Billing Sync Tests

Cases:

```txt
PayPal capture marks order paid and ServiceAccess active
manual receipt approval marks order paid and ServiceAccess active
manual receipt rejection keeps ServiceAccess pending/trial
manual mark-paid activates ServiceAccess
overdue scan marks billingStatus overdue
provider adapter normalizes status
provider secrets are not returned by APIs
payment method list returns only brand/last4/expiry/status
full card number and CVV are never persisted
discount code can be created by admin
discount applies to eligible checkout
expired discount cannot be used
revoked discount cannot be used
discount revoke creates AdminCommand and AuditLog
```

Acceptance:

- Billing status and ServiceAccess status stay consistent.
- User notifications are created for receipt approval/rejection.
- AdminCommand and AuditLog are created for admin billing actions.
- Payment provider handling is isolated behind adapters.
- Coupon/discount behavior changes billing amount only and never bypasses admin/service access blocks.

## Admin Command Tests

Cases:

```txt
suspend user
reactivate user
disable user
soft delete user
suspend service
reactivate service
approve receipt
reject receipt
mark deployment paid
failed provider suspend
```

Verify:

```txt
AdminCommand created
beforeState stored
afterState stored on success
status completed on success
status failed on thrown error
AuditLog created
ServiceAccess updated where applicable
customer notification created where applicable
```

Acceptance:

- Failed commands are visible and not swallowed.
- Sensitive data is scrubbed from before/after state.

## Ticket Tests

Customer:

```txt
create ticket
list own tickets
view own ticket
reply to own ticket
cannot view other user's ticket
close own ticket if allowed
```

Admin:

```txt
list all tickets
reply to ticket
assign ticket
change priority
resolve ticket
close ticket
filter by status/category/priority/user
```

Verify:

```txt
TicketMessage created
AuditLog created
Notification created
status transitions correct
```

Acceptance:

- CRM Service Requests can use ticket data.
- Customer detail shows tickets.

## Watchdog Tests

Cases:

```txt
overdue active service creates payment.overdue
stuck deployment creates deployment.stuck_building
repeated failures creates deployment.repeated_failures
unanswered ticket creates support.ticket_unanswered_too_long
blocked access attempts can create security.blocked_access_attempt
```

Verify:

```txt
duplicate fingerprints prevent spam
review changes status reviewed
dismiss changes status dismissed
escalate changes status escalated
critical event creates admin notification
```

Acceptance:

- Watchdog creates alerts but does not delete/cancel services automatically.

## Instruction Policy Tests

Cases:

```txt
admin can list policies
admin can update enabled flag
admin can update valueJson
non-admin cannot read or update internal policies
policy update creates AuditLog
service gate reads service toggle policy
watchdog reads watchdog policy before optional scan behavior
analytics reads analytics collection policy before optional heatmap behavior
```

Acceptance:

- Instruction data is controlled from the admin dashboard.
- Policy records configure behavior but do not directly execute destructive actions.
- Customer APIs do not expose internal policy configuration.

## Provider Integration Tests

Cases:

```txt
provider status endpoint returns health without secrets
provider sync creates ProviderSyncRun
provider sync failure creates WatchdogEvent
force sync requires admin permission
service provider ID syncs into service record metadata safely
```

Acceptance:

- Provider health is visible in dashboard.
- Provider secrets are never exposed through APIs or logs.

## Permissions Matrix Tests

Cases:

```txt
read-only admin cannot mutate data
support admin can reply to ticket
support admin cannot approve receipt
billing admin can approve receipt
billing admin can apply/revoke discount
billing admin cannot disable user
security admin can review watchdog event
only super admin can change AdminPolicy in v1
failed permission attempt writes AuditLog
```

Acceptance:

- Admin abilities match the permission matrix.
- Destructive commands require allowed role and reason.

## Notification Tests

Cases:

```txt
receipt upload creates admin billing notification
receipt approval creates customer notification
receipt rejection creates customer notification
ticket reply creates opposite-party notification
service suspension creates customer notification
watchdog critical event creates admin/security notification
customer cannot read another user's notification
notification delivery failure does not break source action
```

Acceptance:

- Important events are visible to the right audience.
- Notifications do not leak admin-only details to customers.

## Background Job Tests

Cases:

```txt
scheduled job run creates ScheduledJobRun
job cannot run twice concurrently for same jobKey
failed job records error summary
overdue scan is idempotent
provider sync job is idempotent
retention cleanup does not delete audit/payment proof
manual job run requires admin permission
```

Acceptance:

- Background jobs are visible, retryable, and safe to run repeatedly.

## Retention And Privacy Tests

Cases:

```txt
AuditLog metadata scrubber removes secrets
AdminCommand before/after state scrubber removes secrets
AnalyticsEvent rejects sensitive keys
DashboardSession cleanup removes old sessions
AI/chat retention can delete or summarize old sessions
deleted customer profile is hidden from customer APIs
payment proof is retained without raw card/CVV data
```

Acceptance:

- Sensitive data is scrubbed before storage.
- Retention cleanup keeps legal/audit proof intact.

## Analytics Tests

Cases:

```txt
customer event accepted
backend attaches req.user.id
client-submitted userId ignored
admin analytics summary returns counts
metadata scrubber removes sensitive keys
analytics write failure does not break main action
```

Acceptance:

- Analytics summary appears in dashboard overview.
- Sensitive values are not stored.

## Business Operations Tests

Invoice/tax:

```txt
paid order can generate invoice
invoice number is unique
invoice line items match services
tax rate applies correctly
discount appears on invoice
refund creates credit note
customer can download only own invoice
admin can download invoice without raw file path exposure
```

Customer onboarding:

```txt
registration creates lifecycle row
email verification updates lifecycle
profile completion updates lifecycle
checkout start/payment complete update lifecycle
service active updates lifecycle
dashboard shows customers stuck in onboarding
watchdog flags paid customer stuck in provisioning
```

SLA/status/health:

```txt
service health check records status
provider failure can create incident
admin can create incident update
customer status endpoint shows only public incidents
maintenance window appears in admin health screen
uptime report uses health checks/incidents
```

Observability:

```txt
request ID is attached to requests and logs
error logs scrub secrets
health endpoint returns safe status
admin system health requires admin auth
critical app error can create watchdog/admin notification
```

Exports/reports:

```txt
admin can create export job
export respects filters/date range
sensitive export requires permission
export file expires
export rows scrub secrets
export request writes AuditLog
customer cannot access exports
```

Acceptance:

- Billing documents, onboarding, service health, observability, and exports are covered before production rollout.

## Dashboard Smoke Tests

Use browser/manual or Playwright if available.

Routes:

```txt
/dashboard
```

Verify:

```txt
dashboard loads
sidebar renders
CRM side layer opens
Overview cards render
Customers list renders
Customer detail opens
Services list renders
Tickets screen renders
Watchdog screen renders
Activity screen renders
Billing/Receipts screens render
logout redirects correctly
401 redirects to login
```

Workflow checks:

```txt
admin can open customer detail and see services/billing/tickets/activity
admin can suspend service from service detail with reason
manual receipt approval updates dashboard billing and service access state
ticket reply flow works from Tickets and CRM Service Requests
watchdog event review/dismiss/escalate updates event state
billing admin can create/revoke discount from dashboard
provider health screen shows last sync and failure summaries
read-only admin sees disabled mutation controls
```

Responsive:

```txt
desktop sidebar usable
mobile sidebar opens/closes
text does not overlap
tables are scrollable
CRM side tag remains visible
```

## Manual Production Acceptance Scenarios

Scenario 1: Customer buys hosting

```txt
customer signs up
customer creates deployment
order created
payment completed or receipt approved
ServiceAccess active/paid
admin dashboard shows deployment under customer
activity log shows actions
```

Scenario 2: Admin suspends service

```txt
admin opens customer
admin suspends deployment/service
AdminCommand completed
AuditLog written
ServiceAccess suspended
customer blocked from service
customer notification created
```

Scenario 3: Customer support

```txt
customer opens ticket
admin sees ticket
admin replies
customer receives notification
ticket appears in CRM Service Requests
customer detail shows ticket
```

Scenario 4: Watchdog

```txt
service overdue
watchdog scan runs
watchdog event created
admin dashboard shows flag
admin reviews/dismisses/escalates
```

## Final Done Criteria

The implementation is complete when:

```txt
Sections 1-14 are represented in code or staged with documented placeholders.
Database validates and backfill works.
ServiceAccess controls customer service access.
Admin commands wrap access-changing actions.
Tickets replace HR-style CRM service requests.
Watchdog flags issues without destructive automation.
Analytics summary appears in dashboard.
/dashboard is the clear admin command center.
Old main-site AdminPage is hidden or redirects to /dashboard.
All required build/check/test commands pass.
```
