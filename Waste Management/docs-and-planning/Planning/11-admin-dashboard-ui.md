# 11 - Admin Dashboard UI Implementation Plan

## Goal

Make `/dashboard` the single production admin command center for GlondiaSites.

The dashboard should let admins monitor and control:

```txt
customers
services
deployments
domains
VPS
billing
receipts
tickets
activity
admin commands
watchdog flags
analytics
settings
```

The main GlondiaSites app remains customer-facing. The old main-site `AdminPage` should eventually redirect to `/dashboard` or be hidden to avoid two competing admin consoles.

## Current State

The isolated dashboard lives at:

```txt
admin-dashboard/frontend
```

It is mounted by the Express server:

```txt
/dashboard
/dashboard-assets/*
```

The dashboard currently has:

```txt
Overview
Customers
Hosting
Deployments
Domains
VPS Hosting
Billing
Receipts
Tickets
Activity
Settings
CRM secondary sidebar layer
```

The CRM layer is a side-button panel, not a normal main nav item.

## Final Navigation Model

Main sidebar should contain:

```txt
Overview
Customers
Services
Deployments
Domains
VPS
Billing
Receipts
Invoices
Tickets
Activity
Watchdog
Warnings
Health
Reports
Settings
```

CRM secondary sidebar should contain:

```txt
Overview
Inbox
Service Requests
Email Lists
AI Chat
Website Bots
Automations
```

Mapping:

- Main `Tickets` is the structured support/ticket table.
- CRM `Service Requests` can show the same ticket data in a communication-focused layout.
- CRM `Inbox` is customer/admin message flow.
- CRM future sections must not reintroduce HR/applicant language.

Settings must include an "Instruction Policies" area for admin-only toggles:

```txt
Admin Power
Service Toggles
Watchdog Rules
Analytics Collection
CRM / AI Features
```

This is where the dashboard controls `AdminPolicy`. It should show clear enabled/disabled states, last updated time, and the admin who changed each policy. Policy changes must feel like operational controls, not hidden developer settings.

## Admin Dashboard User Journeys

The UI should be built around workflows, not just tables.

### Journey 1: Monitor A Customer

```txt
Admin opens Customers
-> searches email/name/user ID
-> opens Customer Detail
-> sees profile, account status, services, billing, tickets, activity, watchdog events
-> opens a service or ticket from the same page
```

Expected result:

- admin understands the customer's full account state without switching through unrelated screens;
- every visible service links to its `ServiceAccess`, billing record, tickets, and activity.

### Journey 2: Suspend A Problem Service

```txt
Admin opens Services or Customer Detail
-> selects hosting/VPS/domain/email service
-> clicks Suspend
-> enters reason
-> backend creates AdminCommand
-> ServiceAccess.adminStatus becomes blocked or accessStatus becomes suspended
-> AuditLog records before/after
-> customer notification is created
-> dashboard refreshes service state
```

Expected result:

- service becomes unusable through middleware;
- action appears in customer timeline and admin command history.

### Journey 3: Approve Manual Payment

```txt
Admin opens Receipts
-> reviews uploaded receipt
-> approves or rejects with reason
-> CheckoutOrder and PaymentReceipt update
-> ServiceAccess updates paid/active or remains pending
-> customer receives notification
-> billing dashboard updates revenue/pending counts
```

Expected result:

- payment state and service access never drift apart.

### Journey 4: Handle Customer Complaint

```txt
Admin opens Tickets or CRM Inbox
-> opens complaint
-> sees linked user, service, billing status, activity, prior tickets
-> replies or assigns ticket
-> if needed, creates admin note or service command
-> ticket status changes pending_customer/resolved/closed
```

Expected result:

- CRM is customer service, not HR;
- complaints connect to the real service/account involved.

### Journey 5: Review Watchdog Alert

```txt
Admin opens Watchdog
-> filters danger/critical events
-> opens event detail
-> sees affected user/service/payment/job/provider
-> dismisses, escalates, or creates admin command
-> AuditLog records review decision
```

Expected result:

- watchdog informs admins;
- destructive actions still go through command layer.

### Journey 6: Manage Discounts

```txt
Billing admin opens Billing / Discounts
-> creates coupon or reviews existing coupon
-> sets scope, duration, expiry, max redemptions
-> applies/revokes with reason
-> redemption history is visible
-> AuditLog/AdminCommand records changes
```

Expected result:

- discounts are visible and controlled;
- discounts affect billing amount only, not admin/service blocks.

### Journey 7: Check Provider Health

```txt
Admin opens Settings or Services Provider Health
-> sees provider status for hosting/domain/VPS/email/payment
-> sees last sync run and failures
-> can force sync if permitted
-> provider failures create WatchdogEvent
```

Expected result:

- external provider issues are visible before customers complain.

## Overview Screen

Purpose: at-a-glance command center.

Cards:

```txt
total customers
active customers
suspended/disabled customers
active services
suspended services
overdue services
pending receipts
open tickets
critical watchdog flags
deployment failures
monthly paid revenue
```

Tables/widgets:

```txt
recent activity
recent admin commands
latest tickets
services needing attention
watchdog critical flags
warnings needing attention
```

Actions:

```txt
open customer
open service
open receipt review
open ticket
run watchdog scan
open warnings
```

Add business operations widgets:

```txt
customers stuck onboarding
open incidents
provider health
scheduled maintenance
recent invoices
available reports/exports
system health
```

## Customers Screen

Table columns:

```txt
name/email
role
account status
active services count
overdue services count
open tickets count
last activity
created date
actions
```

Filters:

```txt
status
role
has overdue services
has open tickets
search by name/email/id
```

Actions:

```txt
open customer detail
suspend
reactivate
disable
soft delete
add admin note
```

## Customer Detail Drawer/Page

This is the most important admin UI.

Sections:

```txt
Profile
Account Status
Billing Summary
Service Access
Deployments
Domains
VPS
Orders
Receipts
Tickets
Activity Timeline
Admin Commands
Watchdog Flags
Admin Notes
```

Header:

```txt
customer name
email
role
account status badge
created date
quick actions
```

Quick actions:

```txt
suspend user
reactivate user
disable user
soft delete user
add note
create ticket
```

Rules:

- Never show password hash.
- Never show raw file paths.
- Show ID/photo presence with safe preview routes only.

## Services Screen

Purpose: unified monitor for all services.

Rows use common service shape:

```txt
service type
service name
owner
provider
service status
access status
billing status
admin status
plan
expires/due date
last activity
actions
```

Filters:

```txt
service type
access status
billing status
admin status
owner
provider
search
```

Actions:

```txt
open service
open customer
suspend access
reactivate access
cancel service
mark review required
add note
```

## Deployments Screen

Deployment-specific monitor.

Columns:

```txt
deployment ID
service name
owner
source
status
payment status
access status
Render service ID
live URL
plan
billing due date
created date
actions
```

Actions:

```txt
open live URL
open logs
suspend
reactivate
mark paid
manual renew
delete/cancel
set Render plan
open customer
```

## Domains Screen

Columns:

```txt
domain
owner
provider
status
payment status
access status
auto renew
expires at
renews at
actions
```

Actions:

```txt
open customer
sync provider status
open DNS details
mark review required
open related tickets
```

## VPS Screen

Columns:

```txt
label
hostname
owner
region
plan
OS
main IP
provider status
payment status
access status
monthly price
created date
actions
```

Actions:

```txt
open customer
view action logs
sync provider status
suspend access
reactivate access
open related tickets
```

## Billing And Receipts Screens

Billing screen shows:

```txt
orders
subscriptions
overdue services
payment failures
manual renewals
discount/admin billing commands
```

Receipt screen shows:

```txt
pending receipts
approved receipts
rejected receipts
linked customer
linked service/deployment
amount
uploaded date
review actions
```

Receipt actions:

```txt
view receipt
approve
reject with note
open customer
open order
```

## Tickets Screen

Columns:

```txt
subject
customer
category
priority
status
related service
assigned admin
last update
created date
actions
```

Actions:

```txt
open ticket
reply
assign
change status
resolve
close
open customer
open related service
```

## Activity Screen

Activity screen should combine:

```txt
AuditLog events
AdminCommand events
important Watchdog events
```

Filters:

```txt
actor
actor type
action
entity type
entity ID
status
date range
```

## Invoices Screen

Purpose: customer-facing billing documents and tax records.

Columns:

```txt
invoice number
customer
status
subtotal
discount
tax
total
amount due
issued date
paid date
actions
```

Actions:

```txt
open invoice
download PDF
send/resend invoice
open related order/payment
open credit note/refund
```

## Health Screen

Purpose: provider, service, incident, SLA, and system health.

Sections:

```txt
service health checks
provider health
open incidents
recent incidents
scheduled maintenance
uptime/SLA summary
system health
recent critical errors
```

Actions:

```txt
open incident
create incident
post incident update
mark incident resolved
schedule maintenance
force provider sync
open related services/users
```

## Reports Screen

Purpose: export business and operations data safely.

Report types:

```txt
customers
services
billing orders
invoices
payments
discount redemptions
tickets
watchdog events
audit logs
analytics summary
provider sync runs
```

Actions:

```txt
choose date range
apply filters
create export job
view export status
download export
delete expired export
```

Rules:

- Show permission warnings for sensitive exports.
- Never show raw filesystem paths.
- Export rows must be scrubbed of secrets.

## Watchdog Screen

Columns:

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
add note
create admin command if needed
```

## Warnings Screen

Purpose: show slow or repeated weak signals before they become watchdog events or incidents.

Warning categories:

```txt
slow requests
slow database
high 401 count
high 403 count
API probe spike
analytics spam
ticket spam
checkout spam
provider latency
slow jobs
```

Columns:

```txt
warning type
route/service
count
average duration
peak duration
first seen
last seen
severity
recommended action
status
```

Actions:

```txt
open details
dismiss
escalate to WatchdogEvent
open related logs/activity
open related route/service/user if known
```

Rules:

- Warnings are separate from Watchdog critical events.
- Repeated or high-threat warnings can be escalated.
- Dismissed warnings remain in history.

## Settings Screen

Settings should show:

```txt
current admin profile
integration config status
dashboard preferences
feature flags
provider status
CRM/email placeholder status
```

## Implementation Steps

1. Keep `/dashboard` as mounted admin shell.
2. Update sidebar labels and add `Services` and `Watchdog`.
3. Add API client methods for services, service access, tickets, admin commands, watchdog, analytics.
4. Build customer detail as the central drawer/page.
5. Build unified Services view.
6. Replace placeholder Tickets with real tickets.
7. Add Watchdog view.
8. Add Admin Commands panel inside Activity and customer detail.
9. Add analytics cards to Overview.
10. Hide or redirect old main-site `AdminPage`.

## Acceptance Criteria

- `/dashboard` is the visible admin command center.
- Admin can open a customer and see all related records.
- Admin can monitor all services from one Services screen.
- Admin can review tickets and watchdog flags.
- Admin actions are visible as commands.
- No HR/applicant language remains in active CRM/customer service screens.
