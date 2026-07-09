# 04 - Service Access Gate Implementation Plan

## Goal

Create the rule layer that decides whether a customer can use a service right now.

This is the middleware and service logic between:

```txt
user login
payment status
admin restrictions
service state
actual service action
```

Every protected service must ask one question before doing work:

```txt
Can this user access this service right now?
```

## Access Pass Model

The "token/pass" from the diagram should be implemented as a database access pass, not as a reusable public secret.

Use the `ServiceAccess` row as the pass:

```txt
userId + serviceType + serviceId
accessStatus
billingStatus
adminStatus
startsAt
expiresAt
subscriptionId
checkoutOrderId
```

This gives the system a monthly renewable pass for each service. When payment succeeds, the pass becomes active and gets a valid expiry window. When payment expires, admin blocks it, or watchdog requires review, middleware reads the updated database state and blocks or warns before the service runs.

Do not create a separate long-lived service token unless a specific downstream provider requires it. If a provider token is needed, store it encrypted/sealed in a provider integration table and never expose it to the dashboard list screens.

## Current State

The app already has:

- `authMiddleware`
- account status blocking for suspended/disabled/deleted users
- `requireAdmin`
- deployment ownership middleware
- deployment payment status fields
- admin suspend/reactivate functions
- cleanup/enforcement job for unpaid deployments

Missing piece:

- a single `ServiceAccess` gate that all service modules use.

## Service Access Decision

A user can access a service only when all are true:

```txt
User is authenticated
User accountStatus is active
ServiceAccess row exists
ServiceAccess.userId matches current user, unless admin
ServiceAccess.accessStatus is active
ServiceAccess.adminStatus is allowed
ServiceAccess.billingStatus is paid, trial, or free
ServiceAccess.expiresAt is null or in the future
```

If user is admin:

```txt
Admin can view and manage service through admin APIs.
Admin should not use customer service APIs unless the route explicitly allows admin bypass.
Admin commands still need to be audited.
```

## Service Access Status Meaning

```txt
pending:
service requested but not ready or not paid

active:
customer can use it

suspended:
temporarily blocked, reversible

expired:
time/payment period ended

cancelled:
customer/admin cancelled service

deleted:
service record kept for history, not usable
```

## Billing Status Meaning

```txt
trial:
allowed during trial/grace period

pending:
payment not complete

payment_uploaded:
manual receipt uploaded, waiting for admin

paid:
payment is good

overdue:
payment deadline passed

failed:
payment provider failed

cancelled:
billing cancelled

free:
free service or admin-granted free access
```

## Admin Status Meaning

```txt
allowed:
normal

blocked:
admin explicitly blocks service regardless of payment

review_required:
watchdog/admin wants review; service may remain active or be restricted depending on policy
```

For v1:

```txt
review_required does not block by itself.
blocked blocks immediately.
```

## Policy-Controlled Behavior

Before optional automation runs, read `AdminPolicy`.

Examples:

```txt
service.hosting.require_paid_access = true
service.domain.require_paid_access = true
service.vps.auto_suspend_on_expiry = true
watchdog.can_mark_review_required = true
```

The gate must remain deterministic:

- `ServiceAccess` decides the current state of one service.
- `AdminPolicy` decides whether optional platform rules are enabled.
- `AdminCommand` records who changed a service or policy.
- `AuditLog` records proof of important decisions.

## Backend Service: serviceAccessService

Create:

```txt
server/src/services/serviceAccessService.js
```

Required functions:

```js
async function getServiceAccess({ serviceType, serviceId })
async function getUserServiceAccess({ userId, serviceType, serviceId })
async function listUserServiceAccess(userId)
async function listAllServiceAccess(filters)
async function ensureServiceAccess({ userId, serviceType, serviceId, action })
async function upsertServiceAccess(input)
async function activateServiceAccess(input)
async function suspendServiceAccess(input)
async function reactivateServiceAccess(input)
async function expireServiceAccess(input)
async function cancelServiceAccess(input)
async function syncFromOrder(order)
async function syncFromDeployment(deployment)
async function syncFromVps(vpsService)
async function syncFromBusinessService(businessService)
```

`ensureServiceAccess` returns:

```js
{
  allowed: true,
  access: serviceAccessRow
}
```

or throws an HTTP-style error:

```js
{
  status: 403,
  code: "SERVICE_ACCESS_DENIED",
  message: "This service is not active."
}
```

Error codes:

```txt
SERVICE_ACCESS_NOT_FOUND
SERVICE_ACCESS_DENIED
SERVICE_ACCESS_SUSPENDED
SERVICE_ACCESS_EXPIRED
SERVICE_PAYMENT_REQUIRED
SERVICE_ADMIN_BLOCKED
SERVICE_OWNER_MISMATCH
```

## Middleware

Create:

```txt
server/src/middleware/serviceAccess.middleware.js
```

Middleware factory:

```js
requireServiceAccess({ serviceType, serviceIdParam, action })
```

Example use:

```js
router.post(
  '/:deploymentId/redeploy',
  authMiddleware,
  requireServiceAccess({
    serviceType: 'hosting',
    serviceIdParam: 'deploymentId',
    action: 'redeploy'
  }),
  controller.redeploy
);
```

Rules:

- Must run after `authMiddleware`.
- Must load access record by `serviceType + serviceId`.
- Must compare `access.userId` with `req.user.id`.
- Admin bypass is allowed only when `allowAdminBypass: true` is passed.
- Store loaded row on `req.serviceAccess`.

## Where To Apply In V1

Apply to customer-facing operations first:

Hosting/deployments:

```txt
redeploy
restart
sync
settings update
env update
domain attach
logs
metrics
secret files
headers/routes
```

VPS:

```txt
start
halt
reboot
resize
reinstall
destroy
details
```

Domains:

```txt
DNS edit
nameserver update
renew
auto-renew update
```

Email hosting later:

```txt
mailbox create
mailbox suspend
DNS/mail settings
```

Do not block public routes like pricing pages, landing page, support contact form, or auth.

## Admin Override Behavior

Admin actions must use admin routes, not customer routes.

Admin route behavior:

- `requireAdmin` verifies admin role.
- Admin action creates `AdminCommand`.
- Admin action updates service record and `ServiceAccess`.
- Admin action writes `AuditLog`.
- User notification is created when customer should know.

Example:

```txt
Admin suspends deployment
-> AdminCommand SUSPEND_SERVICE
-> Render service suspended if configured
-> deployment record status suspended
-> ServiceAccess accessStatus suspended
-> AuditLog admin.deployment.suspended
-> User notification service suspended
```

## Background Enforcement

Create/update enforcement job that checks:

```txt
ServiceAccess.expiresAt < now
billingStatus not paid/free/trial
accessStatus active
```

Then:

```txt
set billingStatus overdue
set accessStatus suspended or expired
create WatchdogEvent
create AuditLog
notify user
```

For hosting deployments, also call provider suspend when safe.

## Dashboard Requirements

Dashboard needs a Service Access monitor:

Columns:

```txt
service type
service name
owner
owner email
access status
billing status
admin status
plan
expires at
last activity
actions
```

Actions:

```txt
suspend
reactivate
mark paid
cancel
open customer
open service
add admin note
```

## API Requirements

Admin endpoints:

```txt
GET /api/admin/service-access
GET /api/admin/service-access/:id
GET /api/admin/users/:userId/service-access
POST /api/admin/service-access/:id/suspend
POST /api/admin/service-access/:id/reactivate
POST /api/admin/service-access/:id/cancel
POST /api/admin/service-access/:id/block
POST /api/admin/service-access/:id/unblock
```

Customer endpoint:

```txt
GET /api/v1/service-access
```

The customer endpoint returns only the current user's access records.

## Implementation Steps

1. Add `ServiceAccess` table.
2. Add backfill script.
3. Add `serviceAccessService`.
4. Add `requireServiceAccess` middleware.
5. Connect payment approval and PayPal capture to access activation.
6. Connect admin suspend/reactivate/delete to access state changes.
7. Add admin API routes.
8. Add customer API route.
9. Apply middleware to critical hosting routes first.
10. Expand to VPS/domains/email after hosting is verified.

## Acceptance Criteria

- Customer cannot access a suspended service.
- Customer cannot access another user's service.
- Paid active service works.
- Admin can suspend/reactivate through admin API.
- Payment approval activates access.
- Expiry/overdue state blocks access.
- Every access-changing action writes `AuditLog`.
- Dashboard can list all service access records with owner info.
