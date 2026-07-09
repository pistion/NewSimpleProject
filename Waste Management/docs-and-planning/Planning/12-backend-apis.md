# 12 - Backend APIs Implementation Plan

## Goal

Define the production API surface for the admin monitoring system and customer service features.

The APIs must support:

```txt
admin dashboard reads
admin commands
service access control
ticket/customer service
watchdog monitoring
analytics reporting
customer self-service
```

## API Rules

All admin endpoints require:

```txt
authMiddleware
requireAdmin
```

All customer endpoints require:

```txt
authMiddleware
```

Service-specific customer actions also require:

```txt
requireServiceAccess
```

Never trust client-submitted `userId` for customer endpoints. Use `req.user.id`.

Security requirements from `15-production-hardening.md`:

- apply rate limits to auth, checkout, ticket, analytics, admin mutation, and webhook routes;
- require webhook signature verification before billing/provider updates;
- require MFA for sensitive admin actions once MFA is enabled;
- never expose secrets through config/status APIs.

Middleware fit requirements from `17-main-site-dashboard-middleware-fit.md`:

- classify API requests by security group;
- tag unwanted requests without creating noisy watchdog events;
- escalate repeated/high-threat requests into `WatchdogEvent`;
- create warnings for slow/repeated weak signals;
- protect account, service, admin, provider, and webhook boundaries with route-specific middleware.

## Existing Admin APIs To Keep

Keep and extend:

```txt
GET /api/admin/overview
GET /api/admin/users
GET /api/admin/users/:userId
PATCH /api/admin/users/:userId
POST /api/admin/users/:userId/suspend
POST /api/admin/users/:userId/disable
POST /api/admin/users/:userId/reactivate
POST /api/admin/users/:userId/delete
GET /api/admin/deployments
POST /api/admin/deployments/:deploymentId/mark-paid
POST /api/admin/deployments/:deploymentId/suspend
POST /api/admin/deployments/:deploymentId/reactivate
POST /api/admin/deployments/:deploymentId/approve-billing
POST /api/admin/deployments/:deploymentId/renew-manually
POST /api/admin/deployments/:deploymentId/delete
POST /api/admin/deployments/:deploymentId/render-plan
GET /api/admin/orders
POST /api/admin/orders/:orderId/delete
GET /api/admin/receipts
POST /api/admin/receipts/:receiptId/approve
POST /api/admin/receipts/:receiptId/reject
GET /api/admin/activity
GET /api/admin/config-status
```

## New Admin APIs

### Service Access

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

List filters:

```txt
userId
organizationId
serviceType
accessStatus
billingStatus
adminStatus
search
limit
offset
```

### Services

```txt
GET /api/admin/services
GET /api/admin/services/:serviceType/:serviceId
GET /api/admin/users/:userId/services
```

List response:

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

### Tickets

```txt
GET /api/admin/tickets
GET /api/admin/tickets/:ticketId
POST /api/admin/tickets/:ticketId/messages
PATCH /api/admin/tickets/:ticketId
POST /api/admin/tickets/:ticketId/assign
POST /api/admin/tickets/:ticketId/resolve
POST /api/admin/tickets/:ticketId/close
GET /api/admin/users/:userId/tickets
```

### Admin Commands

```txt
GET /api/admin/commands
GET /api/admin/commands/:commandId
GET /api/admin/users/:userId/commands
GET /api/admin/services/:serviceType/:serviceId/commands
```

### Billing Providers, Payment Methods, And Discounts

```txt
GET /api/admin/billing/providers/status
GET /api/admin/payment-methods
GET /api/admin/users/:userId/payment-methods
GET /api/admin/discounts
POST /api/admin/discounts
GET /api/admin/discounts/:discountId
PATCH /api/admin/discounts/:discountId
POST /api/admin/discounts/:discountId/pause
POST /api/admin/discounts/:discountId/revoke
GET /api/admin/discounts/:discountId/redemptions
```

Rules:

- Payment method APIs return safe display fields only: provider, brand, last4, expiry, status, default flag.
- Discount create/update/revoke requires admin auth and writes `AdminCommand` plus `AuditLog`.
- Provider status endpoints must not expose secrets.

### Invoices, Taxes, And Billing Documents

```txt
GET /api/admin/invoices
GET /api/admin/invoices/:invoiceId
POST /api/admin/invoices/:invoiceId/send
GET /api/admin/invoices/:invoiceId/download
GET /api/admin/credit-notes
GET /api/admin/tax-rates
POST /api/admin/tax-rates
PATCH /api/admin/tax-rates/:taxRateId
GET /api/v1/invoices
GET /api/v1/invoices/:invoiceId/download
```

Rules:

- Customers can only access their own invoices.
- Invoice downloads must not expose raw filesystem paths.
- Credit notes/refunds require billing permission.

### Customer Lifecycle, Health, And Reporting

```txt
GET /api/admin/onboarding/summary
GET /api/admin/users/:userId/lifecycle
GET /api/admin/service-health
GET /api/admin/incidents
POST /api/admin/incidents
PATCH /api/admin/incidents/:incidentId
POST /api/admin/incidents/:incidentId/updates
GET /api/admin/maintenance
POST /api/admin/maintenance
GET /api/status
GET /api/admin/reports
POST /api/admin/exports
GET /api/admin/exports
GET /api/admin/exports/:exportId/download
```

Rules:

- Public status endpoint shows only customer-visible incidents/maintenance.
- Export downloads require the same permission as export creation.
- Export files must expire and scrub secrets.

### System Observability

```txt
GET /health
GET /health/ready
GET /api/admin/system/health
GET /api/admin/system/errors
GET /api/admin/system/metrics
```

Rules:

- Public health endpoints return minimal status.
- Admin system endpoints require admin permission and must scrub secrets.

### Provider Integrations And Job Runs

```txt
GET /api/admin/providers
GET /api/admin/providers/:providerKey/status
POST /api/admin/providers/:providerKey/sync
GET /api/admin/providers/:providerKey/sync-runs
GET /api/admin/jobs
GET /api/admin/jobs/:jobKey/runs
POST /api/admin/jobs/:jobKey/run
```

Rules:

- Provider APIs show status, health, sync timing, and failure summaries only.
- Provider APIs must not expose provider secrets or raw credentials.
- Manual job runs require admin permission and create `AdminCommand`/`AuditLog` where appropriate.

### Notifications

```txt
GET /api/admin/notifications
POST /api/admin/notifications/:notificationId/read
POST /api/admin/notifications/:notificationId/dismiss
GET /api/admin/users/:userId/notifications
GET /api/v1/notifications
POST /api/v1/notifications/:notificationId/read
```

Rules:

- Customers can only read their own notifications.
- Admin notification lists can filter by audience, severity, read state, user, service, ticket, or watchdog event.
- Notification APIs must not expose internal admin notes to customers.

### Permissions And Retention

```txt
GET /api/admin/permissions/me
GET /api/admin/permissions/roles
GET /api/admin/retention/policies
PATCH /api/admin/retention/policies/:policyKey
POST /api/admin/retention/run-cleanup
```

Rules:

- Permission APIs return the current admin's effective abilities.
- Retention policy updates require super-admin permission in v1.
- Retention cleanup must be logged and should not hard-delete audit/payment proof.

### Admin Policies / Instruction Data

```txt
GET /api/admin/policies
GET /api/admin/policies/:policyKey
PATCH /api/admin/policies/:policyKey
GET /api/admin/policies/categories/:category
```

Rules:

- Policy updates require admin auth.
- Policy updates must write `AuditLog`.
- Public/customer APIs must not expose internal policies.
- Service middleware may read enabled policies server-side.

### Watchdog

```txt
GET /api/admin/watchdog/events
GET /api/admin/watchdog/events/:eventId
POST /api/admin/watchdog/events/:eventId/review
POST /api/admin/watchdog/events/:eventId/dismiss
POST /api/admin/watchdog/events/:eventId/escalate
POST /api/admin/watchdog/run-scan
GET /api/admin/users/:userId/watchdog-events
```

### Warnings

```txt
GET /api/admin/warnings
GET /api/admin/warnings/summary
GET /api/admin/warnings/:warningId
POST /api/admin/warnings/:warningId/dismiss
POST /api/admin/warnings/:warningId/escalate
```

Rules:

- Warnings are for slow/repeated weak signals.
- Escalating a warning can create a `WatchdogEvent`.
- Warning APIs require admin auth.
- Warning records must not expose raw secrets, auth headers, or private customer data.

### Analytics

```txt
GET /api/admin/analytics/summary
GET /api/admin/analytics/events
GET /api/admin/users/:userId/analytics
GET /api/admin/services/:serviceType/:serviceId/analytics
```

### Admin Notes

```txt
GET /api/admin/users/:userId/notes
POST /api/admin/users/:userId/notes
GET /api/admin/services/:serviceType/:serviceId/notes
POST /api/admin/services/:serviceType/:serviceId/notes
```

## Customer APIs

### Customer Service List

```txt
GET /api/v1/services
GET /api/v1/service-access
```

Returns only current user's records.

### Tickets

```txt
GET /api/v1/tickets
POST /api/v1/tickets
GET /api/v1/tickets/:ticketId
POST /api/v1/tickets/:ticketId/messages
POST /api/v1/tickets/:ticketId/close
```

### Analytics

```txt
POST /api/v1/analytics/events
```

### Billing

Keep existing billing/payment endpoints and add only if needed:

```txt
GET /api/v1/billing/profile
PATCH /api/v1/billing/profile
GET /api/v1/billing/orders
GET /api/v1/billing/receipts
GET /api/v1/billing/payment-methods
```

## Error Shape

All APIs should return consistent error shape:

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_ACCESS_DENIED",
    "message": "This service is not active."
  },
  "requestId": "req_x"
}
```

Use existing response helper style where possible.

## Response Shape

Use:

```json
{
  "data": {},
  "requestId": "req_x"
}
```

For lists:

```json
{
  "data": {
    "items": [],
    "summary": {},
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 0
    }
  },
  "requestId": "req_x"
}
```

Where existing endpoints currently return raw arrays, keep compatibility until dashboard API client is updated.

## Implementation Steps

1. Add service modules first: service access, tickets, admin commands, watchdog, analytics, notes.
2. Add route files for each module.
3. Mount admin routes under `/api/admin`.
4. Mount customer routes under `/api/v1`.
5. Update dashboard API client.
6. Update main app API client for customer ticket/services endpoints.
7. Add tests for permission boundaries.

## Acceptance Criteria

- Admin APIs reject non-admin users.
- Customer APIs return only current user's data.
- Service APIs expose unified service data.
- Ticket APIs work for customer and admin.
- Admin command/watchdog/analytics APIs are readable by dashboard.
- Error responses are consistent.
