# Admin Customer Oversight — Implementation Pack

## Purpose
Guide Claude Code through a complete cleanup of the admin dashboard customer-oversight architecture.

The goal is not to create a second admin database or duplicate customer data. The existing operational database remains the single source of truth.

The administrator must be able to open one customer and see:
- account and identity
- projects
- all services
- service access
- billing, receipts, subscriptions and invoices
- tickets and service requests
- notifications
- provider resources
- health checks, warnings and audit history

## Target flow
```text
Admin dashboard
→ Admin route
→ Admin controller
→ Admin customer oversight service
→ Feature repositories
→ Existing shared database client
→ Prisma
→ SQLite
```

## Read order
1. `01_CURRENT_STATE_AND_PROBLEMS.md`
2. `02_TARGET_ARCHITECTURE.md`
3. `03_DATA_RELATIONSHIP_MODEL.md`
4. `04_BACKEND_IMPLEMENTATION_PLAN.md`
5. `05_ADMIN_API_CONTRACT.md`
6. `06_ADMIN_DASHBOARD_UI_PLAN.md`
7. `07_MIGRATION_AND_COMPATIBILITY.md`
8. `08_TESTING_AND_ACCEPTANCE.md`
9. `09_CLAUDE_CODE_MASTER_PROMPT.md`
10. `10_IMPLEMENTATION_CHECKLIST.md`

## Constraints
- Reuse the existing Prisma client and SQLite database.
- Reuse existing repositories where present.
- Do not create a parallel admin backend.
- Do not duplicate customer records for admin.
- Keep provider calls outside transactions.
- Preserve current frontend and API behavior during migration.
