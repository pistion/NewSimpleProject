# Claude Code Master Prompt

You are working inside the local project repository.

The repository already contains the application, Prisma schema, SQLite layer, admin dashboard, customer dashboard, provider integrations and this implementation pack.

Your task is to implement a complete admin customer-oversight relationship layer.

Do not create a second admin database.
Do not duplicate customer, service, billing, ticket or invoice data.
Use the existing operational database as the single source of truth.

The administrator must be able to open one customer and see:
- account
- projects
- hosting
- VPS
- domains
- email
- other services
- ServiceAccess
- orders
- receipts
- subscriptions
- invoices
- tickets
- service requests
- notifications
- provider resources
- health checks
- warnings
- audit history

## Required reading
Read every Markdown file in this pack in numeric order, then verify every instruction against the current code.

## Phase 1 — Read-only scan
Inspect Prisma, db.js, admin backend, current repositories, hosting store, VPS, ServiceAccess, billing, support, notifications, audit, providers, admin frontend, customer frontend and tests.

Produce:
| Concern | Current source | Ownership field | Admin visibility | Problem | Planned fix |
|---|---|---|---|---|---|

Do not edit before reporting the inventory.

## Phase 2 — Preserve foundations
Reuse existing Prisma, SQLite, db.js, auth, permissions, MFA, repositories and provider integrations.

Do not add another ORM, Prisma client, database, copied admin records or parallel backend.

## Phase 3 — Repository boundaries
Required flow:
```text
Route → Middleware → Controller → Service → Repository → db.js → Prisma → SQLite
```

Remove Prisma from admin routes and ordinary admin services.

## Phase 4 — Relationships
Clarify `userId`, `organizationId` and `clientId`.
Use ServiceAccess as the service index.
Resolve every service into one normalized AdminService DTO.

## Phase 5 — Oversight service
Return:
- customer
- summary
- projects
- services
- billing
- support
- operations
- activity
- warnings

Do not silently drop failed sections.

## Phase 6 — Endpoints
Add:
```text
GET /api/admin/customers/:userId/overview
GET /api/admin/customers/:userId/services
GET /api/admin/customers/:userId/billing
GET /api/admin/customers/:userId/support
GET /api/admin/customers/:userId/operations
GET /api/admin/customers/:userId/activity
```

Preserve old endpoints.

## Phase 7 — Hosting migration
Keep the JSON store temporarily.
Repair deployment ownership and relational links.
Backfill hosting records.
Dual-read or dual-write temporarily.
Log mismatches and never silently overwrite conflicts.

## Phase 8 — Admin DTOs
Exclude password hashes, raw file paths, provider secrets, connection passwords and raw provider metadata.

## Phase 9 — Admin UI
Build one customer detail page with:
- Overview
- Services
- Billing
- Support
- Operations
- Activity

Add summary cards, filtering, pagination and section-level errors.

## Phase 10 — Lifecycle consistency
Suspend, reactivate and delete customers consistently across account, ServiceAccess and service types. Use soft deletion and preserve financial/audit history.

## Phase 11 — Validation
Run Prisma format, validate and generate; all tests; frontend build; backend startup; lint if configured.

## Final report
Return:
Files inspected:
Files added:
Files changed:
Files removed:
Repositories added:
Prisma imports removed:
Schema changes:
Backfills:
New endpoints:
Old endpoints preserved:
Admin UI changes:
Tests added:
Tests run:
Tests passing:
Build result:
Known risks:
Deferred work:
Overall readiness:

Begin with a read-only scan.
