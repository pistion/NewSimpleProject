# Current State and Main Problems

## Existing foundations
The project already contains users, projects, VPS, hosting, business services, orders, receipts, subscriptions, invoices, ServiceAccess, tickets, service requests, notifications, audit logs, provider resources, health checks, watchdog events, admin routes, permissions and MFA.

## Current admin coverage
The admin can already access users, deployments, orders, receipts, tickets, service requests, CRM contacts and ServiceAccess, and can suspend, disable, reactivate or delete users and manage deployment billing.

## Main limitation
The current customer detail only combines:
```text
User
├── hosting deployments
├── checkout orders
├── receipts
└── simple totals
```

It does not yet combine:
- projects
- VPS
- web hosting records
- domains and email services
- ServiceAccess
- subscriptions and invoices
- tickets and service requests
- notifications
- provider resources
- health checks
- audit and watchdog history

## Data split
Hosting deployments still come from a JSON store while most other records come from Prisma. This weakens relationships and forces manual joins.

## Architectural problems
1. Admin routes and services directly import Prisma.
2. Customer detail is incomplete.
3. Many relationships are plain string IDs.
4. `userId`, `organizationId` and `clientId` are not clearly unified.
5. ServiceAccess is not yet the master service index.
6. Hosting is not fully relational.
7. Admin UI sections are disconnected lists.
8. Customer lifecycle actions are inconsistent across service types.

## Do not create a second admin database
The correct fix is a relationship and aggregation layer over the existing source-of-truth records.
