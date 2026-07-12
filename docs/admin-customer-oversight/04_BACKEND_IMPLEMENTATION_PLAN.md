# Backend Implementation Plan

## Phase 1 — Inventory
Scan admin routes, services, middleware, Prisma schema, hosting store, service tables, billing tables, tickets, ServiceAccess, admin UI and tests.

Produce:
| Concern | Current source | Relationship field | Problem | Planned fix |
|---|---|---|---|---|

Do not edit before this inventory.

## Phase 2 — Freeze current contracts
Document and preserve current endpoints:
- `/api/admin/overview`
- `/api/admin/users`
- `/api/admin/users/:userId`
- `/api/admin/deployments`
- `/api/admin/orders`
- `/api/admin/receipts`
- `/api/admin/tickets`
- `/api/admin/service-access`

## Phase 3 — Add repositories
Create only needed repositories:
- customer
- client projects
- billing
- tickets and service requests
- notifications
- audit
- health and operations

Reuse existing VPS, ServiceAccess and provider-resource repositories.

## Phase 4 — Build service resolver
Start from ServiceAccess and normalize each service:
```json
{
  "id": "",
  "serviceType": "",
  "serviceName": "",
  "status": "",
  "providerStatus": "",
  "accessStatus": "",
  "billingStatus": "",
  "adminStatus": "",
  "provider": "",
  "plan": "",
  "price": {},
  "expiresAt": null
}
```

## Phase 5 — Customer oversight service
Create `adminCustomerOversight.service.js` to load:
1. customer
2. projects
3. ServiceAccess
4. resolved services
5. billing
6. support
7. operations
8. activity
9. summary

Use parallel reads where safe. Return section warnings instead of silently dropping failed sections.

## Phase 6 — Unified endpoints
Add:
```text
GET /api/admin/customers/:userId/overview
GET /api/admin/customers/:userId/services
GET /api/admin/customers/:userId/billing
GET /api/admin/customers/:userId/support
GET /api/admin/customers/:userId/operations
GET /api/admin/customers/:userId/activity
```

## Phase 7 — Hosting relationship migration
Do not delete the JSON store immediately.

Ensure every deployment has:
- deploymentId
- userId
- organizationId
- ServiceAccess
- checkoutOrderId
- provider service ID
- service status
- billing status

Backfill relational records, dual-read or dual-write temporarily, and log mismatches.

## Phase 8 — Remove Prisma from admin service
Target:
```text
admin route
→ admin controller
→ admin service
→ repositories
```

## Phase 9 — Normalize statuses
Create stable admin-facing values for service, billing, access and support states.

## Phase 10 — Customer lifecycle
Suspend:
- revoke sessions
- suspend ServiceAccess
- suspend service management
- preserve records
- audit results

Reactivate:
- restore account
- restore valid access
- do not revive deleted/expired resources automatically

Delete:
- soft delete by default
- preserve financial, service and audit history
