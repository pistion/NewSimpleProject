# Admin Customer Oversight Audit and Freeze

Date: 2026-07-13

Scope: Part 1 of `C:\Users\dpm\Desktop\admin_oversight_correction_plan`.

## Current Relationship Map

| Area | Current source | Ownership field | Current route | Problem |
|---|---|---|---|---|
| users | `users` via `User`; legacy `adminService.getUserDetail`, oversight `customer.repository.findCustomerById` | `User.id`; `clientId` is a human reference | `GET /api/admin/users/:userId`; `GET /api/admin/customers/:userId/overview` | Two admin readers exist. Oversight uses a safe select; legacy service still owns account lifecycle and detail shape. |
| projects | `client_projects` via `ClientProject`; `customer.repository.listCustomerProjects` | `userId` | Included in legacy detail and customer overview | Customer-scoped by `userId`; not paginated in overview. |
| VPS | `vps_services` via `VpsService`; `vps.repository` | `organizationId`; `createdByUserId`; access rows by `userId` | `GET /api/admin/customers/:userId/services`; `GET /api/admin/customers/:userId/operations` | Ownership has transitional tokens: customer `id` and `clientId` can both appear as `organizationId`. |
| hosting | JSON hosting store via `hostingStore`; relational `web_hosting_services` dual-read | JSON `deployment.userId`; DB `organizationId`, `createdByUserId` | `GET /api/admin/users/:userId`; `GET /api/admin/customers/:userId/services` | JSON store is still authoritative; relational rows are compared for drift, not primary yet. |
| domains | `business_services` rows where `type = domain`; `customer.repository` | `createdByUserId`; `organizationId`; optional `ServiceAccess.userId` | `GET /api/admin/customers/:userId/services` | Domain records are grouped with generic business services; access rows can be missing. |
| email | `business_services` rows where `type = email`; `customer.repository` | `createdByUserId`; `organizationId`; optional `ServiceAccess.userId` | `GET /api/admin/customers/:userId/services` | Same generic business-service storage as domains; access rows can be missing. |
| ServiceAccess | `service_access` via `serviceAccess.repository` | `userId`; `organizationId`; unique `serviceType + serviceId` | `GET /api/admin/service-access`; customer services/overview | Intended service index, but services can exist without access rows and are surfaced with warnings. |
| orders | `checkout_orders` via `billing.repository` and legacy `adminService` | `userId`; `organizationId`; `deploymentId` | `GET /api/admin/orders`; `GET /api/admin/customers/:userId/billing` | Customer billing reads by `userId` only for orders; overview summary currency uses first order or PGK fallback. |
| receipts | `payment_receipts` via `billing.repository`; streamed by `adminReceiptService` | `userId`; `checkoutOrderId`; `deploymentId` | `GET /api/admin/receipts`; `GET /api/admin/customers/:userId/billing` | Raw `filePath` is stripped in customer billing, but receipt streaming remains legacy service owned. |
| subscriptions | `deployment_subscriptions` via `billing.repository` | `userId`; `deploymentId` | `GET /api/admin/customers/:userId/billing` | Deployment subscription relationship is tied to deployment ids, not a first-class customer aggregate. |
| invoices | `invoices` and `invoice_line_items` via `billing.repository` | `userId`; `organizationId` | `GET /api/admin/customers/:userId/billing` | Uses `userId OR organizationId in scope`; may include transitional organization rows. |
| tickets | `tickets` via `ticketService.listAllTickets` | `userId`; `organizationId`; related service fields | `GET /api/admin/customers/:userId/support`; admin tickets routes | Oversight calls a service with Prisma access instead of a repository; acceptable current contract, but not pure route-controller-service-repository for support. |
| service requests | `service_requests` via `customer.repository` | `userId`; `organizationId`; also matched by `contactEmail` | `GET /api/admin/customers/:userId/support`; `/api/admin/crm/service-requests` | Email matching is useful for public-form intake but can broaden scope if emails change. |
| notifications | `notifications` via `operations.repository` | `userId` | `GET /api/admin/customers/:userId/operations` | Customer operations only reads non-deleted notifications by `userId`. |
| provider resources | `provider_resources` via `providerResource.repository` | `organizationId`; `userId`; `serviceId` | `GET /api/admin/customers/:userId/operations`; VPS admin internals | Shared provider account requires this ownership map; must stay in sync with provider actions. |
| health checks | `service_health_checks` via `operations.repository` | `serviceType`; `serviceId` | `GET /api/admin/customers/:userId/operations` | Scoped only after resolving customer services; no direct user or organization owner field. |
| incidents | `incidents` via `operations.repository` | `serviceType`; `serviceId` | `GET /api/admin/customers/:userId/operations` | Same derived scoping as health checks. |
| watchdog events | `watchdog_events` via `operations.repository`; direct admin routes in `admin.routes.js` | `userId`; `organizationId`; `serviceId` | `GET /api/admin/customers/:userId/operations`; `GET /api/admin/watchdog` | Customer view is repository-backed; dashboard queue routes still query Prisma directly in route handlers. |
| audit logs | `audit_logs` via `audit.repository`; `AdminCommand` via same repo for customer activity | `organizationId`; `actorUserId`; `entityId`; command text fields | `GET /api/admin/customers/:userId/activity`; `GET /api/admin/activity`; `GET /api/admin/commands` | Customer activity uses repository; legacy activity/command routes remain mixed in admin service/routes. |

## Current Route Contracts

All listed routes are mounted under `/api/admin`, require authenticated admin access, and return `{ data, requestId }` on success. Customer oversight controller errors return `{ error: { code, message }, requestId }`.

`GET /api/admin/users/:userId`

- Source: `adminService.getUserDetail`.
- Shape: legacy user detail object with safe `user`, `deployments`, `orders`, `receipts`, plus other legacy account detail fields.
- Compatibility test asserts `deployments`, `orders`, and `receipts` remain present.

`GET /api/admin/customers/:userId/overview`

- Source: `adminCustomerOversightService.getCustomerOverview`.
- Shape: `{ customer, summary, projects, services, billing, support, operations, activity, adminCommands, warnings }`.
- `summary` includes counts for projects, services, active/failed/suspended services, tickets, pending orders/receipts, `outstandingAmountCents`, `currency`, and warning count.
- Missing customer returns 404 with code `ADMIN_CUSTOMER_NOT_FOUND`.

`GET /api/admin/customers/:userId/services`

- Source: `getCustomerServices`.
- Shape: `{ services, warnings }`.
- Each service DTO includes `id`, `serviceType`, `serviceName`, `status`, `providerStatus`, `accessStatus`, `billingStatus`, `adminStatus`, `provider`, `plan`, `price`, `expiresAt`, `serviceAccessId`, `source`, `updatedAt`.

`GET /api/admin/customers/:userId/billing`

- Source: `getCustomerBilling`.
- Shape: `{ orders, receipts, subscriptions, invoices, creditNotes, paymentMethods }`.
- Receipts omit raw disk `filePath`; payment methods omit provider method ids and metadata.

`GET /api/admin/customers/:userId/support`

- Source: `getCustomerSupport`.
- Shape: `{ tickets, serviceRequests }`.
- Tickets come from `ticketService.listAllTickets({ userId, limit: 100 })`; service requests match by `userId` or current customer email.

`GET /api/admin/customers/:userId/operations`

- Source: `getCustomerOperations`.
- Shape: `{ providerResources, healthChecks, incidents, watchdogEvents, notifications }`.
- Provider resources are mapped to a safe DTO: `id`, `provider`, `resourceType`, `providerResourceId`, `name`, `status`, `serviceId`, `deletedAt`, `createdAt`.

`GET /api/admin/customers/:userId/activity`

- Source: `getCustomerActivity`.
- Query: `limit`, `offset`.
- Shape: `{ audit, adminCommands }`.
- `audit` is paginated `{ items, total, limit, offset }`; admin commands are newest first, limited to 25 by current service call.

## Direct Prisma Classification

Approved repository/database infrastructure:

- `server/src/services/db.js`: only shared `PrismaClient` singleton.
- `server/src/repositories/audit.repository.js`
- `server/src/repositories/billing.repository.js`
- `server/src/repositories/builder.repository.js`
- `server/src/repositories/customer.repository.js`
- `server/src/repositories/operations.repository.js`
- `server/src/repositories/providerResource.repository.js`
- `server/src/repositories/serviceAccess.repository.js`
- `server/src/repositories/vps.repository.js`
- `server/src/repositories/vpsAction.repository.js`

Approved current owning services and middleware outside the admin-oversight repository boundary:

- Auth/account/billing/payment/domain services: `authService`, `billingDashboardService`, `deploymentBillingService`, `deploymentPaypalService`, `deploymentPromoService`, `deploymentSubscriptionService`, `paypalBillingService`, `paypalWebhookService`, `projectService`, `ticketService`, `serviceRequestService`, `notificationService`, OAuth services, CRM contacts, and related middleware.
- These are not migrated by Part 1. They are existing operational owners and should be changed only when later plan files explicitly require it.

Legacy violations to migrate for admin boundary work:

- `server/src/routes/admin.routes.js`: direct Prisma use for warnings, watchdog events, commands, and policies in route handlers.
- `server/src/services/adminService.js`: legacy admin detail, overview, lifecycle, deployment, order, receipt, and dashboard operations mix Prisma and JSON-store reads.
- `server/src/services/adminCustomerOversightService.js`: repository-backed for DB reads, but still imports `readHostingStore` directly because hosting JSON remains authoritative.
- `server/src/services/adminReceiptService.js`: direct Prisma is currently tied to receipt metadata and secure streaming.
- `server/src/routes/payments.routes.js`: direct Prisma and hosting-store reads remain legacy payment-route ownership.

Test-only setup and scripts:

- `server/test/adminCustomers.integration.test.js`: creates a throwaway Prisma client for seeding an isolated SQLite DB.
- `server/test/architecture.test.js`: scans for forbidden Prisma construction/imports.
- Scripts with standalone clients: `scripts/manage-orders.mjs`, `scripts/set-admin-user.mjs`, `scripts/seed-dev-user.mjs`, `scripts/restore-admin.mjs`.

## Hosting and Web-Hosting Persistence

- JSON hosting store is read and mutated through `server/src/services/hostingStore.js`.
- Current JSON-store consumers include admin service, billing service, deployment services, hosting/domain/environment/disk services, plan/ownership middleware, payments routes, and deployment engines.
- `WebHostingService` relational rows exist and are read by customer oversight as a dual-read partner. They are not authoritative yet.
- Customer services compare JSON deployments and relational rows and emit `HOSTING_DUAL_SOURCE_MISMATCH` warnings when relational rows have no matching JSON deployment.

## Freeze Coverage

Baseline before test edits:

- Command: `npm test`
- Result: 57 tests passed, 0 failed.

Compatibility tests present or added:

- Old `/api/admin/users/:userId` endpoint: `old admin endpoints are preserved`.
- New customer overview endpoint: `overview returns every section for one customer`.
- Existing admin lifecycle actions: `existing admin user lifecycle actions are preserved`.
- Customer isolation: `cross-customer isolation: no foreign services or tickets leak`.
- Architecture boundary: `architecture.test.js` verifies customer oversight controller/service do not import Prisma or `db.js`.

Post-freeze verification after test/doc work:

- Command: `npm test`
- Result: 58 tests passed, 0 failed.

## Acceptance Status

- Audit document completed.
- Current route contracts recorded.
- Existing tests run once before edits.
- Compatibility coverage updated without production code changes.
- Production code unchanged in this step.
