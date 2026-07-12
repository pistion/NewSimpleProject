# Target Architecture

## Single source of truth
```text
Customer-facing features
        ↓
Existing operational database
        ↑
Admin repositories
        ↑
Admin customer oversight service
        ↑
Admin controllers and routes
        ↑
Admin dashboard
```

## Backend layering
```text
Route
→ Middleware
→ Controller
→ Application service
→ Repository
→ Shared db.js
→ Prisma
→ SQLite
```

## Responsibilities
- Routes: URLs and middleware only.
- Middleware: auth, role, permission, MFA, request context.
- Controllers: HTTP parsing and responses.
- Services: orchestration, aggregation, normalization and rules.
- Repositories: Prisma queries and short local transactions.
- Provider adapters: external API communication only.

## Suggested modules
```text
server/src/admin/
├── controllers/adminCustomer.controller.js
├── services/adminCustomerOversight.service.js
├── dto/
│   ├── adminCustomer.dto.js
│   ├── adminService.dto.js
│   ├── adminBilling.dto.js
│   └── adminActivity.dto.js
└── repositories/
    ├── customer.repository.js
    ├── clientProject.repository.js
    ├── billing.repository.js
    ├── ticket.repository.js
    ├── notification.repository.js
    ├── audit.repository.js
    └── health.repository.js
```

Reuse existing repositories such as `vps.repository.js`, `serviceAccess.repository.js` and `providerResource.repository.js`.
