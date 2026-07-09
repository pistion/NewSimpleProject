# 05 - Service Records Implementation Plan

## Goal

Define how each GlondiaSites service is represented, tracked, connected to users, connected to billing, and monitored by the admin dashboard.

Services are the things customers buy or use:

```txt
hosting deployments
domains
VPS hosting
email hosting
builder projects/sites
support/tickets
```

Every service must connect to:

```txt
userId
organizationId
serviceId
billing/order data
ServiceAccess
activity/audit logs
dashboard monitoring
```

## Current State

Existing service-related data:

- Hosting deployments are partly stored in the JSON hosting store.
- `WebHostingService` exists in Prisma.
- `VpsService` exists in Prisma.
- `BusinessService` exists in Prisma for domains, email, SSL, etc.
- `CheckoutOrder` links billing to service/deployment.
- `DeploymentSubscription` tracks deployment renewal periods.

The admin dashboard currently reads deployments through `/api/admin/deployments`, and admin service functions map deployment store records into dashboard rows.

Production goal:

- Keep current flows working.
- Normalize enough data so dashboard monitoring is reliable.
- Use `ServiceAccess` as the common status/access layer.

## Common Service Record Contract

Every service type must be representable in dashboard with this common shape:

```js
{
  serviceType,
  serviceId,
  serviceName,
  userId,
  organizationId,
  provider,
  providerServiceId,
  status,
  billingStatus,
  accessStatus,
  adminStatus,
  planId,
  checkoutOrderId,
  createdAt,
  updatedAt,
  lastActivityAt,
  metadata
}
```

Dashboard should use this shape for service monitor tables.

## Provider Integration Layer

Each service may depend on an external provider:

```txt
hosting/deployments -> Render or deployment provider
domains -> registrar provider such as Spaceship or Namecheap
VPS -> VPS/cloud provider
email hosting -> email provider
payments -> PayPal/manual receipt/Stripe future
```

Do not scatter provider credentials or provider-specific logic across random controllers. Use provider integration modules.

Recommended structure:

```txt
server/src/services/providers/providerRegistry.js
server/src/services/providers/renderProvider.js
server/src/services/providers/domainRegistrarProvider.js
server/src/services/providers/vpsProvider.js
server/src/services/providers/emailHostingProvider.js
```

Common provider functions:

```js
async function createService(input)
async function suspendService(input)
async function reactivateService(input)
async function deleteService(input)
async function getServiceStatus(input)
async function syncService(input)
async function listProviderEvents(input)
```

Provider records:

```txt
ProviderIntegration:
provider name, service type, environment, status, safe config metadata, last health check

ProviderSyncRun:
provider name, service type, startedAt, finishedAt, status, records checked, records updated, error summary
```

Security rules:

- Store provider secrets only in environment variables or a secrets manager.
- Do not store API keys in normal Prisma tables.
- Dashboard provider status endpoints may show health/status, never secrets.
- Provider failures should create `WatchdogEvent` records.
- Provider state should sync into service records and `ServiceAccess`, not replace them.

Dashboard requirements:

```txt
provider health by service type
last successful sync
failed provider calls
services out of sync
manual force-sync action
```

## Hosting / Deployment Records

Current source:

- JSON hosting store
- existing deployment billing functions
- `DeploymentSubscription`
- possibly `WebHostingService`

For v1, do not migrate all hosting deployment storage at once. Instead:

1. Keep JSON hosting store as active deployment operational store.
2. Backfill each deployment into `ServiceAccess`.
3. Optionally create or sync `WebHostingService` for each platform deployment.
4. Admin dashboard reads a merged view.

Mapping:

```txt
serviceType = hosting
serviceId = deployment.deploymentId
serviceName = deployment.serviceName
userId = deployment.userId
provider = render
providerServiceId = deployment.renderServiceId
status = deployment.status
billingStatus = deployment.paymentStatus
checkoutOrderId = deployment.checkoutOrderId
planId = deployment.billingTierId or deployment.renderPlan
```

Hosting statuses:

```txt
queued
building
deployed
live
failed
error
suspended
account_deleted
deleted
```

Map to access:

```txt
live/deployed + paid/trial/free -> access active
building/queued -> access pending
failed/error -> access pending or suspended depending on billing
suspended -> access suspended
deleted/account_deleted -> access deleted/cancelled
```

Required dashboard row fields:

```txt
deploymentId
owner user/email
service name
source
status
payment status
access status
render service ID
live URL
plan
billing due date
created date
actions
```

Admin actions:

```txt
suspend deployment
reactivate deployment
mark paid
renew manually
delete/cancel
set Render plan
force sync
open logs
open customer
```

## Domain Records

Current source:

- `BusinessService` with `type = domain`
- domain routes and provider routes

Domain service mapping:

```txt
serviceType = domain
serviceId = BusinessService.id
serviceName = BusinessService.name
provider = spaceship or configured registrar
providerServiceId = BusinessService.providerServiceId
status = BusinessService.status
billingStatus = BusinessService.paymentStatus
renewsAt/expiresAt = BusinessService renewal fields
```

Domain statuses:

```txt
pending
active
expired
suspended
cancelled
deleted
transfer_pending
```

Admin dashboard domain row fields:

```txt
domain name
owner user/email
registrar/provider
status
payment status
access status
auto renew
expires at
renews at
actions
```

Admin actions:

```txt
view domain
sync registrar status
disable auto renew
mark review required
suspend domain service record
open customer
open ticket
```

Do not implement destructive registrar actions in v1 unless already supported safely.

## VPS Records

Current source:

- `VpsService`
- `VpsActionLog`
- VPS controller/service

VPS mapping:

```txt
serviceType = vps
serviceId = VpsService.id
serviceName = VpsService.label
provider = vultr
providerServiceId = providerInstanceId
status = VpsService.status
billingStatus = VpsService.paymentStatus
checkoutOrderId = VpsService.checkoutOrderId
planId = VpsService.plan
```

VPS statuses:

```txt
pending
active
running
stopped
suspended
destroyed
failed
```

Admin dashboard VPS row fields:

```txt
label
hostname
owner user/email
region
plan
OS
main IP
status
payment status
access status
monthly cost
created date
actions
```

Admin actions:

```txt
view VPS
sync provider status
suspend access
reactivate access
open action logs
open customer
open ticket
```

Provider-level destructive VPS actions should remain explicit and audited.

## Email Hosting Records

Current source:

- likely future `BusinessService` with `type = email`

Email service mapping:

```txt
serviceType = email
serviceId = BusinessService.id
serviceName = BusinessService.name
provider = configured email provider
providerServiceId = BusinessService.providerServiceId
status = BusinessService.status
billingStatus = BusinessService.paymentStatus
```

Email statuses:

```txt
pending
active
suspended
expired
cancelled
deleted
```

Dashboard fields:

```txt
domain/mail service name
owner
mailboxes count
provider
status
billing status
access status
expires at
actions
```

V1 can include email as a placeholder service type if provider integration is not ready.

## Builder Projects / Sites

Current source:

- builder local/API code
- generated template site store
- deployment flow

Builder records should be monitored separately from hosting deployments.

Mapping:

```txt
serviceType = builder
serviceId = siteId or projectId
serviceName = siteName/project name
userId = owner user
status = draft | published | deployed | archived
billingStatus = free or inherited from hosting deployment
```

Rules:

- Builder editing may be free or plan-gated.
- Published/deployed hosting must still use `hosting` access.
- Builder records should link to deployment when deployed.

Dashboard fields:

```txt
site/project name
owner
status
template/source
linked deployment
created date
last updated
actions
```

## Support/Ticket Service Records

Support is not a paid service in v1, but it is still monitored.

Mapping:

```txt
serviceType = support
serviceId = ticket.id
userId = ticket.userId
status = ticket.status
billingStatus = free
accessStatus = active
```

This allows admin dashboard to treat support as part of the customer service layer.

## Service Aggregation API

Create admin endpoint:

```txt
GET /api/admin/services
```

Query filters:

```txt
serviceType
userId
organizationId
accessStatus
billingStatus
adminStatus
status
search
limit
offset
```

Response:

```json
{
  "items": [],
  "summary": {
    "total": 0,
    "active": 0,
    "suspended": 0,
    "overdue": 0,
    "pending": 0
  }
}
```

Each item should use the common service record contract.

## Customer APIs

Customer service list:

```txt
GET /api/v1/services
```

Returns only services belonging to current user.

Optional filters:

```txt
serviceType
status
```

## Implementation Steps

1. Implement common service record mapper.
2. Add `GET /api/admin/services`.
3. Add `GET /api/v1/services`.
4. Backfill/sync hosting deployments into `ServiceAccess`.
5. Sync `VpsService` into `ServiceAccess`.
6. Sync `BusinessService` into `ServiceAccess`.
7. Add service summary cards to admin dashboard.
8. Add service monitor table.
9. Link service rows to customer detail.
10. Add service-specific actions through admin command layer.

## Acceptance Criteria

- Admin can see all services across hosting, domains, VPS, email, builder, and support.
- Every visible service row has an owner where possible.
- Every controlled service has a `ServiceAccess` row.
- Dashboard clearly shows service status, billing status, and access status separately.
- Customer can only see their own services.
- Admin service actions create `AdminCommand` and `AuditLog`.
- Existing deployment, VPS, and domain flows continue to work.
