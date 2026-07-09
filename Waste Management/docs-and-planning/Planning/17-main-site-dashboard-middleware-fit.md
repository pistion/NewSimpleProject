# 17 - Main Site, Admin Dashboard, And Middleware Protection Fit

## Goal

Explain how the implementation plan fits the real GlondiaSites main site and isolated admin dashboard, and define the middleware layer needed to protect APIs, database-backed services, account details, authentication, and provider surfaces from unwanted outside requests.

This plan is based on the current app shape:

```txt
main customer site:
src/*
dist/*
landing/*

main Express server:
server/src/server.js

admin dashboard frontend:
admin-dashboard/frontend
served at /dashboard and /dashboard-assets

admin/customer APIs:
/api/*
/api/v1/*
```

## How The Plan Fits The Existing Build

The current server already mounts:

```txt
/api/v1/public
/api/v1/auth
/api/v1/workspaces
/api/v1/domains
/api/v1/templates
/api/v1/events
/api/v1/vps-hosting
/api/deployments
/api/hosting
/api/payments
/api/admin
/api/notifications
/dashboard
/dashboard-assets
```

Production fit:

```txt
Main site:
customer-facing login, signup, profile, products, checkout, hosting/domain/VPS/email usage, tickets

Admin dashboard:
admin-only monitoring and command center, using /api/admin and future admin APIs

Shared backend:
auth, billing, service access, watchdog, notifications, jobs, provider integrations, audit logs
```

The admin dashboard shell at `/dashboard` may be served publicly as static HTML, but dashboard data APIs must remain protected by:

```txt
authMiddleware
requireAdmin
future requirePermission
future requireRecentMfa for sensitive actions
```

The dashboard should not contain secrets in the HTML/JS bundle. It should only call protected APIs.

## Existing Middleware Observations

Current useful middleware:

```txt
authMiddleware:
JWT auth, account status blocking, dev fallback outside production

requireAdmin:
role === admin gate

auditWrites:
audits write requests and redacts sensitive fields through auditLogService

requestId:
request ID support

featureFlag:
feature gates

deploymentOwnership:
deployment owner protection

providerApiGuard:
provider token + per-IP/per-path rate limit for some provider routes
```

Current gaps to plan for:

```txt
no general rate-limit middleware across auth/tickets/checkout/admin/analytics
no slow-request warning middleware
no general API threat classifier/tagger
no repeated threat escalation into WatchdogEvent
no service access middleware applied uniformly across all paid service actions
no permission matrix middleware yet
no recent-MFA middleware yet
no public/private route registry to clarify API exposure
```

## Middleware Stack To Add

Create these middleware/services:

```txt
server/src/middleware/securityContext.middleware.js
server/src/middleware/rateLimit.middleware.js
server/src/middleware/threatTag.middleware.js
server/src/middleware/slowRequestWarning.middleware.js
server/src/middleware/serviceAccess.middleware.js
server/src/middleware/requirePermission.middleware.js
server/src/middleware/requireRecentMfa.middleware.js
server/src/services/security/requestRiskService.js
server/src/services/watchdog/watchdogSignalService.js
```

Recommended order in `server/src/server.js`:

```txt
raw webhook routes first where needed
cors
json parser
requestId
securityContext
slowRequestWarning start timer
rateLimit for public/auth/high-risk groups
responseHelper
auditWrites
routes
error handler
```

For route-specific protection, apply more specific middleware inside route files:

```txt
auth routes:
authRateLimit
threatTag('auth')

admin routes:
authMiddleware
requireAdmin
adminRateLimit
requirePermission for sensitive commands
requireRecentMfa for destructive actions
threatTag('admin')

service routes:
authMiddleware
serviceAccessMiddleware
resourceOwnershipMiddleware
threatTag('service_access')

analytics/events routes:
analyticsRateLimit
payloadSizeLimit
threatTag('analytics')

webhook routes:
raw body parser
signature verification
webhookReplayProtection
webhookIdempotency
threatTag('webhook')
```

## API Request Classification

Every API request should be classified into a security group:

```txt
public_read:
low risk public pages/content

public_write:
lead/contact/signup-style actions

auth:
login, signup, refresh, password reset, MFA

customer_account:
profile, account details, ID photo/avatar, password changes

customer_service:
hosting/domain/VPS/email/builder actions

billing:
checkout, receipts, invoices, payment methods

support:
tickets, messages, CRM customer conversations

analytics:
event tracking, behavior events

admin_read:
dashboard reads

admin_write:
admin commands and mutations

provider:
Render/domain/VPS/email/payment provider-facing endpoints

webhook:
provider callbacks
```

The request classification should be added to request context:

```txt
req.securityContext.group
req.securityContext.actorType
req.securityContext.riskScore
req.securityContext.watchdogTags
```

## Watchdog Tagging For Unwanted Requests

Do not create a `WatchdogEvent` for every bad request. Most unwanted requests should be tagged and counted quietly.

Use three levels:

```txt
tag_only:
record lightweight counter/metadata, no dashboard alert

warning:
create warning signal or dashboard warning when repeated or slow

high_threat:
create WatchdogEvent immediately or after a low threshold
```

Tag examples:

```txt
auth.invalid_token
auth.missing_token
auth.failed_login
auth.bruteforce_suspected
admin.forbidden_attempt
admin.permission_denied
admin.mfa_required_failed
service.owner_mismatch
service.access_denied
service.disabled_access_attempt
billing.checkout_spam
billing.webhook_invalid_signature
billing.webhook_duplicate
analytics.event_spam
support.ticket_spam
provider.invalid_token
provider.rate_limited
api.route_not_found
api.method_not_allowed
api.payload_too_large
api.slow_request
db.slow_query
db.error
```

## When To Create WatchdogEvent

Create `WatchdogEvent` only when risk is repeated, high threat, or site-impacting.

Immediate high-threat events:

```txt
billing.webhook_invalid_signature repeated from same source
admin.forbidden_attempt repeated against admin write routes
admin.policy_change_denied
service.owner_mismatch on sensitive service details
provider.invalid_token repeated
account.disabled_user_attempt_repeated
auth.bruteforce_suspected
db.error on critical service route
```

Repeated warning events:

```txt
many missing-token requests to protected APIs
many invalid-token requests from same IP
many 404 probes under /api
ticket creation spam
analytics batch spam
checkout attempts that fail validation repeatedly
slow requests above threshold repeatedly
provider sync repeatedly slow/failing
```

Do not create watchdog events for:

```txt
one normal 401
one customer typo/password failure
one public 404
normal slow request below warning threshold
normal validation error
expected duplicate webhook already handled idempotently
```

## Warning Section Requirement

Add a dashboard warning section separate from critical watchdog events.

Purpose:

```txt
show slow or repeated weak signals before they become incidents
```

Dashboard warning categories:

```txt
slow_requests
slow_database
high_401_count
high_403_count
api_probe_spike
analytics_spam
ticket_spam
checkout_spam
provider_latency
job_slow
```

Warning display:

```txt
warning type
affected route/service
count
average duration
peak duration
first seen
last seen
recommended action
severity
link to logs/watchdog/activity
```

Relationship:

```txt
Warnings:
early operational signals

WatchdogEvent:
reviewable security/service/payment issue

Incident:
customer-impacting outage or service degradation
```

## Slow Request And Slow Database Rules

Suggested thresholds:

```txt
api_slow_warning:
request duration > 1500ms

api_very_slow:
request duration > 5000ms

admin_slow_warning:
admin dashboard API > 2000ms

provider_slow_warning:
provider API call > 3000ms

db_slow_query_warning:
database query > 1000ms
```

Behavior:

- one slow request writes a warning counter;
- repeated slow requests create a dashboard warning;
- repeated very slow requests create `WatchdogEvent`;
- slow provider calls link to `ProviderSyncRun` or provider health;
- slow DB calls should never log query values containing secrets.

## Middleware Protection Boundaries

## Account Details Boundary

Protect:

```txt
/api/v1/auth/profile
/api/v1/auth/profile/id-photo
/api/v1/auth/profile/avatar
/api/v1/auth/profile/password
/api/v1/notifications
future /api/v1/payment-methods
future /api/v1/invoices
```

Required middleware:

```txt
authMiddleware
accountStatus check
rateLimit customer_account
payload/file validation
ownership/self-only check
auditWrites for writes
threatTag customer_account
```

Rules:

- never trust `userId` from body;
- use `req.user.id`;
- never expose raw file paths;
- password/email/security changes should require current password or recent MFA where applicable.

## Service Boundary

Protect:

```txt
/api/deployments
/api/hosting
/api/v1/vps-hosting
/api/v1/workspaces/:workspaceId/sites
/api/v1/workspaces/:workspaceId/domains
/api/v1/workspaces/:workspaceId/billing
```

Required middleware:

```txt
authMiddleware
workspace/service ownership
serviceAccessMiddleware for paid/controlled actions
featureFlag
rateLimit service_action
threatTag service_access
auditWrites for mutations
```

Rules:

- service reads must check ownership;
- service mutations must check ownership and access state;
- disabled/suspended services must block action and tag the attempt;
- repeated blocked attempts can become WatchdogEvent.

## Database And Internal Admin Boundary

Protect:

```txt
/api/admin/*
future /api/admin/exports
future /api/admin/system/*
future /api/admin/policies/*
```

Required middleware:

```txt
authMiddleware
requireAdmin
requirePermission
requireRecentMfa for destructive/sensitive actions
adminRateLimit
threatTag admin
auditWrites
```

Rules:

- admin list APIs must paginate;
- admin APIs must scrub sensitive fields;
- exports must expire and be permission-gated;
- policy/system endpoints should be super-admin only in v1.

## Provider/Webhook Boundary

Protect:

```txt
/api/payments/*
/api/v1/payments/paypal/webhook
/api/spaceship/*
/api/* provider Render routes
```

Required middleware:

```txt
providerApiGuard where direct provider controls exist
webhook signature verification for webhooks
webhook replay protection
webhook idempotency
providerRateLimit
threatTag provider/webhook
```

Rules:

- browser redirects cannot mark payment paid alone;
- provider secrets never return to frontend;
- repeated invalid provider tokens create warning/watchdog signal;
- duplicate webhooks are handled quietly unless volume becomes abusive.

## Main Site And Dashboard Fit

Main site should use:

```txt
customer APIs
service APIs
billing APIs
ticket APIs
notification APIs
```

Admin dashboard should use:

```txt
/api/admin/*
admin service access APIs
admin billing APIs
admin watchdog APIs
admin warning APIs
admin system health APIs
admin reports/export APIs
```

Do not let the admin dashboard call customer APIs with fake customer IDs to manage customers. It should use admin APIs that enforce admin permissions and audit actions.

## New API Surface For Warnings

Add:

```txt
GET /api/admin/warnings
GET /api/admin/warnings/summary
GET /api/admin/warnings/:warningId
POST /api/admin/warnings/:warningId/dismiss
POST /api/admin/warnings/:warningId/escalate
```

Warning escalation:

```txt
warning -> WatchdogEvent -> Incident if customer-impacting
```

## Acceptance Criteria

- Main customer site routes keep working.
- Admin dashboard can read admin APIs but cannot bypass admin auth.
- Protected APIs classify requests into security groups.
- Missing/invalid auth is counted and tagged, not spammed into watchdog events.
- Repeated/high-threat unwanted requests create `WatchdogEvent`.
- Slow repeated requests create warnings.
- Sensitive account APIs use `req.user.id`, not body user IDs.
- Service actions require ownership and service access.
- Admin writes require admin auth, permission, audit, and MFA where configured.
- Provider/webhook routes verify provider intent before mutating billing/service access.
- Dashboard has a warning section separate from critical watchdog/incidents.
