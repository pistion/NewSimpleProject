# 10 - Analytics Layer Implementation Plan

## Goal

Create an analytics layer that helps the admin dashboard understand how customers use GlondiaSites: account activity, service usage, deployments, billing conversion, tickets, and customer behavior.

Analytics is for reporting and insight. It must not be the source of truth for service access or billing.

## Core Rule

Analytics observes.

Audit logs prove.

ServiceAccess controls.

Billing records charge.

## Required Table

Use `AnalyticsEvent` from `01-data-backbone.md`.

Analytics events should be lightweight and safe.

Never store:

```txt
passwords
tokens
secrets
full card data
CVV
raw receipt paths
raw private file paths
large page content
private customer documents
```

## Analytics Event Types

Customer journey:

```txt
page.viewed
nav.clicked
signup.started
signup.completed
login.completed
profile.updated
```

Builder:

```txt
builder.opened
builder.template_selected
builder.site_created
builder.site_edited
builder.deploy_clicked
```

Hosting:

```txt
hosting.deployment_started
hosting.deployment_succeeded
hosting.deployment_failed
hosting.settings_opened
hosting.logs_viewed
hosting.redeploy_clicked
```

Domains:

```txt
domain.search_started
domain.search_completed
domain.purchase_started
domain.purchase_completed
domain.dns_opened
domain.dns_updated
```

VPS:

```txt
vps.plan_viewed
vps.create_started
vps.create_completed
vps.action_clicked
```

Billing:

```txt
billing.checkout_started
billing.checkout_completed
billing.receipt_uploaded
billing.payment_failed
billing.payment_retried
```

Support:

```txt
support.ticket_started
support.ticket_created
support.ticket_replied
support.help_viewed
```

Dashboard/admin:

```txt
dashboard.opened
dashboard.customer_opened
dashboard.service_opened
dashboard.command_clicked
dashboard.watchdog_reviewed
```

## Backend Service

Create:

```txt
server/src/services/analyticsService.js
```

Required functions:

```js
async function trackEvent(input)
async function listAnalyticsEvents(filters)
async function getAnalyticsSummary(filters)
async function getCustomerAnalytics(userId, filters)
async function getServiceAnalytics(serviceType, serviceId, filters)
```

`trackEvent` input:

```js
{
  userId,
  organizationId,
  sessionId,
  eventType,
  entityType,
  entityId,
  path,
  metadata
}
```

Rules:

- Scrub sensitive fields.
- Ignore events with missing or unknown event type only if invalid.
- Do not throw user-facing errors if analytics write fails.
- Rate-limit or sample high-volume events later if needed.

## Customer Analytics API

Add:

```txt
POST /api/v1/analytics/events
```

Request:

```json
{
  "eventType": "builder.template_selected",
  "entityType": "template",
  "entityId": "template_x",
  "path": "/dashboard/builder",
  "metadata": {
    "templateName": "Business Site"
  }
}
```

Rules:

- Uses current authenticated user if available.
- Allows anonymous public events only if explicitly enabled.
- Never trusts client-submitted `userId`.
- Backend sets `userId` from `req.user.id`.

## Admin Analytics API

Add:

```txt
GET /api/admin/analytics/summary
GET /api/admin/analytics/events
GET /api/admin/users/:userId/analytics
GET /api/admin/services/:serviceType/:serviceId/analytics
```

Filters:

```txt
eventType
userId
organizationId
entityType
entityId
dateFrom
dateTo
limit
offset
```

Summary response:

```json
{
  "activeUsers": 0,
  "newSignups": 0,
  "deploymentsStarted": 0,
  "deploymentsSucceeded": 0,
  "deploymentsFailed": 0,
  "checkoutStarted": 0,
  "checkoutCompleted": 0,
  "ticketsCreated": 0,
  "topEvents": [],
  "dailyCounts": []
}
```

## Dashboard UI

Add analytics cards to Overview:

```txt
active users
new signups
deployments started
deployment success rate
checkout conversion
open tickets
failed payments
top services
```

Add Analytics page later, or add under Activity in v1.

## Reporting And Export

Follow `16-business-operations-and-reporting.md` for admin reports and exports.

Analytics summaries should support:

```txt
customer acquisition
onboarding funnel
checkout conversion
service usage
deployment success/failure
ticket volume
watchdog trends
revenue summaries from billing/invoices
```

Exports should be generated through `ExportJob`, not by dumping raw database tables from the UI.

Rules:

- Exports require admin permission.
- Sensitive exports require stronger role permission.
- Export files expire.
- Export output must scrub secrets and raw private paths.

Customer detail should show:

```txt
last active
recent pages/actions
service usage
deployment attempts
billing attempts
support interactions
```

Service detail should show:

```txt
views
actions
failed attempts
settings changes
redeploy clicks
logs viewed
```

## Frontend Tracking Points

Main customer app should track:

```txt
login success
signup success
dashboard opened
builder opened
template selected
deployment started
deployment completed/failed
billing checkout started/completed
receipt uploaded
ticket created
domain search/purchase
VPS create started/completed
```

Admin dashboard should track:

```txt
dashboard opened
customer detail opened
service detail opened
ticket opened
admin command clicked/executed
watchdog reviewed
billing receipt opened
```

## Interaction Analytics

The diagram mentions clicks and mouse movement. Capture the useful part of that idea without building a privacy-heavy raw recorder.

V1 should track:

```txt
click events on important buttons/links
page and section views
form step completion
checkout/deployment/ticket milestones
failed access attempts
service action attempts
```

Optional later heatmap mode can track:

```txt
coarse scroll depth
coarse pointer zones
rage-click count
time on section
abandoned form step
```

Do not track raw continuous mouse coordinates in v1. If heatmap mode is added later, it must be controlled by `AdminPolicy`, sampled, anonymized where possible, and scrubbed of typed text, payment fields, passwords, tokens, private keys, and customer documents.

Keep tracking meaningful product events first. The admin dashboard needs to understand customer behavior, service usage, and conversion, not replay private sessions.

## Analytics Vs AuditLog

Use `AuditLog` for:

```txt
security
proof
admin actions
billing decisions
service state changes
permission checks
```

Use `AnalyticsEvent` for:

```txt
usage behavior
page/product interaction
conversion funnels
dashboard reporting
non-security product insights
```

If an event changes data, it probably needs `AuditLog`.

If an event only observes behavior, it probably needs `AnalyticsEvent`.

## Privacy And Retention

V1:

- Store analytics indefinitely unless storage becomes an issue.
- Do not store raw personal documents.
- Do not store secrets.
- Do not store full request bodies.

Future:

- Add retention cleanup for old raw analytics events.
- Keep aggregated summaries longer than raw events.

## Implementation Steps

1. Add `AnalyticsEvent` model.
2. Create `analyticsService.js`.
3. Add customer event tracking endpoint.
4. Add admin analytics endpoints.
5. Add backend scrubber for analytics metadata.
6. Add simple frontend `trackAnalyticsEvent` helper in main app.
7. Add simple dashboard tracking helper.
8. Track key events only.
9. Add dashboard overview analytics summary cards.
10. Add customer detail analytics section.

## Acceptance Criteria

- Customer app can send analytics events.
- Backend attaches current user from auth.
- Admin dashboard can read analytics summary.
- Customer detail shows recent analytics activity.
- Sensitive values are scrubbed.
- Analytics failures do not break customer actions.
- AuditLog remains the source for admin/security proof.
