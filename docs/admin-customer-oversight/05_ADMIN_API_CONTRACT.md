# Admin API Contract

## Unified overview
```text
GET /api/admin/customers/:userId/overview
```

## Response shape
```json
{
  "customer": {},
  "summary": {
    "projects": 0,
    "services": 0,
    "activeServices": 0,
    "failedServices": 0,
    "suspendedServices": 0,
    "openTickets": 0,
    "urgentTickets": 0,
    "pendingOrders": 0,
    "pendingReceipts": 0,
    "outstandingAmountCents": 0,
    "currency": "PGK",
    "warnings": 0
  },
  "projects": [],
  "services": [],
  "billing": {
    "orders": [],
    "receipts": [],
    "subscriptions": [],
    "invoices": [],
    "creditNotes": [],
    "paymentMethods": []
  },
  "support": {
    "tickets": [],
    "serviceRequests": []
  },
  "operations": {
    "providerResources": [],
    "healthChecks": [],
    "incidents": [],
    "watchdogEvents": []
  },
  "activity": [],
  "warnings": []
}
```

## Security
Every endpoint requires authentication, admin role and appropriate permission. Sensitive writes require MFA.

## Stable error format
```json
{
  "error": {
    "code": "ADMIN_CUSTOMER_NOT_FOUND",
    "message": "Customer not found."
  },
  "requestId": ""
}
```

## Partial failures
Optional section failures should produce section warnings rather than failing the entire overview.
