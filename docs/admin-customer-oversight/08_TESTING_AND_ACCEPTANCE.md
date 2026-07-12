# Testing and Acceptance

## Architecture
- admin routes/controllers/services do not import Prisma
- repositories reuse shared db.js
- no second PrismaClient

## Relationships
One customer can load projects, hosting, VPS, domains, email, ServiceAccess, orders, receipts, subscriptions, invoices, tickets, service requests, notifications, provider resources and audit events.

## Ownership
- no cross-customer data leakage
- organization ownership respected
- service resolution follows owned ServiceAccess
- admin access remains admin-gated

## Functional checks
1. sign in as admin
2. list customers
3. open customer detail
4. load all tabs
5. open service detail
6. inspect billing
7. inspect ticket
8. suspend customer
9. verify access changes
10. reactivate customer
11. verify audit entry

## Acceptance
Complete only when:
- one customer page shows all related data
- ServiceAccess acts as the service index
- no second admin database exists
- repository boundaries are enforced
- hosting ownership is relationally represented
- tests and builds pass
